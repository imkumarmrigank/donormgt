const path = require("path");
require("dotenv").config();

function list(value, fallback = []) {
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const nodeEnv = process.env.NODE_ENV || "development";

const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: number(process.env.PORT, 5001),
  apiPrefix: process.env.API_PREFIX || "/api/v1",
  corsOrigins: list(process.env.CORS_ORIGINS, ["http://localhost:5173"]),
  databaseUrl: process.env.DATABASE_URL || "",
  databasePoolSize: number(process.env.DATABASE_POOL_SIZE, 10),
  jwtSecret: process.env.JWT_SECRET || (nodeEnv === "production" ? "" : "dev-only-insecure-secret"),
  accessTokenTtlSeconds: number(process.env.ACCESS_TOKEN_TTL_SECONDS, 3600),
  refreshTokenTtlDays: number(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
  cloudinaryUrl: process.env.CLOUDINARY_URL || "",
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER || "donormgt",
  signedUrlTtlMinutes: number(process.env.SIGNED_URL_TTL_MINUTES, 15),
  maxUploadMb: number(process.env.MAX_UPLOAD_MB, 8),
  adminSetupSecret: process.env.ADMIN_SETUP_SECRET || "",
  bootstrapAdminEmail: process.env.ADMIN_EMAIL || "",
  bootstrapAdminPassword: process.env.ADMIN_PASSWORD || "",
  bootstrapAdminName: process.env.ADMIN_NAME || "Administrator",
  frontendDist: path.resolve(process.env.FRONTEND_DIST || path.join(__dirname, "..", "..", "..", "Frontend", "dist"))
};

module.exports = { env };
