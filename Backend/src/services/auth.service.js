const { db } = require("../config/firebase");
const { COLLECTIONS } = require("../config/collections");
const { AppError } = require("../utils/AppError");
const { cache } = require("../utils/cache");
const { fromDoc, auditCreate, auditUpdate } = require("../utils/firestore");
const accounts = require("./account.store");
const tokens = require("./token.service");

const INVALID_LOGIN = "Invalid email or password. Please try again";

async function getProfile(uid) {
  const account = await accounts.findByUid(uid);
  if (!account) throw new AppError("User not found", 404, "USER_NOT_FOUND");

  const userDocRef = db.collection(COLLECTIONS.USERS).doc(uid);
  const userDoc = await userDocRef.get();
  let profile = fromDoc(userDoc);

  if (!profile) {
    // Credentials without a profile: create a minimal one, never guessing a role.
    profile = {
      id: uid,
      uid,
      email: account.email,
      name: "",
      phone: "",
      role: null,
      active: !account.disabled,
      ...auditCreate({ uid })
    };
    await userDocRef.set(profile);
    profile = fromDoc(await userDocRef.get());
  }

  return {
    uid,
    email: profile.email || account.email,
    name: profile.name,
    role: profile.role,
    disabled: account.disabled || profile.active === false,
    profile
  };
}

async function sessionFor(account) {
  const profile = await getProfile(account.uid);
  return {
    ...tokens.issueSession(account, profile),
    user: profile
  };
}

async function login({ email, password }) {
  const account = await accounts.findByEmail(email);
  const valid = await accounts.verifyPassword(account, password);
  if (!valid) throw new AppError(INVALID_LOGIN, 401, "INVALID_LOGIN_CREDENTIALS");
  if (account.disabled) {
    throw new AppError("This account has been disabled. Please contact an administrator.", 401, "USER_DISABLED");
  }
  await accounts.recordLogin(account.uid);
  return sessionFor(account);
}

async function refresh(refreshToken) {
  const decoded = tokens.verify(refreshToken, "refresh");
  const account = await accounts.findByUid(decoded.uid);
  if (!account || account.disabled || account.token_version !== decoded.tv) {
    throw new AppError("Session expired, please login again", 401, "UNAUTHENTICATED");
  }
  return sessionFor(account);
}

async function revokeRefreshTokens(uid) {
  await accounts.bumpTokenVersion(uid);
  cache.invalidate(`auth:user:${uid}`);
  return { uid, revoked: true };
}

async function createAuthUser(data, actor) {
  const account = await accounts.createAccount({
    email: data.email,
    password: data.password,
    disabled: data.active === false
  });

  const profile = {
    id: account.uid,
    uid: account.uid,
    email: account.email,
    name: data.name,
    phone: data.phone || "",
    role: data.role || "executive",
    active: data.active !== false,
    ...auditCreate(actor)
  };
  await db.collection(COLLECTIONS.USERS).doc(account.uid).set(profile);
  return getProfile(account.uid);
}

async function setRole(uid, role, actor) {
  await db.collection(COLLECTIONS.USERS).doc(uid).update({
    role,
    ...auditUpdate(actor)
  });
  cache.invalidate(`auth:user:${uid}`);
  return getProfile(uid);
}

async function forgotPassword() {
  // No outbound email is configured for this deployment; an admin resets passwords
  // from User Management instead.
  throw new AppError(
    "Password reset by email is not available. Please ask an administrator to reset your password.",
    400,
    "RESET_NOT_AVAILABLE"
  );
}

async function changePassword(uid, { currentPassword, newPassword }) {
  const account = await accounts.findByUid(uid);
  if (!account) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  if (!(await accounts.verifyPassword(account, currentPassword))) {
    throw new AppError("Current password is incorrect", 401, "WRONG_PASSWORD");
  }
  await accounts.setPassword(uid, newPassword);
  cache.invalidate(`auth:user:${uid}`);
  return { uid, passwordChanged: true };
}

module.exports = {
  login,
  refresh,
  getProfile,
  revokeRefreshTokens,
  createAuthUser,
  setRole,
  forgotPassword,
  changePassword
};
