#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────
 *  FreePathshala – One-Time First-Admin Setup Script
 * ─────────────────────────────────────────────────────────────
 *
 * Usage:
 *   node scripts/setup-first-admin.js <firebase-uid>
 *
 * This script:
 *   1. Checks that no admin has been set up yet (reads systemConfig/adminSetup).
 *   2. Verifies the given UID exists in Firebase Auth.
 *   3. Sets { role: "admin" } as a custom claim on the Firebase Auth user.
 *   4. Creates / merges a Firestore document in the "users" collection
 *      with role: "admin".
 *   5. Writes a lock document to systemConfig/adminSetup so it can
 *      never be run again.
 *
 * Prerequisites:
 *   - The .env file must have valid Firebase credentials
 *     (GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT_BASE64,
 *      or individual FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY).
 *   - The target user must already exist in Firebase Authentication
 *     (created via the Firebase Console or firebase auth:import).
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const { auth, db } = require("../src/config/firebase");
const { COLLECTIONS } = require("../src/config/collections");
const { logger } = require("../src/config/logger");

const LOCK_DOC = "adminSetup";

async function main() {
  const uid = process.argv[2];

  if (!uid) {
    console.error("\n  ✖ Usage: node scripts/setup-first-admin.js <firebase-uid>\n");
    console.error("    You can find the UID in the Firebase Console → Authentication → Users.\n");
    process.exit(1);
  }

  // ── 1. Check lock ──────────────────────────────────────────
  logger.info("Checking if admin has already been set up...");
  const lockRef = db.collection(COLLECTIONS.SYSTEM_CONFIG).doc(LOCK_DOC);
  const lockSnap = await lockRef.get();

  if (lockSnap.exists && lockSnap.data()?.completed) {
    console.error("\n  ✖ Admin has already been set up.");
    console.error(`    First admin UID: ${lockSnap.data().adminUid}`);
    console.error(`    Set up at:       ${lockSnap.data().completedAt}`);
    console.error("\n    To create additional admins, use the admin panel or the");
    console.error("    PATCH /api/v1/auth/users/:uid/role endpoint.\n");
    process.exit(1);
  }

  // ── 2. Verify user exists in Firebase Auth ─────────────────
  logger.info(`Verifying Firebase Auth user: ${uid}`);
  let userRecord;
  try {
    userRecord = await auth.getUser(uid);
  } catch (err) {
    console.error(`\n  ✖ User with UID "${uid}" not found in Firebase Auth.`);
    console.error("    Create the user first via the Firebase Console.\n");
    process.exit(1);
  }

  console.log(`\n  ℹ Found user: ${userRecord.email || "(no email)"}`);
  console.log(`    Display Name: ${userRecord.displayName || "(none)"}`);

  // ── 3. Set custom claims ───────────────────────────────────
  logger.info("Setting custom claims: { role: 'admin' }");
  await auth.setCustomUserClaims(uid, { role: "admin" });

  // ── 4. Upsert Firestore user document ──────────────────────
  logger.info("Upserting Firestore user document...");
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

  // ── 5. Write lock ──────────────────────────────────────────
  logger.info("Writing admin-setup lock...");
  await lockRef.set({
    completed: true,
    adminUid: uid,
    adminEmail: userRecord.email || "",
    completedAt: now,
    completedBy: "scripts/setup-first-admin.js"
  });

  console.log("\n  ✔ First admin set up successfully!");
  console.log(`    UID:   ${uid}`);
  console.log(`    Email: ${userRecord.email || "(none)"}`);
  console.log(`    Role:  admin`);
  console.log("\n    The user must sign out and sign back in for the new");
  console.log("    custom claims to take effect on the ID token.\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("\n  ✖ Unexpected error during admin setup:\n");
  console.error(err);
  process.exit(1);
});
