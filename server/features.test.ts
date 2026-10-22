import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { getUser, totpFor } from "./auth.js";
import { backupIfDue } from "./backup.js";
import { config } from "./config.js";
import { openDatabase, type DB } from "./db.js";
import { ensureSetupCode } from "./routes/auth.js";
import { purgeTrash } from "./routes/snippets.js";

let db: DB;
let server: http.Server;
let base: string;
let cookie = "";
let recoveryCodes: string[] = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "offcuts-test-"));

async function api(method: string, url: string, body?: unknown, useCookie = true) {
  const res = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", "X-Offcuts": "1", ...(useCookie && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (useCookie && setCookie) cookie = setCookie.split(";")[0]!;
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON, such as a downloaded file.
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: data as any, headers: res.headers };
}

// The app refuses a code that was already used. Tests need several codes within
// one 30-second step, so this clears the record of the last used code first.
function nextCode(): string {
  db.prepare("UPDATE user SET totp_last_step = 0 WHERE id = 1").run();
  const u = getUser(db)!;
  return totpFor(u.totp_secret, u.username).generate();
}

const snippet = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  language: "sql",
  fragments: [{ title: "Q", code: "SELECT 1" }],
  ...extra,
});

beforeAll(async () => {
  config.dataDir = tmp;
  db = openDatabase(":memory:");
  server = createApp(db).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await api("POST", "/api/auth/setup", { setupCode: ensureSetupCode(db), username: "owner", password: "a-long-password" });
  const r = await api("POST", "/api/auth/enroll", { code: nextCode() });
  recoveryCodes = r.body.recoveryCodes;
});

afterAll(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("recovery codes", () => {
  it("gives 10 codes at enrollment", () => {
    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
  });

  it("logs in with a recovery code once", async () => {
    await api("POST", "/api/auth/logout");
    await api("POST", "/api/auth/login", { username: "owner", password: "a-long-password" });
    let r = await api("POST", "/api/auth/totp", { code: recoveryCodes[0]!.toUpperCase() });
    expect(r.body).toEqual({ ok: true, usedRecoveryCode: true, remaining: 9 });

    await api("POST", "/api/auth/logout");
    await api("POST", "/api/auth/login", { username: "owner", password: "a-long-password" });
    r = await api("POST", "/api/auth/totp", { code: recoveryCodes[0] });
    expect(r.status).toBe(401);
    r = await api("POST", "/api/auth/totp", { code: nextCode() });
    expect(r.status).toBe(200);
  });

  it("makes new codes only with an authenticator code", async () => {
    expect((await api("POST", "/api/auth/recovery", { code: "000000" })).status).toBe(400);
    const r = await api("POST", "/api/auth/recovery", { code: nextCode() });
    expect(r.body.recoveryCodes).toHaveLength(10);
    expect((await api("GET", "/api/auth/recovery")).body).toEqual({ remaining: 10 });
  });
});

describe("trash", () => {
  let id = 0;

  it("moves a deleted snippet to the trash and hides it everywhere", async () => {
    id = (await api("POST", "/api/snippets", snippet("Trash me", { isPublic: true, tags: ["gone"] }))).body.id;
    expect((await api("DELETE", `/api/snippets/${id}`)).status).toBe(204);
    expect((await api("GET", `/api/snippets/${id}`)).status).toBe(404);
    expect((await api("GET", "/api/snippets?q=Trash")).body).toEqual([]);
    expect((await api("GET", "/api/snippets", undefined, false)).body).toEqual([]);
    expect((await api("GET", "/api/tags")).body).toEqual([]);
    const trash = (await api("GET", "/api/trash")).body;
    expect(trash.days).toBe(30);
    expect(trash.snippets.map((s: { title: string }) => s.title)).toEqual(["Trash me"]);
  });

  it("restores from the trash", async () => {
    expect((await api("POST", `/api/trash/${id}/restore`)).status).toBe(204);
    expect((await api("GET", `/api/snippets/${id}`)).body.title).toBe("Trash me");
  });

  it("deletes for good, one or all", async () => {
    await api("DELETE", `/api/snippets/${id}`);
    expect((await api("DELETE", `/api/trash/${id}`)).status).toBe(204);
    expect((await api("POST", `/api/trash/${id}/restore`)).status).toBe(404);
    const a = (await api("POST", "/api/snippets", snippet("A"))).body.id;
    const b = (await api("POST", "/api/snippets", snippet("B"))).body.id;
    await api("DELETE", `/api/snippets/${a}`);
    await api("DELETE", `/api/snippets/${b}`);
    expect((await api("DELETE", "/api/trash")).body).toEqual({ deleted: 2 });
  });

  it("removes items older than 30 days", async () => {
    const old = (await api("POST", "/api/snippets", snippet("Old"))).body.id;
    const recent = (await api("POST", "/api/snippets", snippet("Recent"))).body.id;
    await api("DELETE", `/api/snippets/${old}`);
    await api("DELETE", `/api/snippets/${recent}`);
    db.prepare("UPDATE snippets SET deleted_at = ? WHERE id = ?").run(new Date(Date.now() - 31 * 86400_000).toISOString(), old);
    expect(purgeTrash(db)).toBe(1);
    expect((await api("GET", "/api/trash")).body.snippets.map((s: { title: string }) => s.title)).toEqual(["Recent"]);
    await api("DELETE", "/api/trash");
  });

  it("requires login", async () => {
    expect((await api("GET", "/api/trash", undefined, false)).status).toBe(401);
  });
});

describe("versions", () => {
  it("keeps the old content on each save and restores it", async () => {
    const id = (await api("POST", "/api/snippets", snippet("V1", { description: "first" }))).body.id;
    await api("PUT", `/api/snippets/${id}`, snippet("V2", { description: "second" }));
    await api("PUT", `/api/snippets/${id}`, snippet("V3", { description: "third" }));
    let r = await api("GET", `/api/snippets/${id}/versions`);
    expect(r.body.current.title).toBe("V3");
    expect(r.body.versions.map((v: { snapshot: { title: string } }) => v.snapshot.title)).toEqual(["V2", "V1"]);

    const v1 = r.body.versions[1].id;
    r = await api("POST", `/api/snippets/${id}/versions/${v1}/restore`);
    expect(r.body).toMatchObject({ title: "V1", description: "first" });
    // The restore itself saved V3 as a version, so it can be undone.
    r = await api("GET", `/api/snippets/${id}/versions`);
    expect(r.body.versions.map((v: { snapshot: { title: string } }) => v.snapshot.title)).toEqual(["V3", "V2", "V1"]);
  });

  it("keeps at most 50 versions", async () => {
    const id = (await api("POST", "/api/snippets", snippet("Many"))).body.id;
    for (let i = 0; i < 55; i++) await api("PUT", `/api/snippets/${id}`, snippet(`Many ${i}`));
    expect((await api("GET", `/api/snippets/${id}/versions`)).body.versions).toHaveLength(50);
  });

  it("requires login", async () => {
    expect((await api("GET", "/api/snippets/1/versions", undefined, false)).status).toBe(401);
  });
});

describe("favorites and recently viewed", () => {
  it("lists starred snippets first and filters to them", async () => {
    const z = (await api("POST", "/api/snippets", snippet("ZZZ starred", { isPublic: true }))).body.id;
    const before = (await api("GET", `/api/snippets/${z}`)).body.updatedAt;
    expect((await api("PUT", `/api/snippets/${z}/favorite`, { favorite: true })).body).toEqual({ favorite: true });
    const list = (await api("GET", "/api/snippets?sort=title")).body;
    expect(list[0].title).toBe("ZZZ starred");
    expect(list[0].favorite).toBe(true);
    expect((await api("GET", "/api/snippets?starred=1")).body.map((s: { title: string }) => s.title)).toEqual(["ZZZ starred"]);
    // Starring is not an edit.
    expect((await api("GET", `/api/snippets/${z}`)).body.updatedAt).toBe(before);
    expect((await api("GET", `/api/snippets/${z}/versions`)).body.versions).toHaveLength(0);
    // Visitors do not see the star or the normal order change.
    const pub = (await api("GET", "/api/snippets", undefined, false)).body;
    expect(pub[0].favorite).toBe(false);
  });

  it("records when the owner opens a snippet", async () => {
    const a = (await api("POST", "/api/snippets", snippet("Viewed first"))).body.id;
    const b = (await api("POST", "/api/snippets", snippet("Viewed second"))).body.id;
    await api("GET", `/api/snippets/${a}`);
    await new Promise((r) => setTimeout(r, 5));
    await api("GET", `/api/snippets/${b}`);
    const list = (await api("GET", "/api/snippets?sort=-viewed")).body.filter((s: { favorite: boolean }) => !s.favorite);
    expect(list.slice(0, 2).map((s: { title: string }) => s.title)).toEqual(["Viewed second", "Viewed first"]);
    expect(list[0].viewedAt).toBeTruthy();
  });
});

describe("fragment language", () => {
  it("stores an override, drops one that equals the snippet language, and filters by it", async () => {
    const r = await api("POST", "/api/snippets", {
      title: "Mixed",
      language: "powerfx",
      fragments: [
        { title: "Patch", code: "Patch(Items, Defaults(Items), {Title: \"x\"})" },
        { title: "Flow body", language: "powerautomate", code: "{ \"a\": \"@{triggerBody()}\" }" },
        { title: "Same", language: "powerfx", code: "Set(x, 1)" },
      ],
    });
    expect(r.body.fragments.map((f: { language: string | null }) => f.language)).toEqual([null, "powerautomate", null]);
    const found = (await api("GET", "/api/snippets?language=powerautomate")).body.map((s: { title: string }) => s.title);
    expect(found).toContain("Mixed");
    expect((await api("POST", "/api/snippets", { ...snippet("Bad"), fragments: [{ language: "cobol", code: "" }] })).status).toBe(400);
  });
});

describe("tag management", () => {
  it("renames a tag, merges into an existing tag, and deletes a tag", async () => {
    await api("POST", "/api/snippets", snippet("T1", { tags: ["pbi", "dax"] }));
    await api("POST", "/api/snippets", snippet("T2", { tags: ["pbi", "powerbi"] }));
    await api("POST", "/api/snippets", snippet("T3", { tags: ["old"] }));
    expect((await api("POST", "/api/tags/rename", { from: "pbi", to: "powerbi" })).body.changed).toBe(1);
    const tags = (await api("GET", "/api/tags")).body as { tag: string; count: number }[];
    expect(tags.find((t) => t.tag === "powerbi")?.count).toBe(2);
    expect(tags.find((t) => t.tag === "pbi")).toBeUndefined();
    // A case-only rename works too.
    await api("POST", "/api/tags/rename", { from: "powerbi", to: "PowerBI" });
    expect(((await api("GET", "/api/tags")).body as { tag: string }[]).some((t) => t.tag === "PowerBI")).toBe(true);
    expect((await api("DELETE", "/api/tags/old")).body.changed).toBe(1);
    expect((await api("POST", "/api/tags/rename", { from: "", to: "x" })).status).toBe(400);
    expect((await api("POST", "/api/tags/rename", { from: "a", to: "b" }, false)).status).toBe(401);
  });
});

describe("backups", () => {
  it("makes, lists and downloads a backup", async () => {
    const r = await api("POST", "/api/backups");
    expect(r.status).toBe(201);
    expect(r.body.name).toMatch(/^offcuts-\d{8}-\d{6}\.db$/);
    const list = (await api("GET", "/api/backups")).body;
    expect(list.keep).toBe(14);
    expect(list.backups[0].name).toBe(r.body.name);
    const file = await fetch(`${base}/api/backups/${r.body.name}`, { headers: { Cookie: cookie } });
    const bytes = Buffer.from(await file.arrayBuffer());
    expect(bytes.subarray(0, 15).toString()).toBe("SQLite format 3");
  });

  it("refuses bad names and visitors", async () => {
    expect((await api("GET", "/api/backups/..%2Foffcuts.db")).status).toBe(404);
    expect((await api("GET", "/api/backups", undefined, false)).status).toBe(401);
  });

  it("makes an automatic backup only when the newest is about a day old", async () => {
    expect(await backupIfDue(db)).toBeNull();
    const dir = path.join(tmp, "backups");
    for (const f of fs.readdirSync(dir)) {
      const old = new Date(Date.now() - 25 * 3600_000);
      fs.utimesSync(path.join(dir, f), old, old);
    }
    expect(await backupIfDue(db)).not.toBeNull();
  });

  it("keeps only the newest backups", async () => {
    config.backupKeep = 2;
    for (let i = 0; i < 3; i++) await api("POST", "/api/backups");
    expect((await api("GET", "/api/backups")).body.backups).toHaveLength(2);
    config.backupKeep = 14;
  });
});

describe("settings and formatter", () => {
  let fake: http.Server;
  let lastBody: Record<string, unknown> = {};

  beforeAll(async () => {
    // A fake formatter service that answers like the real ones.
    fake = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        lastBody = JSON.parse(body);
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/dax") {
          const bad = String(lastBody.Dax).includes("((");
          res.end(JSON.stringify(bad ? { formatted: "", errors: [{ line: 0, column: 4, message: "Syntax error" }] } : { formatted: "Total =\r\nSUM ( Sales[Amount] )\r\n", errors: [] }));
        } else if (req.url === "/pq") {
          res.end(JSON.stringify({ success: true, result: "let\n    Source = 1\nin\n    Source", errors: [] }));
        } else {
          res.statusCode = 500;
          res.end("{}");
        }
      });
    });
    fake.listen(0);
    await new Promise((r) => fake.once("listening", r));
    const port = (fake.address() as AddressInfo).port;
    process.env.DAX_FORMATTER_URL = `http://127.0.0.1:${port}/dax`;
    process.env.PQ_FORMATTER_URL = `http://127.0.0.1:${port}/pq`;
  });

  afterAll(() => {
    fake.close();
    delete process.env.DAX_FORMATTER_URL;
    delete process.env.PQ_FORMATTER_URL;
  });

  it("is off by default", async () => {
    expect((await api("GET", "/api/settings")).body).toEqual({ externalFormatters: false });
    expect((await api("POST", "/api/format", { language: "dax", code: "x" })).status).toBe(403);
  });

  it("formats DAX and Power Query when turned on", async () => {
    expect((await api("PUT", "/api/settings", { externalFormatters: true })).body).toEqual({ externalFormatters: true });
    let r = await api("POST", "/api/format", { language: "dax", code: "Total = SUM(Sales[Amount])" });
    expect(r.body).toEqual({ code: "Total =\nSUM ( Sales[Amount] )" });
    expect(lastBody.Dax).toBe("Total = SUM(Sales[Amount])");
    r = await api("POST", "/api/format", { language: "powerquery", code: "let Source = 1 in Source" });
    expect(r.body.code).toBe("let\n    Source = 1\nin\n    Source");
  });

  it("passes on the service's error, and refuses other languages", async () => {
    let r = await api("POST", "/api/format", { language: "dax", code: "Total = SUM((" });
    expect(r.status).toBe(502);
    expect(r.body.error).toBe("DAX Formatter found a problem. Line 1: Syntax error");
    r = await api("POST", "/api/format", { language: "sql", code: "SELECT 1" });
    expect(r.status).toBe(400);
  });

  it("explains when the service cannot be reached", async () => {
    process.env.DAX_FORMATTER_URL = "http://127.0.0.1:1/dax";
    const r = await api("POST", "/api/format", { language: "dax", code: "x = 1" });
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/did not answer/);
  });
});
