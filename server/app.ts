import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import { loadAuth } from "./auth.js";
import { config } from "./config.js";
import type { DB } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { snippetRoutes } from "./routes/snippets.js";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

export function createApp(db: DB) {
  const app = express();
  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    next();
  });

  app.use(cookieParser());
  const json = express.json({ limit: "10mb" });
  // The import route reads its own, larger body after it checks the login.
  app.use((req, res, next) => (req.path === "/api/import" ? next() : json(req, res, next)));

  // Blocks CSRF (cross-site request forgery). Other sites cannot add a custom
  // header to a request without the server's permission, and this server never gives it.
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("X-Offcuts") !== "1") {
      res.status(403).json({ error: "Missing X-Offcuts header." });
      return;
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", loadAuth(db));
  app.use("/api/auth", authRoutes(db));
  app.use("/api", snippetRoutes(db));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: false, maxAge: "1h" }));
    const indexHtml = path.join(publicDir, "index.html");
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(indexHtml);
    });
  }

  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === "entity.parse.failed") {
      res.status(400).json({ error: "The request body is not valid JSON." });
      return;
    }
    if (err.type === "entity.too.large") {
      res.status(413).json({ error: "The request is too large." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Server error." });
  });

  return app;
}
