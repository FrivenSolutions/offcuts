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
}

interface FragmentRow {
  id: number;
  title: string;
  code: string;
}

interface SnippetInput {
  title: string;
  description: string;
  source: string;
  language: string;
  isPublic: boolean;
  tags: string[];
  fragments: { title: string; code: string }[];
}

interface Timestamps {
  createdAt?: string;
  updatedAt?: string;
}

type DuplicateMode = "skip" | "replace" | "keep";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const MAX_IMPORT = 10_000;

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
};

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

export function parseSnippetInput(body: unknown): SnippetInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const language = str(b.language, 40, "Language", true);
  if (!isLanguageId(language)) throw new Error("Language is not supported.");

  if (!Array.isArray(b.tags ?? [])) throw new Error("Tags must be a list.");
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of (b.tags ?? []) as unknown[]) {
    const tag = str(t, 40, "Tag").replace(/,/g, "");
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
    return { title: str(fr.title, 200, `Fragment ${i + 1} title`), code };
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

export function snippetRoutes(db: DB): Router {
  const r = Router();

  const fragmentsOf = db.prepare<[number], FragmentRow>(
    "SELECT id, title, code FROM fragments WHERE snippet_id = ? ORDER BY position",
  );
  const tagsOf = db.prepare<[number], { tag: string }>(
    "SELECT tag FROM snippet_tags WHERE snippet_id = ? ORDER BY tag COLLATE NOCASE",
  );

  function visible(req: Request): string {
    return req.authed ? "1 = 1" : "s.is_public = 1";
  }

  function summary(row: SnippetRow) {
    const frags = fragmentsOf.all(row.id);
    const firstCode = frags[0]?.code ?? "";
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      source: row.source,
      language: row.language,
      isPublic: row.is_public === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags: tagsOf.all(row.id).map((t) => t.tag),
      fragmentTitles: frags.map((f) => f.title),
      preview: firstCode.split("\n").slice(0, PREVIEW_LINES).join("\n").slice(0, PREVIEW_CHARS),
      previewTruncated: firstCode.split("\n").length > PREVIEW_LINES || firstCode.length > PREVIEW_CHARS,
    };
  }

  function full(row: SnippetRow) {
    const { preview: _p, previewTruncated: _t, fragmentTitles: _f, ...rest } = summary(row);
    return { ...rest, fragments: fragmentsOf.all(row.id) };
  }

  r.get("/snippets", (req, res) => {
    const where: string[] = [visible(req)];
    const params: unknown[] = [];

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    for (const term of q.split(/\s+/).filter(Boolean).slice(0, 10)) {
      const like = likeEscape(term);
      where.push(`(
        s.title LIKE ? ESCAPE '\\' OR s.description LIKE ? ESCAPE '\\' OR s.source LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM fragments f WHERE f.snippet_id = s.id AND (f.title LIKE ? ESCAPE '\\' OR f.code LIKE ? ESCAPE '\\'))
        OR EXISTS (SELECT 1 FROM snippet_tags t WHERE t.snippet_id = s.id AND t.tag LIKE ? ESCAPE '\\')
      )`);
      params.push(like, like, like, like, like, like);
    }

    const tags = typeof req.query.tags === "string" ? req.query.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    for (const tag of tags.slice(0, 20)) {
      where.push("EXISTS (SELECT 1 FROM snippet_tags t WHERE t.snippet_id = s.id AND t.tag = ?)");
      params.push(tag);
    }

    if (typeof req.query.language === "string" && req.query.language) {
      where.push("s.language = ?");
      params.push(req.query.language);
    }

    if (req.authed && req.query.visibility === "public") where.push("s.is_public = 1");
    if (req.authed && req.query.visibility === "private") where.push("s.is_public = 0");

    const sort = SORTS[typeof req.query.sort === "string" ? req.query.sort : ""] ?? SORTS["title"];
    const rows = db
      .prepare(`SELECT s.* FROM snippets s WHERE ${where.join(" AND ")} ORDER BY ${sort} LIMIT 1000`)
      .all(...params) as SnippetRow[];
    res.json(rows.map(summary));
  });

  r.get("/snippets/:id", (req, res) => {
    const row = db
      .prepare(`SELECT s.* FROM snippets s WHERE s.id = ? AND ${visible(req)}`)
      .get(Number(req.params.id)) as SnippetRow | undefined;
    if (!row) {
      res.status(404).json({ error: "Snippet not found." });
      return;
    }
    res.json(full(row));
  });

  const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

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
      const info = db
        .prepare(
          `UPDATE snippets SET title = ?, description = ?, source = ?, language = ?, is_public = ?,
           created_at = COALESCE(?, created_at), updated_at = COALESCE(?, ${NOW}) WHERE id = ?`,
        )
        .run(
          input.title, input.description, input.source, input.language, input.isPublic ? 1 : 0,
          times.createdAt ?? null, times.updatedAt ?? null, id,
        );
      if (info.changes === 0) return 0;
      snippetId = id;
      db.prepare("DELETE FROM fragments WHERE snippet_id = ?").run(id);
      db.prepare("DELETE FROM snippet_tags WHERE snippet_id = ?").run(id);
    }
    const addFragment = db.prepare("INSERT INTO fragments (snippet_id, position, title, code) VALUES (?, ?, ?, ?)");
    input.fragments.forEach((f, i) => addFragment.run(snippetId, i, f.title, f.code));
    const addTag = db.prepare("INSERT INTO snippet_tags (snippet_id, tag) VALUES (?, ?)");
    input.tags.forEach((t) => addTag.run(snippetId, t));
    return snippetId;
  });

  function getRow(id: number): SnippetRow {
    return db.prepare("SELECT * FROM snippets WHERE id = ?").get(id) as SnippetRow;
  }

  r.post("/snippets", requireAuth, (req, res) => {
    let input: SnippetInput;
    try {
      input = parseSnippetInput(req.body);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
    const id = save(null, input);
    res.status(201).json(full(getRow(id)));
  });

  r.put("/snippets/:id", requireAuth, (req, res) => {
    let input: SnippetInput;
    try {
      input = parseSnippetInput(req.body);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
    const id = save(Number(req.params.id), input);
    if (!id) {
      res.status(404).json({ error: "Snippet not found." });
      return;
    }
    res.json(full(getRow(id)));
  });

  r.delete("/snippets/:id", requireAuth, (req, res) => {
    const info = db.prepare("DELETE FROM snippets WHERE id = ?").run(Number(req.params.id));
    res.status(info.changes ? 204 : 404).end();
  });

  r.get("/tags", (req, res) => {
    const rows = db
      .prepare(
        `SELECT t.tag AS tag, COUNT(*) AS count FROM snippet_tags t JOIN snippets s ON s.id = t.snippet_id
         WHERE ${visible(req)} GROUP BY t.tag COLLATE NOCASE ORDER BY t.tag COLLATE NOCASE`,
      )
      .all();
    res.json(rows);
  });

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
      "SELECT id FROM snippets WHERE title = ? COLLATE NOCASE ORDER BY id LIMIT 1",
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
    const rows = db.prepare("SELECT * FROM snippets ORDER BY id").all() as SnippetRow[];
    res.setHeader("Content-Disposition", `attachment; filename="offcuts-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ version: 1, exportedAt: new Date().toISOString(), snippets: rows.map(full) });
  });

  return r;
}
