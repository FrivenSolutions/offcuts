import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { getUser, totpFor } from "./auth.js";
import { openDatabase, type DB } from "./db.js";
import { ensureSetupCode } from "./routes/auth.js";

let db: DB;
let server: Server;
let base: string;
let cookie = "";

async function api(method: string, path: string, body?: unknown, useCookie = true) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Offcuts": "1",
      ...(useCookie && cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (useCookie && setCookie) cookie = setCookie.split(";")[0]!;
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function code(offsetSteps = 0): string {
  const user = getUser(db)!;
  return totpFor(user.totp_secret, user.username).generate({ timestamp: Date.now() + offsetSteps * 30_000 });
}

beforeAll(async () => {
  db = openDatabase(":memory:");
  server = createApp(db).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  db.close();
});

describe("auth flow", () => {
  it("requires setup on first run", async () => {
    const r = await api("GET", "/api/auth/status");
    expect(r.body.setupRequired).toBe(true);
  });

  it("rejects setup without the correct setup code", async () => {
    ensureSetupCode(db);
    const r = await api("POST", "/api/auth/setup", { setupCode: "nope", username: "justin", password: "a-long-password" });
    expect(r.status).toBe(403);
  });

  it("sets up the account and enrolls TOTP", async () => {
    const setupCode = ensureSetupCode(db)!;
    let r = await api("POST", "/api/auth/setup", { setupCode, username: "justin", password: "a-long-password" });
    expect(r.status).toBe(200);
    r = await api("GET", "/api/auth/enroll");
    expect(r.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    r = await api("POST", "/api/auth/enroll", { code: "000000" });
    expect(r.status).toBe(400);
    r = await api("POST", "/api/auth/enroll", { code: code() });
    expect(r.status).toBe(200);
    r = await api("GET", "/api/auth/status");
    expect(r.body).toMatchObject({ setupRequired: false, stage: "full", username: "justin" });
  });

  it("blocks a second setup", async () => {
    const r = await api("POST", "/api/auth/setup", { setupCode: "123456", username: "x", password: "a-long-password" }, false);
    expect(r.status).toBe(409);
  });

  it("logs in with password and TOTP, and blocks code reuse", async () => {
    await api("POST", "/api/auth/logout");
    let r = await api("POST", "/api/auth/login", { username: "justin", password: "wrong-password" });
    expect(r.status).toBe(401);
    r = await api("POST", "/api/auth/login", { username: "Justin", password: "a-long-password" });
    expect(r.body.next).toBe("totp");
    // Password alone must not give access.
    r = await api("POST", "/api/snippets", { title: "x", language: "sql", fragments: [{ code: "" }] });
    expect(r.status).toBe(401);
    // The code from enrollment was already used.
    r = await api("POST", "/api/auth/totp", { code: code() });
    expect(r.body).toEqual({ error: "The code is not correct." });
    r = await api("POST", "/api/auth/totp", { code: code(1) });
    expect(r.status).toBe(200);
  });

  it("rejects writes without the CSRF header", async () => {
    const res = await fetch(base + "/api/auth/logout", { method: "POST", headers: { Cookie: cookie } });
    expect(res.status).toBe(403);
  });
});

describe("snippets", () => {
  let publicId = 0;

  it("creates public and private snippets", async () => {
    let r = await api("POST", "/api/snippets", {
      title: "REST API Patches",
      source: "https://learn.microsoft.com/sharepoint/dev",
      language: "powerautomate",
      isPublic: true,
      tags: ["sharepoint", "http", "SharePoint"],
      fragments: [
        { title: "Lookup", code: `{ "ProjectId": @{triggerBody()?['ID']} }` },
        { title: "People Picker", code: `{ "OwnerId": @{outputs('Get_user')?['body/Id']} }` },
        { title: "Choice", code: `{ "Status": "Active" }` },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.tags).toEqual(["http", "sharepoint"]);
    expect(r.body.fragments.map((f: { title: string }) => f.title)).toEqual(["Lookup", "People Picker", "Choice"]);
    publicId = r.body.id;

    r = await api("POST", "/api/snippets", {
      title: "Secret measure",
      language: "dax",
      tags: ["finance"],
      fragments: [{ title: "Margin", code: "Margin = DIVIDE([Profit], [Sales])" }],
    });
    expect(r.status).toBe(201);
  });

  it("rejects an unknown language", async () => {
    const r = await api("POST", "/api/snippets", { title: "x", language: "cobol", fragments: [{ code: "" }] });
    expect(r.status).toBe(400);
  });

  it("shows only public snippets to visitors", async () => {
    let r = await api("GET", "/api/snippets", undefined, false);
    expect(r.body.map((s: { title: string }) => s.title)).toEqual(["REST API Patches"]);
    r = await api("GET", "/api/tags", undefined, false);
    expect(r.body.map((t: { tag: string }) => t.tag)).toEqual(["http", "sharepoint"]);
    r = await api("GET", "/api/snippets", undefined, true);
    expect(r.body).toHaveLength(2);
  });

  it("hides a private snippet from visitors", async () => {
    const list = await api("GET", "/api/snippets?q=Secret");
    const id = list.body[0].id;
    expect((await api("GET", `/api/snippets/${id}`, undefined, false)).status).toBe(404);
    expect((await api("GET", `/api/snippets/${id}`)).status).toBe(200);
  });

  it("searches inside code and fragment titles, and filters by tag", async () => {
    expect((await api("GET", "/api/snippets?q=triggerBody")).body).toHaveLength(1);
    expect((await api("GET", "/api/snippets?q=people%20picker")).body).toHaveLength(1);
    expect((await api("GET", "/api/snippets?q=100%25")).body).toHaveLength(0);
    expect((await api("GET", "/api/snippets?tags=finance")).body[0].title).toBe("Secret measure");
    expect((await api("GET", "/api/snippets?language=dax")).body).toHaveLength(1);
    const sorted = await api("GET", "/api/snippets?sort=-title");
    expect(sorted.body.map((s: { title: string }) => s.title)).toEqual(["Secret measure", "REST API Patches"]);
  });

  it("updates and deletes", async () => {
    let r = await api("PUT", `/api/snippets/${publicId}`, {
      title: "REST API Patches",
      language: "powerautomate",
      isPublic: false,
      tags: [],
      fragments: [{ title: "Only one", code: "{}" }],
    });
    expect(r.body.fragments).toHaveLength(1);
    expect((await api("GET", "/api/snippets", undefined, false)).body).toHaveLength(0);
    r = await api("DELETE", `/api/snippets/${publicId}`);
    expect(r.status).toBe(204);
  });
});

describe("import", () => {
  const file = {
    version: 1,
    snippets: [
      {
        title: "secret MEASURE",
        description: "Imported copy",
        language: "dax",
        tags: ["finance"],
        createdAt: "2023-05-01T10:00:00.000Z",
        updatedAt: "2023-06-01T10:00:00.000Z",
        fragments: [{ title: "Margin", code: "Margin = DIVIDE([Profit], [Revenue])" }],
      },
      { title: "Brand new", language: "sql", fragments: [{ title: "", code: "SELECT 1" }] },
      { title: "Bad language", language: "cobol", fragments: [{ code: "" }] },
    ],
  };

  async function countByTitle(title: string): Promise<number> {
    const list = (await api("GET", `/api/snippets?q=${encodeURIComponent(title)}`)).body as { title: string }[];
    return list.filter((s) => s.title.toLowerCase() === title.toLowerCase()).length;
  }

  it("requires login", async () => {
    const r = await api("POST", "/api/import", { ...file, dryRun: true }, false);
    expect(r.status).toBe(401);
  });

  it("checks the file without saving on a dry run", async () => {
    const r = await api("POST", "/api/import", { ...file, dryRun: true });
    expect(r.body).toMatchObject({ total: 3, valid: 2, duplicates: ["secret MEASURE"] });
    expect(r.body.invalid).toEqual([{ index: 2, title: "Bad language", error: "Language is not supported." }]);
    expect(await countByTitle("Brand new")).toBe(0);
  });

  it("needs a duplicate mode for a real import", async () => {
    expect((await api("POST", "/api/import", file)).status).toBe(400);
  });

  it("skips duplicates", async () => {
    const r = await api("POST", "/api/import", { ...file, mode: "skip" });
    expect(r.body).toEqual({ created: 1, replaced: 0, skipped: 1, failed: 1 });
    expect(await countByTitle("Secret measure")).toBe(1);
  });

  it("replaces duplicates and keeps the file's dates", async () => {
    const r = await api("POST", "/api/import", { ...file, mode: "replace" });
    expect(r.body).toEqual({ created: 0, replaced: 2, skipped: 0, failed: 1 });
    const [s] = (await api("GET", "/api/snippets?q=Imported")).body;
    expect(s).toMatchObject({ title: "secret MEASURE", description: "Imported copy", createdAt: "2023-05-01T10:00:00.000Z" });
    expect(await countByTitle("Brand new")).toBe(1);
  });

  it("keeps both copies", async () => {
    const r = await api("POST", "/api/import", { ...file, mode: "keep" });
    expect(r.body).toEqual({ created: 2, replaced: 0, skipped: 0, failed: 1 });
    expect(await countByTitle("Brand new")).toBe(2);
  });

  it("reads back its own export", async () => {
    const before = (await api("GET", "/api/snippets")).body.length;
    const exported = (await api("GET", "/api/export")).body;
    const r = await api("POST", "/api/import", { snippets: exported.snippets, mode: "keep" });
    expect(r.body.created).toBe(before);
    expect((await api("GET", "/api/snippets")).body.length).toBe(before * 2);
  });
});

describe("fragment comments", () => {
  it("saves, returns and searches comments", async () => {
    const r = await api("POST", "/api/snippets", {
      title: "Commented",
      language: "powerfx",
      fragments: [
        { title: "Lookup", comment: "Use the ID column.\nSee https://example.com/docs", code: "LookUp(Items, ID = 1)" },
        { title: "Choice", code: "{ Value: \"Open\" }" },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.fragments.map((f: { comment: string }) => f.comment)).toEqual(["Use the ID column.\nSee https://example.com/docs", ""]);
    const found = (await api("GET", "/api/snippets?q=column.")).body as { title: string }[];
    expect(found.map((s) => s.title)).toEqual(["Commented"]);
  });

  it("rejects a comment that is too long", async () => {
    const r = await api("POST", "/api/snippets", {
      title: "Too long",
      language: "sql",
      fragments: [{ comment: "x".repeat(5001), code: "" }],
    });
    expect(r.status).toBe(400);
  });
});

describe("database upgrade", () => {
  it("adds the comment column to an existing database and keeps its data", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "offcuts-"));
    const file = path.join(dir, "old.db");
    // Make a database that looks like version 1.
    let old = openDatabase(file);
    old.exec("ALTER TABLE fragments DROP COLUMN comment; PRAGMA user_version = 1;");
    old.prepare("INSERT INTO snippets (id, title, language) VALUES (1, 'Old', 'sql')").run();
    old.prepare("INSERT INTO fragments (snippet_id, position, title, code) VALUES (1, 0, 'Q', 'SELECT 1')").run();
    old.close();

    const upgraded = openDatabase(file);
    expect(upgraded.pragma("user_version", { simple: true })).toBe(2);
    expect(upgraded.prepare("SELECT title, comment, code FROM fragments").get()).toEqual({ title: "Q", comment: "", code: "SELECT 1" });
    upgraded.close();
    fs.rmSync(dir, { recursive: true });
  });
});
