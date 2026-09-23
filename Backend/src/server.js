const app = require("./app");
const { env } = require("./config/env");
const { logger } = require("./config/logger");

app.listen(env.port, () => {
  logger.info(`FreePathshala API listening on http://localhost:${env.port}${env.apiPrefix}`);
});
