import path from "node:path";

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (value === undefined || value === "") return "loopback, linklocal, uniquelocal";
  if (value === "true") return true;
  if (value === "false") return false;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
  // Express "trust proxy" setting. The default trusts private networks,
  // which suits a reverse proxy on the same LAN or Docker network.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // "auto" sets the Secure cookie flag only when the request came in over HTTPS.
  cookieSecure: (process.env.COOKIE_SECURE ?? "auto") as "auto" | "true" | "false",
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  appName: process.env.APP_NAME ?? "Offcuts",
};
