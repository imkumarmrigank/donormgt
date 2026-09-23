const { db } = require("../config/firebase");
const { env } = require("../config/env");
const { COLLECTIONS } = require("../config/collections");
const { AppError } = require("../utils/AppError");
const { logger } = require("../config/logger");
const accounts = require("./account.store");

const LOCK_DOC = "adminSetup";

async function isSetupComplete() {
  const lockSnap = await db.collection(COLLECTIONS.SYSTEM_CONFIG).doc(LOCK_DOC).get();
  return lockSnap.exists && lockSnap.data()?.completed === true;
}

async function getSetupStatus() {
  const lockSnap = await db.collection(COLLECTIONS.SYSTEM_CONFIG).doc(LOCK_DOC).get();
  if (!lockSnap.exists || !lockSnap.data()?.completed) {
    return { setupComplete: false };
  }
  return {
    setupComplete: true,
    completedAt: lockSnap.data().completedAt,
    adminEmail: lockSnap.data().adminEmail || "(hidden)"
  };
}

/**
 * Creates (or promotes) the first admin and writes a lock so it can never run again.
 * An existing login with that email is promoted; otherwise one is created with `password`.
 */
async function createFirstAdmin({ email, password, name, completedBy }) {
  if (await isSetupComplete()) {
    throw new AppError(
      "Admin setup has already been completed. Use the admin panel to create new admins.",
      409,
      "SETUP_ALREADY_COMPLETE"
    );
  }

  let account = await accounts.findByEmail(email);
  if (!account) {
    if (!password) throw new AppError("password is required to create the admin login", 422, "PASSWORD_REQUIRED");
    account = await accounts.createAccount({ email, password });
  }

  const now = new Date().toISOString();
  await db.collection(COLLECTIONS.USERS).doc(account.uid).set({
    id: account.uid,
    uid: account.uid,
    email: account.email,
    name: name || "Administrator",
    phone: "",
    role: "admin",
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: "system:setup",
    updatedBy: "system:setup"
  }, { merge: true });

  await db.collection(COLLECTIONS.SYSTEM_CONFIG).doc(LOCK_DOC).set({
    completed: true,
    adminUid: account.uid,
    adminEmail: account.email,
    completedAt: now,
    completedBy
  });

  logger.info(`First admin setup complete for ${account.email}`);
  return {
    uid: account.uid,
    email: account.email,
    name: name || "Administrator",
    role: "admin",
    setupComplete: true,
    message: "Admin setup complete. Sign in with this email and password."
  };
}

/** One-time HTTP setup, protected by ADMIN_SETUP_SECRET. */
async function setupFirstAdmin({ setupSecret, email, password, name }) {
  if (!env.adminSetupSecret || env.adminSetupSecret === "change-me-to-a-strong-secret-key") {
    throw new AppError(
      "ADMIN_SETUP_SECRET is not configured. Set a strong secret before running setup.",
      500,
      "SETUP_NOT_CONFIGURED"
    );
  }
  if (setupSecret !== env.adminSetupSecret) {
    throw new AppError("Invalid setup secret", 403, "INVALID_SETUP_SECRET");
  }
  return createFirstAdmin({ email, password, name, completedBy: "api:setup-first-admin" });
}

/** On boot: if ADMIN_EMAIL/ADMIN_PASSWORD are set and no admin exists yet, create one. */
async function bootstrapAdminFromEnv() {
  if (!env.bootstrapAdminEmail || !env.bootstrapAdminPassword) return;
  if (await isSetupComplete()) return;
  await createFirstAdmin({
    email: env.bootstrapAdminEmail,
    password: env.bootstrapAdminPassword,
    name: env.bootstrapAdminName,
    completedBy: "env:ADMIN_EMAIL"
  });
}

module.exports = {
  isSetupComplete,
  getSetupStatus,
  setupFirstAdmin,
  bootstrapAdminFromEnv
};
