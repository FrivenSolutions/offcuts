import { purgeExpiredSessions } from "./auth.js";
import { backupIfDue } from "./backup.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { openDatabase } from "./db.js";
import { ensureSetupCode } from "./routes/auth.js";
import { purgeTrash } from "./routes/snippets.js";

const db = openDatabase();
const app = createApp(db);

// Hourly upkeep: old sessions, old trash, and the daily backup.
async function upkeep() {
  purgeExpiredSessions(db);
  purgeTrash(db);
  try {
    const made = await backupIfDue(db);
    if (made) console.log(`Backup written: ${made.name}`);
  } catch (e) {
    console.error("Backup failed:", e);
  }
}
void upkeep();
setInterval(() => void upkeep(), 60 * 60_000).unref();

const server = app.listen(config.port, config.host, () => {
  console.log(`${config.appName} is listening on http://${config.host}:${config.port}`);
  console.log(`Data directory: ${config.dataDir}`);
  const code = ensureSetupCode(db);
  if (code) {
    console.log("");
    console.log("==============================================");
    console.log(` First-run setup code: ${code}`);
    console.log(" Open the web page and enter this code to");
    console.log(" create your account.");
    console.log("==============================================");
    console.log("");
  }
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
