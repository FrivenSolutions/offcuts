import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { DB } from "./db.js";

export interface BackupInfo {
  name: string;
  size: number;
  createdAt: string;
}

const NAME = /^offcuts-\d{8}-\d{6}\.db$/;
const DAY_MS = 24 * 60 * 60_000;

export function backupDir(): string {
  return path.join(config.dataDir, "backups");
}

export function isBackupName(name: string): boolean {
  return NAME.test(name);
}

/** Lists backups, newest first. */
export function listBackups(): BackupInfo[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(isBackupName)
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Copies the live database to the backups folder, then removes the oldest copies over the limit. */
export async function createBackup(db: DB): Promise<BackupInfo> {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  let name = `offcuts-${stamp()}.db`;
  // Two backups in the same second would share a name. Wait for the next second.
  while (fs.existsSync(path.join(dir, name))) {
    await new Promise((r) => setTimeout(r, 250));
    name = `offcuts-${stamp()}.db`;
  }
  const tmp = path.join(dir, `${name}.partial`);
  // SQLite's online backup makes a consistent copy while the app keeps running.
  await db.backup(tmp);
  fs.renameSync(tmp, path.join(dir, name));
  const keep = Math.max(config.backupKeep, 1);
  for (const old of listBackups().slice(keep)) fs.rmSync(path.join(dir, old.name), { force: true });
  return listBackups().find((b) => b.name === name)!;
}

/** Makes a backup when automatic backups are on and the newest one is about a day old. */
export async function backupIfDue(db: DB): Promise<BackupInfo | null> {
  if (config.backupKeep <= 0) return null;
  const newest = listBackups()[0];
  if (newest && Date.now() - Date.parse(newest.createdAt) < DAY_MS - 30 * 60_000) return null;
  return createBackup(db);
}
