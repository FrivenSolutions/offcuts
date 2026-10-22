// Recovery commands. Run them on the host or inside the container:
//   npm run cli -- reset-totp
//   npm run cli -- reset-password <new password>
//   npm run cli -- reset-all
import { clearRecoveryCodes, destroyAllSessions, getUser, hashPassword, newTotpSecret, validatePassword } from "./auth.js";
import { openDatabase } from "./db.js";

const [command, arg] = process.argv.slice(2);
const db = openDatabase();

async function main(): Promise<number> {
  const user = getUser(db);
  switch (command) {
    case "reset-totp":
      if (!user) return fail("No account exists yet.");
      db.prepare("UPDATE user SET totp_secret = ?, totp_enabled = 0, totp_last_step = 0 WHERE id = 1").run(newTotpSecret());
      clearRecoveryCodes(db);
      destroyAllSessions(db);
      console.log("Two-factor login is reset. Log in with your password to scan a new QR code.");
      return 0;
    case "reset-password": {
      if (!user) return fail("No account exists yet.");
      const error = validatePassword(arg);
      if (error) return fail(error);
      db.prepare("UPDATE user SET password_hash = ? WHERE id = 1").run(await hashPassword(arg!));
      destroyAllSessions(db);
      console.log(`The password for "${user.username}" is changed. All sessions are logged out.`);
      return 0;
    }
    case "reset-all":
      db.prepare("DELETE FROM user").run();
      clearRecoveryCodes(db);
      destroyAllSessions(db);
      console.log("The account is removed. Snippets are kept. Restart the server to get a new setup code.");
      return 0;
    default:
      console.log("Commands: reset-totp | reset-password <new password> | reset-all");
      return command ? 1 : 0;
  }
}

function fail(message: string): number {
  console.error(message);
  return 1;
}

main().then((code) => {
  db.close();
  process.exit(code);
});
