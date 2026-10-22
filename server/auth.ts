import crypto from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import * as OTPAuth from "otpauth";
import { config } from "./config.js";
import type { DB } from "./db.js";

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

export const SESSION_COOKIE = "offcuts_session";

// ---------- Passwords ----------

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return crypto.timingSafeEqual(expected, actual);
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 10) return "Password must have at least 10 characters.";
  if (password.length > 256) return "Password is too long.";
  return null;
}

// ---------- TOTP ----------

export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function totpFor(secret: string, username: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: config.appName,
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/**
 * Checks a TOTP code and blocks reuse of a code that already worked.
 * Returns true and records the time step when the code is valid.
 */
export function checkTotp(db: DB, code: unknown): boolean {
  if (typeof code !== "string" || !/^\d{6}$/.test(code.replace(/\s/g, ""))) return false;
  const user = getUser(db);
  if (!user) return false;
  const totp = totpFor(user.totp_secret, user.username);
  const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
  if (delta === null) return false;
  const step = Math.floor(Date.now() / 1000 / 30) + delta;
  if (step <= user.totp_last_step) return false;
  db.prepare("UPDATE user SET totp_last_step = ? WHERE id = 1").run(step);
  return true;
}

// ---------- User ----------

export interface UserRow {
  username: string;
  password_hash: string;
  totp_secret: string;
  totp_enabled: number;
  totp_last_step: number;
}

export function getUser(db: DB): UserRow | undefined {
  return db
    .prepare("SELECT username, password_hash, totp_secret, totp_enabled, totp_last_step FROM user WHERE id = 1")
    .get() as UserRow | undefined;
}

// ---------- Sessions ----------

// "enroll": password OK, TOTP not set up yet.
// "totp":   password OK, TOTP code still needed.
// "full":   fully logged in.
export type SessionStage = "enroll" | "totp" | "full";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSession(db: DB, res: Response, req: Request, stage: SessionStage): void {
  const token = crypto.randomBytes(32).toString("base64url");
  // A half-finished login only lives for 10 minutes.
  const ttlMs = stage === "full" ? config.sessionDays * 86400_000 : 10 * 60_000;
  db.prepare("INSERT INTO sessions (id, stage, expires_at) VALUES (?, ?, ?)").run(hashToken(token), stage, Date.now() + ttlMs);
  setSessionCookie(req, res, token, ttlMs);
}

export function upgradeSession(db: DB, req: Request, res: Response, stage: SessionStage): void {
  // Issue a new token on each stage change so an old token cannot be reused.
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") db.prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
  createSession(db, res, req, stage);
}

export function destroySession(db: DB, req: Request, res: Response): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") db.prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function destroyAllSessions(db: DB): void {
  db.prepare("DELETE FROM sessions").run();
}

function setSessionCookie(req: Request, res: Response, token: string, ttlMs: number): void {
  const secure = config.cookieSecure === "auto" ? req.secure : config.cookieSecure === "true";
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: ttlMs,
  });
}

export function sessionStage(db: DB, req: Request): SessionStage | null {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string") return null;
  const row = db.prepare("SELECT stage, expires_at FROM sessions WHERE id = ?").get(hashToken(token)) as
    | { stage: SessionStage; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
    return null;
  }
  return row.stage;
}

export function purgeExpiredSessions(db: DB): void {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authed?: boolean;
    }
  }
}

/** Sets req.authed for every request. */
export function loadAuth(db: DB) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.authed = sessionStage(db, req) === "full";
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authed) {
    res.status(401).json({ error: "Login required." });
    return;
  }
  next();
}

// ---------- Brute-force protection ----------

const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 5;
const fails = new Map<string, number[]>();

function recent(key: string): number[] {
  const now = Date.now();
  const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  fails.set(key, list);
  return list;
}

/** Returns the seconds to wait when the client is locked out, or 0. */
export function lockoutSeconds(req: Request): number {
  const list = recent(`ip:${req.ip}`);
  if (list.length < MAX_FAILS) return 0;
  return Math.ceil((list[0]! + WINDOW_MS - Date.now()) / 1000);
}

export function recordFailure(req: Request): void {
  recent(`ip:${req.ip}`).push(Date.now());
}

export function clearFailures(req: Request): void {
  fails.delete(`ip:${req.ip}`);
}

// ---------- Recovery codes ----------

// No 0/o, 1/l/i, so codes are easy to read and type.
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const RECOVERY_COUNT = 10;

function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[\s-]/g, "");
}

/** Replaces all recovery codes with 10 new ones. Returns the codes in plain text, once. */
export function newRecoveryCodes(db: DB): string[] {
  const codes = Array.from({ length: RECOVERY_COUNT }, () => {
    const chars = Array.from({ length: 8 }, () => RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)]);
    return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
  });
  db.transaction(() => {
    db.prepare("DELETE FROM recovery_codes").run();
    const add = db.prepare("INSERT INTO recovery_codes (hash) VALUES (?)");
    for (const c of codes) add.run(hashToken(normalizeRecoveryCode(c)));
  })();
  return codes;
}

/** Uses up a recovery code. Returns true when the code was valid and not used before. */
export function useRecoveryCode(db: DB, code: unknown): boolean {
  if (typeof code !== "string") return false;
  const normal = normalizeRecoveryCode(code);
  if (!/^[a-z0-9]{8}$/.test(normal)) return false;
  const info = db
    .prepare("UPDATE recovery_codes SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE hash = ? AND used_at IS NULL")
    .run(hashToken(normal));
  return info.changes === 1;
}

export function remainingRecoveryCodes(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE used_at IS NULL").get() as { n: number }).n;
}

export function clearRecoveryCodes(db: DB): void {
  db.prepare("DELETE FROM recovery_codes").run();
}
