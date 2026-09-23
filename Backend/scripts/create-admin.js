#!/usr/bin/env node
/**
 * Creates the first admin login (once). Afterwards, add users from User Management.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' [ADMIN_NAME='...'] node scripts/create-admin.js
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const { env } = require("../src/config/env");
const { pool } = require("../src/config/database");
const { bootstrapAdminFromEnv, isSetupComplete } = require("../src/services/setup.service");

async function main() {
  if (!env.bootstrapAdminEmail || !env.bootstrapAdminPassword) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD");
  }
  if (await isSetupComplete()) {
    console.log("An admin was already set up; nothing to do.");
    return;
  }
  await bootstrapAdminFromEnv();
  console.log(`Admin ${env.bootstrapAdminEmail} created.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
