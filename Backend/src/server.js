const app = require("./app");
const { env } = require("./config/env");
const { logger } = require("./config/logger");
const { bootstrapAdminFromEnv } = require("./services/setup.service");

if (env.isProduction && !env.jwtSecret) {
  logger.error("JWT_SECRET must be set in production");
  process.exit(1);
}

app.listen(env.port, () => {
  logger.info(`FreePathshala API listening on http://localhost:${env.port}${env.apiPrefix}`);
});

bootstrapAdminFromEnv().catch((error) => {
  logger.error("Admin bootstrap failed", { error: error.message });
});
