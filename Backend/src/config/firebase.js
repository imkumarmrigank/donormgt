const admin = require("firebase-admin");
const { env } = require("./env");
const { logger } = require("./logger");

function parseServiceAccount() {
  if (env.firebaseServiceAccountBase64) {
    return JSON.parse(Buffer.from(env.firebaseServiceAccountBase64, "base64").toString("utf8"));
  }

  if (env.firebaseClientEmail && env.firebasePrivateKey && env.firebaseProjectId) {
    return {
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey.replace(/\\n/g, "\n")
    };
  }

  return null;
}

function buildAppOptions() {
  const serviceAccount = parseServiceAccount();
  const inferredBucket =
    env.firebaseStorageBucket ||
    (env.firebaseProjectId ? `${env.firebaseProjectId}.appspot.com` : undefined);
  const options = {
    ...(env.firebaseProjectId ? { projectId: env.firebaseProjectId } : {}),
    ...(inferredBucket ? { storageBucket: inferredBucket } : {})
  };

  if (serviceAccount) {
    return {
      ...options,
      credential: admin.credential.cert(serviceAccount)
    };
  }

  return {
    ...options,
    credential: admin.credential.applicationDefault()
  };
}

if (!admin.apps.length) {
  admin.initializeApp(buildAppOptions());
  logger.info("Firebase Admin initialized");
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const auth = admin.auth();
const storage = admin.storage();

function getBucket() {
  const projectId =
    env.firebaseProjectId ||
    admin.app().options.projectId ||
    admin.app().options.credential?.projectId ||
    undefined;

  const bucketName =
    env.firebaseStorageBucket ||
    admin.app().options.storageBucket ||
    (projectId ? `${projectId}.appspot.com` : undefined);

  return bucketName ? storage.bucket(String(bucketName)) : storage.bucket();
}

module.exports = {
  admin,
  db,
  auth,
  storage,
  getBucket
};
