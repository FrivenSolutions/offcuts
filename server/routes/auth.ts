import crypto from "node:crypto";
import { Router } from "express";
import QRCode from "qrcode";
import {
  checkTotp,
  clearFailures,
  createSession,
  destroyAllSessions,
  destroySession,
  getUser,
  hashPassword,
  lockoutSeconds,
  newTotpSecret,
  recordFailure,
  requireAuth,
  sessionStage,
  totpFor,
  upgradeSession,
  validatePassword,
  verifyPassword,
} from "../auth.js";
import type { DB } from "../db.js";

/**
 * A one-time code for first-run setup. The server prints it to the log,
 * so only someone with access to the host or container can claim the app.
 */
let setupCode: string | null = null;

export function ensureSetupCode(db: DB): string | null {
  if (getUser(db)) {
    setupCode = null;
    return null;
  }
  setupCode ??= crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  return setupCode;
}

function codesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function authRoutes(db: DB): Router {
  const r = Router();

  r.get("/status", (req, res) => {
    const user = getUser(db);
    const stage = sessionStage(db, req);
    res.json({
      setupRequired: !user,
      stage,
      username: stage === "full" ? user?.username : undefined,
    });
  });

  r.post("/setup", async (req, res) => {
    if (getUser(db)) {
      res.status(409).json({ error: "Setup is already complete." });
      return;
    }
    const wait = lockoutSeconds(req);
    if (wait > 0) {
      res.status(429).json({ error: `Too many attempts. Try again in ${wait} seconds.` });
      return;
    }
    const { setupCode: code, username, password } = req.body ?? {};
    if (typeof code !== "string" || !setupCode || !codesMatch(code.trim(), setupCode)) {
      recordFailure(req);
      res.status(403).json({ error: "The setup code is not correct. Find it in the server log." });
      return;
    }
    if (typeof username !== "string" || !/^[\w.@-]{3,64}$/.test(username)) {
      res.status(400).json({ error: "Username must have 3 to 64 letters, digits, or . _ @ -" });
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }
    db.prepare("INSERT INTO user (id, username, password_hash, totp_secret) VALUES (1, ?, ?, ?)").run(
      username,
      await hashPassword(password),
      newTotpSecret(),
    );
    setupCode = null;
    clearFailures(req);
    createSession(db, res, req, "enroll");
    res.json({ ok: true });
  });

  r.get("/enroll", async (req, res) => {
    const user = getUser(db);
    if (!user || sessionStage(db, req) !== "enroll" || user.totp_enabled) {
      res.status(403).json({ error: "Enrollment is not available." });
      return;
    }
    const uri = totpFor(user.totp_secret, user.username).toString();
    res.json({
      secret: user.totp_secret,
      otpauthUrl: uri,
      qrSvg: await QRCode.toString(uri, { type: "svg", margin: 1 }),
    });
  });

  r.post("/enroll", (req, res) => {
    const user = getUser(db);
    if (!user || sessionStage(db, req) !== "enroll" || user.totp_enabled) {
      res.status(403).json({ error: "Enrollment is not available." });
      return;
    }
    if (!checkTotp(db, req.body?.code)) {
      res.status(400).json({ error: "The code is not correct. Check the time on your phone and try again." });
      return;
    }
    db.prepare("UPDATE user SET totp_enabled = 1 WHERE id = 1").run();
    upgradeSession(db, req, res, "full");
    res.json({ ok: true });
  });

  r.post("/login", async (req, res) => {
    const wait = lockoutSeconds(req);
    if (wait > 0) {
      res.status(429).json({ error: `Too many attempts. Try again in ${wait} seconds.` });
      return;
    }
    const user = getUser(db);
    const { username, password } = req.body ?? {};
    const ok =
      !!user &&
      typeof username === "string" &&
      typeof password === "string" &&
      username.toLowerCase() === user.username.toLowerCase() &&
      (await verifyPassword(password, user.password_hash));
    if (!ok) {
      recordFailure(req);
      res.status(401).json({ error: "Username or password is not correct." });
      return;
    }
    upgradeSession(db, req, res, user.totp_enabled ? "totp" : "enroll");
    res.json({ next: user.totp_enabled ? "totp" : "enroll" });
  });

  r.post("/totp", (req, res) => {
    const wait = lockoutSeconds(req);
    if (wait > 0) {
      res.status(429).json({ error: `Too many attempts. Try again in ${wait} seconds.` });
      return;
    }
    if (sessionStage(db, req) !== "totp") {
      res.status(403).json({ error: "Log in with your password first." });
      return;
    }
    if (!checkTotp(db, req.body?.code)) {
      recordFailure(req);
      res.status(401).json({ error: "The code is not correct." });
      return;
    }
    clearFailures(req);
    upgradeSession(db, req, res, "full");
    res.json({ ok: true });
  });

  r.post("/logout", (req, res) => {
    destroySession(db, req, res);
    res.json({ ok: true });
  });

  r.post("/password", requireAuth, async (req, res) => {
    const user = getUser(db)!;
    const { currentPassword, newPassword, code } = req.body ?? {};
    if (typeof currentPassword !== "string" || !(await verifyPassword(currentPassword, user.password_hash))) {
      res.status(400).json({ error: "The current password is not correct." });
      return;
    }
    const pwError = validatePassword(newPassword);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }
    if (!checkTotp(db, code)) {
      res.status(400).json({ error: "The authenticator code is not correct." });
      return;
    }
    db.prepare("UPDATE user SET password_hash = ? WHERE id = 1").run(await hashPassword(newPassword));
    // Log out every other device.
    destroyAllSessions(db);
    createSession(db, res, req, "full");
    res.json({ ok: true });
  });

  return r;
}
