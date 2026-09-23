const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const { env } = require("./config/env");
const { logger } = require("./config/logger");
const apiRoutes = require("./routes");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const { sendSuccess } = require("./utils/response");
const { readTrackerMiddleware, getDailyReadCount } = require("./utils/readTracker");
const { rateLimit } = require("./middleware/rateLimit");
const { cache } = require("./utils/cache");

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes("*") || env.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
// Firestore read tracking — must be before routes
app.use(readTrackerMiddleware);

// Global rate limiter: 100 requests per minute per IP
app.use(rateLimit({ windowMs: 60_000, maxRequests: 100 }));

app.use(morgan(env.isProduction ? "combined" : "dev", {
  stream: { write: (message) => logger.http(message.trim()) }
}));

app.get("/", (_req, res) => {
  sendSuccess(res, {
    name: "FreePathshala API",
    version: "1.0.0",
    basePath: env.apiPrefix
  }, "API is running");
});

app.get(`${env.apiPrefix}/health`, (_req, res) => {
  sendSuccess(res, {
    uptime: process.uptime(),
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    firestoreReads: getDailyReadCount(),
    cache: cache.stats(),
  }, "Healthy");
});

app.use(env.apiPrefix, apiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
