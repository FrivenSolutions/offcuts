import { purgeExpiredSessions } from "./auth.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { openDatabase } from "./db.js";
import { ensureSetupCode } from "./routes/auth.js";

const db = openDatabase();
const app = createApp(db);

purgeExpiredSessions(db);
setInterval(() => purgeExpiredSessions(db), 60 * 60_000).unref();

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
