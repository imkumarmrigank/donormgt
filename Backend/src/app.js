const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const { env } = require("./config/env");
const { logger } = require("./config/logger");
const apiRoutes = require("./routes");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const { sendSuccess } = require("./utils/response");
const { readTrackerMiddleware } = require("./utils/readTracker");
const { rateLimit } = require("./middleware/rateLimit");
const { cache } = require("./utils/cache");

const app = express();

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "img-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://cdn-icons-png.flaticon.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
      "frame-src": ["'self'", "https://res.cloudinary.com"],
      "object-src": ["'self'", "https://res.cloudinary.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
// Render terminates TLS in front of the app; trust it so req.ip is the client's.
app.set("trust proxy", 1);
app.use(cors((req, callback) => {
  const origin = req.get("origin");
  // The app's own pages (same host) are always allowed; other origins need CORS_ORIGINS.
  const sameOrigin = origin === `${req.protocol}://${req.get("host")}`;
  if (!origin || sameOrigin || env.corsOrigins.includes("*") || env.corsOrigins.includes(origin)) {
    callback(null, { origin: true, credentials: true });
    return;
  }
  callback(new Error("Not allowed by CORS"));
}));
// The built React app is served from the same origin as the API, ahead of the API
// rate limiter so page assets don't use up a user's request budget.
const indexHtml = path.join(env.frontendDist, "index.html");
const hasFrontend = fs.existsSync(indexHtml);
if (hasFrontend) {
  app.use("/assets", express.static(path.join(env.frontendDist, "assets"), { immutable: true, maxAge: "365d" }));
  app.use(express.static(env.frontendDist, { index: false, maxAge: "1h" }));
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
// Firestore read tracking — must be before routes
app.use(readTrackerMiddleware);

// Global rate limiter: 100 requests per minute per IP
app.use(rateLimit({ windowMs: 60_000, maxRequests: 100 }));

app.use(morgan(env.isProduction ? "combined" : "dev", {
  stream: { write: (message) => logger.http(message.trim()) }
}));

app.get(`${env.apiPrefix}/health`, (_req, res) => {
  sendSuccess(res, {
    uptime: process.uptime(),
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    cache: cache.stats(),
  }, "Healthy");
});

app.use(env.apiPrefix, apiRoutes);

if (hasFrontend) {
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(indexHtml));
} else {
  app.get("/", (_req, res) => {
    sendSuccess(res, { name: "FreePathshala API", version: "1.0.0", basePath: env.apiPrefix }, "API is running");
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
