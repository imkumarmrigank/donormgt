const { auth, db } = require("../config/firebase");
const { env } = require("../config/env");
const { COLLECTIONS } = require("../config/collections");
const { AppError } = require("../utils/AppError");
const { logger } = require("../config/logger");

const LOCK_DOC = "adminSetup";

/**
 * Check whether the first-admin setup has already been completed.
 */
async function isSetupComplete() {
  const lockSnap = await db.collection(COLLECTIONS.SYSTEM_CONFIG).doc(LOCK_DOC).get();
  return lockSnap.exists && lockSnap.data()?.completed === true;
}

/**
 * Get the setup status (safe to expose publicly so the frontend
 * can show an initial setup screen if needed).
 */
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
 * One-time HTTP-based admin setup.
 *
 * Requires:
 *  - setupSecret: must match env.adminSetupSecret
 *  - uid: the Firebase Auth UID of the user to promote
 *
 * This will:
 *  1. Validate the setup secret.
 *  2. Ensure setup hasn't already been completed.
 *  3. Verify the UID exists in Firebase Auth.
 *  4. Set custom claims { role: "admin" }.
 *  5. Create/merge a Firestore user document with role: "admin".
 *  6. Write the lock document so it can never run again.
 */
async function setupFirstAdmin({ setupSecret, uid }) {
  // ── Validate secret ────────────────────────────────────────
  if (!env.adminSetupSecret || env.adminSetupSecret === "change-me-to-a-strong-secret-key") {
    throw new AppError(
      "ADMIN_SETUP_SECRET is not configured. Set a strong secret in .env before running setup.",
      500,
      "SETUP_NOT_CONFIGURED"
    );
  }

  if (setupSecret !== env.adminSetupSecret) {
    throw new AppError("Invalid setup secret", 403, "INVALID_SETUP_SECRET");
  }

  // ── Check lock ─────────────────────────────────────────────
  const isComplete = await isSetupComplete();
  if (isComplete) {
    throw new AppError(
      "Admin setup has already been completed. Use the admin panel to create new admins.",
      409,
      "SETUP_ALREADY_COMPLETE"
    );
  }

  // ── Verify user exists ─────────────────────────────────────
  let userRecord;
  try {
    userRecord = await auth.getUser(uid);
  } catch (_err) {
    throw new AppError(
      `User with UID "${uid}" not found in Firebase Auth. Create the user first via the Firebase Console.`,
      404,
      "USER_NOT_FOUND"
    );
  }

  // ── Set custom claims ──────────────────────────────────────
  logger.info(`Setting admin custom claims for UID: ${uid}`);
  await auth.setCustomUserClaims(uid, { role: "admin" });

  // ── Upsert Firestore user document ─────────────────────────
  const now = new Date().toISOString();
  await db.collection(COLLECTIONS.USERS).doc(uid).set({
    id: uid,
    uid,
    email: userRecord.email || "",
    name: userRecord.displayName || "",
    phone: userRecord.phoneNumber || "",
    role: "admin",
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: "system:setup",
    updatedBy: "system:setup"
  }, { merge: true });

  // ── Write lock ─────────────────────────────────────────────
  const lockRef = db.collection(COLLECTIONS.SYSTEM_CONFIG).doc(LOCK_DOC);
  await lockRef.set({
    completed: true,
    adminUid: uid,
    adminEmail: userRecord.email || "",
    completedAt: now,
    completedBy: "api:setup-first-admin"
  });

  logger.info(`First admin setup complete for ${userRecord.email || uid}`);

  return {
    uid,
    email: userRecord.email || "",
    name: userRecord.displayName || "",
    role: "admin",
    setupComplete: true,
    message: "Admin setup complete. Sign out and back in for the new role to take effect."
  };
}

module.exports = {
  isSetupComplete,
  getSetupStatus,
  setupFirstAdmin
};
