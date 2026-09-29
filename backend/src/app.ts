import fs from "fs";
import path from "path";
import cors from "cors";
import express from "express";
import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { API_PREFIX } from "./constants";
import { requireAuth } from "./middleware/auth";
import { notFound, errorHandler } from "./middleware/errorHandler";
import { requestId } from "./middleware/requestId";
import routes from "./routes";
import { logger } from "./utils/logger";

const app = express();
app.set("etag", false);

app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "no-referrer" },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
app.use(cors({ origin: env.corsOrigin || false, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(pinoHttp({ logger }));

app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

app.use(requestId);

const noopLimiter: RequestHandler = (_req, _res, next) => next();
const testing = Boolean(process.env.VITEST);

const limiter: RequestHandler = testing
  ? noopLimiter
  : rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use("/api", limiter);

const loginLimiter: RequestHandler = testing
  ? noopLimiter
  : rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many login attempts, please try again later" } });
app.use("/api/v1/auth/login", loginLimiter);

app.use(API_PREFIX, routes);

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/api/health", (_req, res) => {
  res.json({ success: true, message: "API is running" });
});

const frontendDist = path.join(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
