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
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT,
  firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY,
  firebaseServiceAccountBase64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY,
  functionRegion: process.env.FUNCTION_REGION || "asia-south1",
  signedUrlTtlMinutes: number(process.env.SIGNED_URL_TTL_MINUTES, 15),
  maxUploadMb: number(process.env.MAX_UPLOAD_MB, 8),
  adminSetupSecret: process.env.ADMIN_SETUP_SECRET || ""
};

module.exports = { env };
