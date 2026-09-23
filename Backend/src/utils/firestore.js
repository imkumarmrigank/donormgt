const { admin } = require("../config/firebase");

function nowIso() {
  return new Date().toISOString();
}

function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function increment(amount) {
  return admin.firestore.FieldValue.increment(amount);
}

function arrayUnion(value) {
  return admin.firestore.FieldValue.arrayUnion(value);
}

function isTimestamp(value) {
  return value && typeof value.toDate === "function";
}

function normalizeFirestoreValue(value) {
  if (isTimestamp(value)) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.entries(value).reduce((acc, [key, item]) => {
      acc[key] = normalizeFirestoreValue(item);
      return acc;
    }, {});
  }
  return value;
}

function fromDoc(doc) {
  if (!doc.exists) return null;
  return normalizeFirestoreValue({ id: doc.id, ...doc.data() });
}

function fromSnapshot(snapshot) {
  return snapshot.docs.map(fromDoc);
}

function cleanUndefined(input) {
  if (Array.isArray(input)) return input.map(cleanUndefined);
  if (!input || typeof input !== "object") return input;

  return Object.entries(input).reduce((acc, [key, value]) => {
    if (value === undefined) return acc;
    acc[key] = cleanUndefined(value);
    return acc;
  }, {});
}

function auditCreate(user) {
  return {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: user?.uid || "system",
    updatedBy: user?.uid || "system"
  };
}

function auditUpdate(user) {
  return {
    updatedAt: serverTimestamp(),
    updatedBy: user?.uid || "system"
  };
}

module.exports = {
  nowIso,
  serverTimestamp,
  increment,
  arrayUnion,
  fromDoc,
  fromSnapshot,
  normalizeFirestoreValue,
  cleanUndefined,
  auditCreate,
  auditUpdate
};
