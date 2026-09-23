const { auth, db } = require("../config/firebase");
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

  if (!uid) {
    if (!data.password) {
      throw new AppError("Password is required when creating a Firebase Auth user", 422, "PASSWORD_REQUIRED");
    }

    // Clean phone number - only pass if non-empty after trim
    const cleanPhone = data.phone ? String(data.phone).trim() : '';
    
    const createUserData = {
      email: data.email,
      password: data.password,
      displayName: data.name,
      disabled: data.active === false
    };
    
    // Only add phone if it's not empty
    if (cleanPhone) {
      createUserData.phoneNumber = cleanPhone;
    }

    const userRecord = await auth.createUser(createUserData);
    uid = userRecord.uid;
  }

  const roleToAssign = data.role || "executive";
  await auth.setCustomUserClaims(uid, { role: roleToAssign });

  const cleanPhone = data.phone ? String(data.phone).trim() : '';

  const payload = {
    id: uid,
    uid,
    email: data.email,
    name: data.name,
    phone: cleanPhone,
    role: roleToAssign,
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

  const authPatch = {};
  if (data.name) authPatch.displayName = data.name;
  
  // Clean phone number
  const cleanPhone = data.phone ? String(data.phone).trim() : '';
  if (cleanPhone) {
    authPatch.phoneNumber = cleanPhone;
  }
  
  if (typeof data.active === "boolean") authPatch.disabled = !data.active;
  if (Object.keys(authPatch).length) await auth.updateUser(id, authPatch);
  if (data.role) {
    logger.info("Updating user role", { uid: id, role: data.role, actor: actor?.email || "system" });
    await auth.setCustomUserClaims(id, { role: data.role });
  }

  // Do not overwrite role with default. Role changes only if explicitly passed.
  const updatePayload = {
    ...data,
    phone: cleanPhone,
    ...auditUpdate(actor)
  };

  // We use update() instead of set(..., {merge: true}) to avoid overwriting documents accidentally
  await ref.update(updatePayload);
  cache.invalidate(`auth:user:${id}`);

  return getUser(id);
}

async function deleteUser(id) {
  // 1. Prevent deletion of the last remaining admin
  const userToDelete = await getUser(id);
  if (userToDelete.role === "admin") {
    const adminsSnapshot = await usersCollection().where("role", "==", "admin").where("active", "==", true).get();
    if (adminsSnapshot.size <= 1) {
      throw new AppError("Cannot delete the last remaining active admin", 400, "LAST_ADMIN_DELETION");
    }
  }

  // 2. Delete Auth & Firestore safely (sync)
  try {
    await auth.deleteUser(id);
  } catch (err) {
    // If the user is already deleted from Auth, we still want to delete from Firestore
    if (err.code !== "auth/user-not-found") {
      throw new AppError("Failed to delete user from Firebase Auth", 500, "AUTH_DELETE_FAILED");
    }
  }
  
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
