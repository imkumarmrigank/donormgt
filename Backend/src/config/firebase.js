// Firestore-compatible handles backed by Postgres (see src/db/docstore.js).
// Kept under this name so the service layer's imports stay unchanged.
const { db, FieldValue, FieldPath, Timestamp } = require("../db/docstore");

const admin = {
  firestore: {
    FieldValue,
    FieldPath,
    Timestamp
  }
};

module.exports = { admin, db };
