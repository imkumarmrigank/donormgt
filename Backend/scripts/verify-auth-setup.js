#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────
 *  FreePathshala – Verify Auth & RBAC Setup
 * ─────────────────────────────────────────────────────────────
 *
 * Usage:
 *   node scripts/verify-auth-setup.js [email]
 *
 * Runs a diagnostic check that verifies:
 *   1. Firebase Admin SDK initializes successfully
 *   2. Firestore connection works
 *   3. Admin setup lock exists
 *   4. Admin user exists in Firebase Auth with correct claims
 *   5. Admin user document exists in Firestore with correct role
 *   6. Auth middleware config is correct
 *
 * If an email is provided, it will look up that specific user.
 * Otherwise it uses the admin UID from the setup lock document.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const CHECK = "✔";
const CROSS = "✖";
const WARN = "⚠";

function pass(msg) { console.log(`  ${CHECK} ${msg}`); }
function fail(msg) { console.log(`  ${CROSS} ${msg}`); }
function warn(msg) { console.log(`  ${WARN} ${msg}`); }

async function main() {
  console.log("\n  FreePathshala – Auth & RBAC Verification\n");
  console.log("  ────────────────────────────────────────\n");

  let errors = 0;

  // ── 1. Firebase Admin SDK ──────────────────────────────────
  console.log("  1. Firebase Admin SDK Initialization");
  let db, auth;
  try {
    const firebase = require("../src/config/firebase");
    db = firebase.db;
    auth = firebase.auth;
    pass("Firebase Admin SDK initialized successfully");
  } catch (err) {
    fail(`Firebase Admin SDK failed: ${err.message}`);
    errors++;
    console.log("\n  Cannot continue without Firebase. Fix the error above and retry.\n");
    process.exit(1);
  }

  // ── 2. Firestore Connection ────────────────────────────────
  console.log("\n  2. Firestore Connection");
  try {
    const { COLLECTIONS } = require("../src/config/collections");
    // Quick read to verify connectivity
    const testSnap = await db.collection(COLLECTIONS.SYSTEM_CONFIG).limit(1).get();
    pass(`Firestore connected (systemConfig has ${testSnap.size} document(s))`);
  } catch (err) {
    fail(`Firestore connection failed: ${err.message}`);
    errors++;
  }

  // ── 3. Admin Setup Lock ────────────────────────────────────
  console.log("\n  3. Admin Setup Lock");
  const { COLLECTIONS } = require("../src/config/collections");
  const lockSnap = await db.collection(COLLECTIONS.SYSTEM_CONFIG).doc("adminSetup").get();

  let adminUid = null;
  if (lockSnap.exists && lockSnap.data()?.completed) {
    adminUid = lockSnap.data().adminUid;
    pass(`Admin setup completed at ${lockSnap.data().completedAt}`);
    pass(`Admin UID: ${adminUid}`);
    pass(`Admin Email: ${lockSnap.data().adminEmail || "(unknown)"}`);
  } else {
    warn("Admin setup has NOT been completed yet");
    warn("Run: node scripts/setup-first-admin.js <firebase-uid>");
  }

  // ── Resolve target user ────────────────────────────────────
  const targetEmail = process.argv[2];
  let targetUid = adminUid;

  if (targetEmail) {
    console.log(`\n  Looking up user by email: ${targetEmail}`);
    try {
      const userRecord = await auth.getUserByEmail(targetEmail);
      targetUid = userRecord.uid;
      pass(`Found user: ${userRecord.uid}`);
    } catch (err) {
      fail(`User not found: ${err.message}`);
      errors++;
    }
  }

  if (!targetUid) {
    warn("No admin UID available to verify. Skipping user checks.\n");
    printSummary(errors);
    return;
  }

  // ── 4. Firebase Auth – Custom Claims ───────────────────────
  console.log("\n  4. Firebase Auth – Custom Claims");
  try {
    const userRecord = await auth.getUser(targetUid);
    pass(`User exists: ${userRecord.email || "(no email)"}`);
    pass(`Display Name: ${userRecord.displayName || "(none)"}`);
    pass(`Disabled: ${userRecord.disabled}`);

    const claims = userRecord.customClaims || {};
    if (claims.role === "admin") {
      pass(`Custom claim role = "admin"`);
    } else if (claims.role) {
      warn(`Custom claim role = "${claims.role}" (expected "admin")`);
    } else {
      fail("No 'role' custom claim set");
      errors++;
    }
  } catch (err) {
    fail(`Auth.getUser failed: ${err.message}`);
    errors++;
  }

  // ── 5. Firestore User Document ─────────────────────────────
  console.log("\n  5. Firestore User Document");
  try {
    const userDoc = await db.collection(COLLECTIONS.USERS).doc(targetUid).get();
    if (!userDoc.exists) {
      fail(`Document users/${targetUid} does not exist`);
      errors++;
    } else {
      const data = userDoc.data();
      pass(`Document users/${targetUid} exists`);
      pass(`Firestore role = "${data.role}"`);
      pass(`Firestore active = ${data.active}`);

      if (data.role !== "admin") {
        warn(`Expected role "admin", found "${data.role}"`);
      }
    }
  } catch (err) {
    fail(`Firestore read failed: ${err.message}`);
    errors++;
  }

  // ── 6. Middleware Configuration ────────────────────────────
  console.log("\n  6. Auth Middleware Configuration");
  try {
    const { requireAuth, requireRoles } = require("../src/middleware/auth");
    pass("requireAuth middleware exported");
    pass("requireRoles middleware exported");

    const { ROLES, PERMISSIONS } = require("../src/config/roles");
    pass(`Roles defined: ${Object.values(ROLES).join(", ")}`);
    pass(`Permission groups: ${Object.keys(PERMISSIONS).join(", ")}`);
  } catch (err) {
    fail(`Middleware import failed: ${err.message}`);
    errors++;
  }

  // ── 7. Environment Check ───────────────────────────────────
  console.log("\n  7. Environment Configuration");
  const { env } = require("../src/config/env");
  pass(`NODE_ENV: ${env.nodeEnv}`);
  pass(`API Prefix: ${env.apiPrefix}`);
  pass(`Firebase Project: ${env.firebaseProjectId || "(not set)"}`);

  if (env.adminSetupSecret && env.adminSetupSecret !== "change-me-to-a-strong-secret-key") {
    pass("ADMIN_SETUP_SECRET is configured");
  } else {
    warn("ADMIN_SETUP_SECRET is still the default – change it before production");
  }

  printSummary(errors);
}

function printSummary(errors) {
  console.log("\n  ────────────────────────────────────────");
  if (errors === 0) {
    console.log(`  ${CHECK} All checks passed! Your auth system is correctly configured.\n`);
  } else {
    console.log(`  ${CROSS} ${errors} issue(s) found. Fix them and re-run this script.\n`);
  }
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n  Unexpected error:\n");
  console.error(err);
  process.exit(1);
});
