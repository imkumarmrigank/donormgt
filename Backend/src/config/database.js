const { Pool } = require("pg");
const { env } = require("./env");
const { logger } = require("./logger");

function buildConfig() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not set. Point it at the Neon Postgres connection string.");
  }
  const url = new URL(env.databaseUrl);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  // TLS is configured below; the URL flags would only trigger pg's sslmode warnings.
  url.searchParams.delete("sslmode");
  url.searchParams.delete("channel_binding");
  return {
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: true },
    max: env.databasePoolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000
  };
}

const pool = new Pool(buildConfig());

pool.on("error", (error) => {
  logger.error("Postgres pool error", { error: error.message });
});

module.exports = { pool };
