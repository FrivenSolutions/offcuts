import path from "node:path";
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { backupDir, createBackup, isBackupName, listBackups } from "../backup.js";
import { config } from "../config.js";
import type { DB } from "../db.js";
import { FORMATTABLE, FormatError, formatCode } from "../format.js";
import { readSettings, writeSettings } from "../settings.js";

export function adminRoutes(db: DB): Router {
  const r = Router();
  r.get("/settings", requireAuth, (_req, res) => {
    res.json(readSettings(db));
  });

  r.put("/settings", requireAuth, (req, res) => {
    res.json(writeSettings(db, { externalFormatters: req.body?.externalFormatters }));
  });

  r.post("/format", requireAuth, async (req, res) => {
    if (!readSettings(db).externalFormatters) {
      res.status(403).json({ error: "Outside formatters are off. Turn them on in Settings." });
      return;
    }
    const { language, code } = req.body ?? {};
    if (!FORMATTABLE.includes(language) || typeof code !== "string" || !code.trim()) {
      res.status(400).json({ error: "Give DAX or Power Query M code to format." });
      return;
    }
    if (code.length > 200_000) {
      res.status(400).json({ error: "The code is too long to format." });
      return;
    }
    try {
      res.json({ code: await formatCode(language, code) });
    } catch (e) {
      if (e instanceof FormatError) res.status(502).json({ error: e.message });
      else throw e;
    }
  });

  r.get("/backups", requireAuth, (_req, res) => {
    res.json({ keep: config.backupKeep, backups: listBackups() });
  });

  r.post("/backups", requireAuth, async (_req, res) => {
    res.status(201).json(await createBackup(db));
  });

  r.get("/backups/:name", requireAuth, (req, res) => {
    const name = String(req.params.name);
    if (!isBackupName(name) || !listBackups().some((b) => b.name === name)) {
      res.status(404).json({ error: "Backup not found." });
      return;
    }
    res.download(path.join(backupDir(), name), name);
  });

  return r;
}
