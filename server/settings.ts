import type { DB } from "./db.js";

export interface AppSettings {
  // Allow the editor to send DAX and Power Query code to outside formatter services.
  externalFormatters: boolean;
}

const DEFAULTS: AppSettings = { externalFormatters: false };

export function readSettings(db: DB): AppSettings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { externalFormatters: stored.externalFormatters === "1" || (stored.externalFormatters === undefined && DEFAULTS.externalFormatters) };
}

export function writeSettings(db: DB, patch: Partial<AppSettings>): AppSettings {
  const upsert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  if (typeof patch.externalFormatters === "boolean") upsert.run("externalFormatters", patch.externalFormatters ? "1" : "0");
  return readSettings(db);
}
