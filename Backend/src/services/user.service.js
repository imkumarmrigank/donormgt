const { db } = require("../config/firebase");
const accounts = require("./account.store");
const { COLLECTIONS } = require("../config/collections");
const { logger } = require("../config/logger");
const { AppError } = require("../utils/AppError");
const { fromDoc, fromSnapshot, auditCreate, auditUpdate } = require("../utils/firestore");
const { fetchCursorPage, listPayload } = require("../utils/query");
const { cache } = require("../utils/cache");

function usersCollection() {
  return db.collection(COLLECTIONS.USERS);
}

async function listUsers({ limit = 100, pageSize, cursor, fields, role, active } = {}) {
  let query = usersCollection();
  if (role) query = query.where("role", "==", role);
  if (active !== undefined) query = query.where("active", "==", active);
  const page = await fetchCursorPage(query, {
    limit: pageSize || limit,
    defaultLimit: 100,
    maxLimit: 500,
    cursor,
    fields,
    orderBy: [{ field: "createdAt", direction: "desc" }]
  });
  return listPayload(page);
}

async function getUser(id) {
  const doc = await usersCollection().doc(id).get();
  const user = fromDoc(doc);
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  return user;
}

async function createUser(data, actor) {
  let uid = data.firebaseUid;

  if (uid) {
    if (!(await accounts.findByUid(uid))) {
      throw new AppError("No login account exists for that id", 404, "USER_NOT_FOUND");
    }
  } else {
    if (!data.password) {
      throw new AppError("Password is required when creating a user", 422, "PASSWORD_REQUIRED");
    }
    const account = await accounts.createAccount({
      email: data.email,
      password: data.password,
      disabled: data.active === false
    });
    uid = account.uid;
  }

  const cleanPhone = data.phone ? String(data.phone).trim() : '';

  const payload = {
    id: uid,
    uid,
    email: accounts.normalizeEmail(data.email),
    name: data.name,
    phone: cleanPhone,
    role: data.role || "executive",
    active: data.active !== false,
    ...auditCreate(actor)
  };

  // User roles are ONLY assigned at the time of user creation.
  await usersCollection().doc(uid).set(payload);
  cache.invalidate(`auth:user:${uid}`);
  return getUser(uid);
}

async function updateUser(id, data, actor) {
  const ref = usersCollection().doc(id);
  const existing = await ref.get();
  if (!existing.exists) throw new AppError("User not found", 404, "USER_NOT_FOUND");

  // Credentials never go into the profile document.
  const { password, firebaseUid: _ignored, ...profilePatch } = data;

  if (profilePatch.email) profilePatch.email = accounts.normalizeEmail(profilePatch.email);
  await accounts.updateAccount(id, {
    email: profilePatch.email || undefined,
    disabled: typeof profilePatch.active === "boolean" ? !profilePatch.active : undefined
  });
  if (password) {
    // Admin password reset from User Management.
    await accounts.setPassword(id, password);
  }
  if (profilePatch.role) {
    logger.info("Updating user role", { uid: id, role: profilePatch.role, actor: actor?.email || "system" });
  }

  const cleanPhone = profilePatch.phone ? String(profilePatch.phone).trim() : '';

  // Do not overwrite role with default. Role changes only if explicitly passed.
  await ref.update({
    ...profilePatch,
    phone: cleanPhone,
    ...auditUpdate(actor)
  });
  cache.invalidate(`auth:user:${id}`);

  return getUser(id);
}

async function deleteUser(id) {
  // Prevent deletion of the last remaining admin
  const userToDelete = await getUser(id);
  if (userToDelete.role === "admin") {
    const adminsSnapshot = await usersCollection().where("role", "==", "admin").where("active", "==", true).get();
    if (adminsSnapshot.size <= 1) {
      throw new AppError("Cannot delete the last remaining active admin", 400, "LAST_ADMIN_DELETION");
    }
  }

  await accounts.deleteAccount(id);
  await usersCollection().doc(id).delete();
  cache.invalidate(`auth:user:${id}`);

  return { id, deleted: true };
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser
};
