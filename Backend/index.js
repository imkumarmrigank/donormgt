const { onRequest } = require("firebase-functions/v2/https");
const functions = require("firebase-functions/v1"); // v1 required for auth background triggers
const app = require("./src/app");
const { env } = require("./src/config/env");
const { db } = require("./src/config/firebase");
const { COLLECTIONS } = require("./src/config/collections");

exports.api = onRequest(
  {
    region: env.functionRegion,
    cors: false,
    timeoutSeconds: 60,
    memory: "512MiB"
  },
  app
);

// Cloud Function trigger to automatically delete Firestore user data when an Auth user is deleted
exports.cleanupUser = functions
  .region(env.functionRegion || "asia-south1")
  .auth.user()
  .onDelete(async (user) => {
    try {
      console.log(`Auth user deleted: ${user.uid}. Cleaning up Firestore...`);
      await db.collection(COLLECTIONS.USERS).doc(user.uid).delete();
      console.log(`Successfully deleted Firestore document for user: ${user.uid}`);
    } catch (error) {
      console.error(`Failed to delete Firestore document for user: ${user.uid}`, error);
    }
  });
