import express, { Router, type Request } from "express";
import { isLanguageId } from "../../shared/languages.js";
import { requireAuth } from "../auth.js";
import type { DB } from "../db.js";

interface SnippetRow {
  id: number;
  title: string;
  description: string;
  source: string;
  language: string;
  is_public: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  favorite: number;
  viewed_at: string | null;
}

interface FragmentRow {
  id: number;
  title: string;
  comment: string;
  language: string | null;
  code: string;
}

export interface SnippetInput {
  title: string;
  description: string;
  source: string;
  language: string;
  isPublic: boolean;
  tags: string[];
  fragments: { title: string; comment: string; language: string | null; code: string }[];
}

interface Timestamps {
  createdAt?: string;
  updatedAt?: string;
}

type DuplicateMode = "skip" | "replace" | "keep";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const MAX_IMPORT = 10_000;
const MAX_VERSIONS = 50;
export const TRASH_DAYS = 30;

/** Keeps the dates from an import file when they are valid ISO dates. */
function importTimestamps(raw: unknown): Timestamps {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pick = (v: unknown) => (typeof v === "string" && ISO_DATE.test(v) ? v : undefined);
  return { createdAt: pick(r.createdAt), updatedAt: pick(r.updatedAt) };
}

const PREVIEW_LINES = 12;
const PREVIEW_CHARS = 1200;

const SORTS: Record<string, string> = {
  title: "s.title COLLATE NOCASE ASC, s.id ASC",
  "-title": "s.title COLLATE NOCASE DESC, s.id DESC",
  updated: "s.updated_at ASC",
  "-updated": "s.updated_at DESC",
  created: "s.created_at ASC",
  "-created": "s.created_at DESC",
  "-viewed": "s.viewed_at IS NULL, s.viewed_at DESC, s.title COLLATE NOCASE ASC",
};

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

function likeEscape(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function str(value: unknown, max: number, field: string, required = false): string {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const v = value.trim();
  if (required && v.length === 0) throw new Error(`${field} is required.`);
  if (v.length > max) throw new Error(`${field} is too long (max ${max} characters).`);
  return v;
}

function cleanTag(value: unknown): string {
  return str(value, 40, "Tag").replace(/,/g, "").replace(/^#/, "").trim();
}

export function parseSnippetInput(body: unknown): SnippetInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const language = str(b.language, 40, "Language", true);
  if (!isLanguageId(language)) throw new Error("Language is not supported.");

  if (!Array.isArray(b.tags ?? [])) throw new Error("Tags must be a list.");
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of (b.tags ?? []) as unknown[]) {
    const tag = cleanTag(t);
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  if (tags.length > 30) throw new Error("A snippet can have at most 30 tags.");

  if (!Array.isArray(b.fragments) || b.fragments.length === 0) throw new Error("A snippet needs at least one fragment.");
  if (b.fragments.length > 100) throw new Error("A snippet can have at most 100 fragments.");
  const fragments = (b.fragments as unknown[]).map((f, i) => {
    const fr = (f ?? {}) as Record<string, unknown>;
    if (fr.code !== undefined && typeof fr.code !== "string") throw new Error(`Fragment ${i + 1} code must be text.`);
    const code = ((fr.code as string | undefined) ?? "").replace(/\r\n/g, "\n");
    if (code.length > 500_000) throw new Error(`Fragment ${i + 1} is too long.`);
    // An empty fragment language means "same as the snippet".
    const fragLanguage = str(fr.language, 40, `Fragment ${i + 1} language`) || null;
    if (fragLanguage && !isLanguageId(fragLanguage)) throw new Error(`Fragment ${i + 1} language is not supported.`);
    return {
      title: str(fr.title, 200, `Fragment ${i + 1} title`),
      comment: str(fr.comment, 5000, `Fragment ${i + 1} comment`),
      language: fragLanguage === language ? null : fragLanguage,
      code,
    };
  });

  return {
    title: str(b.title, 200, "Title", true),
    description: str(b.description, 5000, "Description"),
    source: str(b.source, 2000, "Source"),
    language,
    isPublic: b.isPublic === true,
    tags,
    fragments,
  };
}

/** Removes snippets that have been in the trash longer than the limit. */
export function purgeTrash(db: DB, days = TRASH_DAYS): number {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  return db.prepare("DELETE FROM snippets WHERE deleted_at IS NOT NULL AND deleted_at < ?").run(cutoff).changes;
}

export function snippetRoutes(db: DB): Router {
  const r = Router();

  const fragmentsOf = db.prepare<[number], FragmentRow>(
    "SELECT id, title, comment, language, code FROM fragments WHERE snippet_id = ? ORDER BY position",
  );
  const tagsOf = db.prepare<[number], { tag: string }>(
    "SELECT tag FROM snippet_tags WHERE snippet_id = ? ORDER BY tag COLLATE NOCASE",
  );

  /** SQL condition for snippets this request may see. Snippets in the trash are never visible here. */
  function visible(req: Request): string {
    return req.authed ? "s.deleted_at IS NULL" : "s.deleted_at IS NULL AND s.is_public = 1";
  }

  function summary(row: SnippetRow, authed: boolean) {
    const frags = fragmentsOf.all(row.id);
    const first = frags[0];
    const firstCode = first?.code ?? "";
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      source: row.source,
      language: row.language,
      isPublic: row.is_public === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Personal data. Visitors do not see it.
      favorite: authed && row.favorite === 1,
      viewedAt: authed ? row.viewed_at : null,
      deletedAt: row.deleted_at,
      tags: tagsOf.all(row.id).map((t) => t.tag),
      fragmentTitles: frags.map((f) => f.title),
      previewLanguage: first?.language ?? row.language,
      preview: firstCode.split("\n").slice(0, PREVIEW_LINES).join("\n").slice(0, PREVIEW_CHARS),
      previewTruncated: firstCode.split("\n").length > PREVIEW_LINES || firstCode.length > PREVIEW_CHARS,
    };
  }

  function full(row: SnippetRow, authed: boolean) {
    const { preview: _p, previewTruncated: _t, fragmentTitles: _f, previewLanguage: _l, ...rest } = summary(row, authed);
    return { ...rest, fragments: fragmentsOf.all(row.id) };
  }

  /** The editable content of a snippet, as stored in a version. */
  function snapshot(row: SnippetRow): SnippetInput & { updatedAt: string } {
    return {
      title: row.title,
      description: row.description,
      source: row.source,
      language: row.language,
      isPublic: row.is_public === 1,
      tags: tagsOf.all(row.id).map((t) => t.tag),
      fragments: fragmentsOf.all(row.id).map(({ title, comment, language, code }) => ({ title, comment, language, code })),
      updatedAt: row.updated_at,
    };
  }

  function getRow(id: number): SnippetRow | undefined {
    return db.prepare("SELECT * FROM snippets WHERE id = ?").get(id) as SnippetRow | undefined;
  }

  function liveRow(id: number): SnippetRow | undefined {
    return db.prepare("SELECT * FROM snippets WHERE id = ? AND deleted_at IS NULL").get(id) as SnippetRow | undefined;
  }

  r.get("/snippets", (req, res) => {
    const where: string[] = [visible(req)];
    const params: unknown[] = [];

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    for (const term of q.split(/\s+/).filter(Boolean).slice(0, 10)) {
      const like = likeEscape(term);
      where.push(`(
        s.title LIKE ? ESCAPE '\\' OR s.description LIKE ? ESCAPE '\\' OR s.source LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM fragments f WHERE f.snippet_id = s.id AND (f.title LIKE ? ESCAPE '\\' OR f.comment LIKE ? ESCAPE '\\' OR f.code LIKE ? ESCAPE '\\'))
        OR EXISTS (SELECT 1 FROM snippet_tags t WHERE t.snippet_id = s.id AND t.tag LIKE ? ESCAPE '\\')
      )`);
      params.push(like, like, like, like, like, like, like);
    }

    const tags = typeof req.query.tags === "string" ? req.query.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    for (const tag of tags.slice(0, 20)) {
      where.push("EXISTS (SELECT 1 FROM snippet_tags t WHERE t.snippet_id = s.id AND t.tag = ?)");
      params.push(tag);
    }

    if (typeof req.query.language === "string" && req.query.language) {
      where.push("(s.language = ? OR EXISTS (SELECT 1 FROM fragments f WHERE f.snippet_id = s.id AND f.language = ?))");
      params.push(req.query.language, req.query.language);
    }

    if (req.authed && req.query.visibility === "public") where.push("s.is_public = 1");
    if (req.authed && req.query.visibility === "private") where.push("s.is_public = 0");
    if (req.authed && req.query.starred === "1") where.push("s.favorite = 1");

    const sort = SORTS[typeof req.query.sort === "string" ? req.query.sort : ""] ?? SORTS["title"];
    // Starred snippets come first for the owner.
    const order = req.authed ? `s.favorite DESC, ${sort}` : sort;
    const rows = db
      .prepare(`SELECT s.* FROM snippets s WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 1000`)
      .all(...params) as SnippetRow[];
    res.json(rows.map((row) => summary(row, !!req.authed)));
  });

  r.get("/snippets/:id", (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare(`SELECT s.* FROM snippets s WHERE s.id = ? AND ${visible(req)}`).get(id) as SnippetRow | undefined;
    if (!row) {
      res.status(404).json({ error: "Snippet not found." });
      return;
    }
    if (req.authed) {
      db.prepare(`UPDATE snippets SET viewed_at = ${NOW} WHERE id = ?`).run(id);
      row.viewed_at = new Date().toISOString();
    }
    res.json(full(row, !!req.authed));
  });

  const addVersion = db.prepare("INSERT INTO snippet_versions (snippet_id, saved_at, data) VALUES (?, ?, ?)");
  const trimVersions = db.prepare(
    `DELETE FROM snippet_versions WHERE snippet_id = ? AND id NOT IN
     (SELECT id FROM snippet_versions WHERE snippet_id = ? ORDER BY id DESC LIMIT ${MAX_VERSIONS})`,
  );

  const save = db.transaction((id: number | null, input: SnippetInput, times: Timestamps = {}): number => {
    let snippetId: number;
    if (id === null) {
      const info = db
        .prepare(
          `INSERT INTO snippets (title, description, source, language, is_public, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, COALESCE(?, ${NOW}), COALESCE(?, ${NOW}))`,
        )
        .run(
          input.title, input.description, input.source, input.language, input.isPublic ? 1 : 0,
          times.createdAt ?? null, times.updatedAt ?? null,
        );
      snippetId = Number(info.lastInsertRowid);
    } else {
      const before = liveRow(id);
      if (!before) return 0;
      // Keep the old content as a version before it changes.
      const old = snapshot(before);
      addVersion.run(id, old.updatedAt, JSON.stringify(old));
      trimVersions.run(id, id);
      db.prepare(
        `UPDATE snippets SET title = ?, description = ?, source = ?, language = ?, is_public = ?,
         created_at = COALESCE(?, created_at), updated_at = COALESCE(?, ${NOW}) WHERE id = ?`,
      ).run(
        input.title, input.description, input.source, input.language, input.isPublic ? 1 : 0,
        times.createdAt ?? null, times.updatedAt ?? null, id,
      );
      snippetId = id;
      db.prepare("DELETE FROM fragments WHERE snippet_id = ?").run(id);
      db.prepare("DELETE FROM snippet_tags WHERE snippet_id = ?").run(id);
    }
    const addFragment = db.prepare(
      "INSERT INTO fragments (snippet_id, position, title, comment, language, code) VALUES (?, ?, ?, ?, ?, ?)",
    );
    input.fragments.forEach((f, i) => addFragment.run(snippetId, i, f.title, f.comment, f.language, f.code));
    const addTag = db.prepare("INSERT INTO snippet_tags (snippet_id, tag) VALUES (?, ?)");
    input.tags.forEach((t) => addTag.run(snippetId, t));
    return snippetId;
  });

  function parseOr400(body: unknown, res: express.Response): SnippetInput | null {
    try {
      return parseSnippetInput(body);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return null;
    }
  }

  r.post("/snippets", requireAuth, (req, res) => {
    const input = parseOr400(req.body, res);
    if (!input) return;
    const id = save(null, input);
    res.status(201).json(full(getRow(id)!, true));
  });

  r.put("/snippets/:id", requireAuth, (req, res) => {
    const input = parseOr400(req.body, res);
    if (!input) return;
    const id = save(Number(req.params.id), input);
    if (!id) {
      res.status(404).json({ error: "Snippet not found." });
      return;
    }
    res.json(full(getRow(id)!, true));
  });

  // Starring does not change the content, so it makes no version and keeps the updated date.
  r.put("/snippets/:id/favorite", requireAuth, (req, res) => {
    const info = db
      .prepare("UPDATE snippets SET favorite = ? WHERE id = ? AND deleted_at IS NULL")
      .run(req.body?.favorite === true ? 1 : 0, Number(req.params.id));
    if (!info.changes) {
      res.status(404).json({ error: "Snippet not found." });
      return;
    }
    res.json({ favorite: req.body?.favorite === true });
  });

  // Delete moves the snippet to the trash.
  r.delete("/snippets/:id", requireAuth, (req, res) => {
    const info = db
      .prepare(`UPDATE snippets SET deleted_at = ${NOW} WHERE id = ? AND deleted_at IS NULL`)
      .run(Number(req.params.id));
    res.status(info.changes ? 204 : 404).end();
  });

  // ---------- Versions ----------

  r.get("/snippets/:id/versions", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const row = liveRow(id);
    if (!row) {
      res.status(404).json({ error: "Snippet not found." });
      return;
    }
    const versions = db
      .prepare("SELECT id, saved_at, data FROM snippet_versions WHERE snippet_id = ? ORDER BY id DESC")
      .all(id) as { id: number; saved_at: string; data: string }[];
    res.json({
      current: snapshot(row),
      versions: versions.map((v) => ({ id: v.id, savedAt: v.saved_at, snapshot: JSON.parse(v.data) })),
    });
  });

  r.post("/snippets/:id/versions/:versionId/restore", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const v = db
      .prepare("SELECT data FROM snippet_versions WHERE id = ? AND snippet_id = ?")
      .get(Number(req.params.versionId), id) as { data: string } | undefined;
    if (!v || !liveRow(id)) {
      res.status(404).json({ error: "Version not found." });
      return;
    }
    // Restoring saves a new version of the current content first, so a restore can also be undone.
    save(id, parseSnippetInput(JSON.parse(v.data)));
    res.json(full(getRow(id)!, true));
  });

  // ---------- Trash ----------

  r.get("/trash", requireAuth, (_req, res) => {
    const rows = db
      .prepare("SELECT s.* FROM snippets s WHERE s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC")
      .all() as SnippetRow[];
    res.json({ days: TRASH_DAYS, snippets: rows.map((row) => summary(row, true)) });
  });

  r.post("/trash/:id/restore", requireAuth, (req, res) => {
    const info = db
      .prepare("UPDATE snippets SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL")
      .run(Number(req.params.id));
    res.status(info.changes ? 204 : 404).end();
  });

  r.delete("/trash/:id", requireAuth, (req, res) => {
    const info = db.prepare("DELETE FROM snippets WHERE id = ? AND deleted_at IS NOT NULL").run(Number(req.params.id));
    res.status(info.changes ? 204 : 404).end();
  });

  r.delete("/trash", requireAuth, (_req, res) => {
    const info = db.prepare("DELETE FROM snippets WHERE deleted_at IS NOT NULL").run();
    res.json({ deleted: info.changes });
  });

  // ---------- Tags ----------

  r.get("/tags", (req, res) => {
    const rows = db
      .prepare(
        `SELECT t.tag AS tag, COUNT(*) AS count FROM snippet_tags t JOIN snippets s ON s.id = t.snippet_id
         WHERE ${visible(req)} GROUP BY t.tag COLLATE NOCASE ORDER BY t.tag COLLATE NOCASE`,
      )
      .all();
    res.json(rows);
  });

  // Renames a tag on every snippet. When the new name already exists, the two tags merge.
  r.post("/tags/rename", requireAuth, (req, res) => {
    let from: string, to: string;
    try {
      from = cleanTag(req.body?.from);
      to = cleanTag(req.body?.to);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
    if (!from || !to) {
      res.status(400).json({ error: "Give the old and the new tag name." });
      return;
    }
    const changed = db.transaction(() => {
      if (from.toLowerCase() !== to.toLowerCase()) {
        // Snippets that already have the new tag only lose the old one.
        db.prepare(
          "DELETE FROM snippet_tags WHERE tag = ? AND snippet_id IN (SELECT snippet_id FROM snippet_tags WHERE tag = ?)",
        ).run(from, to);
      }
      return db.prepare("UPDATE snippet_tags SET tag = ? WHERE tag = ?").run(to, from).changes;
    })();
    res.json({ changed });
  });

  r.delete("/tags/:tag", requireAuth, (req, res) => {
    const info = db.prepare("DELETE FROM snippet_tags WHERE tag = ?").run(String(req.params.tag));
    res.json({ changed: info.changes });
  });

  // ---------- Import and export ----------

  // Import an Offcuts export file. With dryRun, only checks the file and reports duplicates.
  // The global JSON parser skips this path, so requireAuth runs before a large body is read.
  r.post("/import", requireAuth, express.json({ limit: "50mb" }), (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const list = body.snippets;
    if (!Array.isArray(list)) {
      res.status(400).json({ error: "The file has no list of snippets." });
      return;
    }
    if (list.length > MAX_IMPORT) {
      res.status(400).json({ error: `One import can hold at most ${MAX_IMPORT} snippets.` });
      return;
    }
    const dryRun = body.dryRun === true;
    const mode = body.mode as DuplicateMode;
    if (!dryRun && !["skip", "replace", "keep"].includes(mode)) {
      res.status(400).json({ error: "Choose how to handle duplicate titles." });
      return;
    }

    const findByTitle = db.prepare<[string], { id: number }>(
      "SELECT id FROM snippets WHERE title = ? COLLATE NOCASE AND deleted_at IS NULL ORDER BY id LIMIT 1",
    );
    const valid: { input: SnippetInput; times: Timestamps }[] = [];
    const invalid: { index: number; title: string; error: string }[] = [];
    list.forEach((raw, index) => {
      try {
        valid.push({ input: parseSnippetInput(raw), times: importTimestamps(raw) });
      } catch (e) {
        const t = (raw as { title?: unknown } | null)?.title;
        invalid.push({ index, title: typeof t === "string" && t ? t : `Item ${index + 1}`, error: (e as Error).message });
      }
    });

    if (dryRun) {
      res.json({
        total: list.length,
        valid: valid.length,
        invalid,
        duplicates: valid.filter((v) => findByTitle.get(v.input.title)).map((v) => v.input.title),
      });
      return;
    }

    const result = { created: 0, replaced: 0, skipped: 0, failed: invalid.length };
    db.transaction(() => {
      for (const { input, times } of valid) {
        const existing = mode === "keep" ? undefined : findByTitle.get(input.title);
        if (existing && mode === "skip") {
          result.skipped++;
        } else if (existing) {
          save(existing.id, input, times);
          result.replaced++;
        } else {
          save(null, input, times);
          result.created++;
        }
      }
    })();
    res.json(result);
  });

  r.get("/export", requireAuth, (_req, res) => {
    const rows = db.prepare("SELECT * FROM snippets WHERE deleted_at IS NULL ORDER BY id").all() as SnippetRow[];
    res.setHeader("Content-Disposition", `attachment; filename="offcuts-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ version: 1, exportedAt: new Date().toISOString(), snippets: rows.map((row) => full(row, true)) });
  });

  return r;
}
