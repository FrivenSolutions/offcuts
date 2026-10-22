import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

const MIGRATIONS: string[] = [
  `
  CREATE TABLE user (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret TEXT NOT NULL,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    totp_last_step INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    stage TEXT NOT NULL CHECK (stage IN ('enroll', 'totp', 'full')),
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE snippets (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL,
    is_public INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE fragments (
    id INTEGER PRIMARY KEY,
    snippet_id INTEGER NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX fragments_snippet ON fragments(snippet_id, position);

  CREATE TABLE snippet_tags (
    snippet_id INTEGER NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
    tag TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (snippet_id, tag)
  );
  CREATE INDEX snippet_tags_tag ON snippet_tags(tag);
  `,
];

export type DB = Database.Database;

export function openDatabase(file = path.join(config.dataDir, "offcuts.db")): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return db;
}
