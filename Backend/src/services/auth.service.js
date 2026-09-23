const { auth, db } = require("../config/firebase");
const { env } = require("../config/env");
const { COLLECTIONS } = require("../config/collections");
const { logger } = require("../config/logger");
const { AppError } = require("../utils/AppError");
const { fromDoc, auditCreate, auditUpdate } = require("../utils/firestore");

async function firebaseAuthRequest(endpoint, body, secureToken = false) {
  if (!env.firebaseWebApiKey) {
    throw new AppError("FIREBASE_WEB_API_KEY is required for password login through the backend", 500, "AUTH_CONFIG_MISSING");
  }

  const baseUrl = secureToken
    ? "https://securetoken.googleapis.com/v1"
    : "https://identitytoolkit.googleapis.com/v1";
  const url = `${baseUrl}/${endpoint}?key=${env.firebaseWebApiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": secureToken
        ? "application/x-www-form-urlencoded"
        : "application/json"
    },
    body: secureToken
      ? new URLSearchParams(body).toString()
      : JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    const code = payload?.error?.message || "AUTH_REQUEST_FAILED";
    // Map Firebase Identity Toolkit error codes to user-friendly messages.
    // We intentionally map both EMAIL_NOT_FOUND and INVALID_PASSWORD to the
    // same message to avoid leaking which field is wrong (security best practice).
    const FIREBASE_AUTH_MESSAGES = {
      INVALID_PASSWORD:              "Invalid email or password. Please try again",
      EMAIL_NOT_FOUND:               "Invalid email or password. Please try again",
      INVALID_LOGIN_CREDENTIALS:     "Invalid email or password. Please try again",
      INVALID_EMAIL:                 "Please enter a valid email address.",
      USER_DISABLED:                 "This account has been disabled. Please contact an administrator.",
      TOO_MANY_ATTEMPTS_TRY_LATER:   "Too many failed sign-in attempts. Please try again later.",
      MISSING_PASSWORD:              "Please enter your password.",
      WEAK_PASSWORD:                 "Password must be at least 6 characters.",
    };
    const friendlyMessage = FIREBASE_AUTH_MESSAGES[code] || "Invalid email or password. Please try again";
    throw new AppError(friendlyMessage, 401, code);
  }

  return payload;
}

async function getProfile(uid) {
  const userRecord = await auth.getUser(uid);
  const userDocRef = db.collection(COLLECTIONS.USERS).doc(uid);
  const userDoc = await userDocRef.get();
  
  let profile = fromDoc(userDoc);

  // If the document does not exist, create it without blindly hardcoding a default role.
  if (!userDoc.exists) {
    profile = {
      uid,
      email: userRecord.email,
      name: userRecord.displayName || "",
      phone: userRecord.phoneNumber || "",
      role: userRecord.customClaims?.role || null, // Only use what Auth has, no default overwrites
      active: !userRecord.disabled,
      ...auditCreate({ uid })
    };
    await userDocRef.set(profile);
  } else {
    // DO NOT OVERWRITE ROLE! Just update basic info from Auth to keep in sync.
    // Use update() to explicitly avoid overwriting the document or its role.
    try {
      await userDocRef.update({
        email: userRecord.email,
        name: userRecord.displayName || profile.name || "",
        active: !userRecord.disabled,
        updatedAt: new Date().toISOString()
      });
      profile.email = userRecord.email;
      profile.name = userRecord.displayName || profile.name || "";
      profile.active = !userRecord.disabled;
    } catch (err) {
      logger.error("Failed to update auth profile mirror", { uid, error: err.message });
    }
  }

  // Firestore is the SINGLE source of truth. 
  // Sync Firebase Auth custom claims ONLY if they differ from Firestore's role.
  const currentAuthRole = userRecord.customClaims?.role;
  const firestoreRole = profile.role;

  if (firestoreRole && currentAuthRole !== firestoreRole) {
    try {
      logger.info("Syncing custom claim to match Firestore role", { uid, role: firestoreRole });
      // Merge with existing custom claims to avoid data loss
      const newClaims = { ...(userRecord.customClaims || {}), role: firestoreRole };
      await auth.setCustomUserClaims(uid, newClaims);
    } catch (err) {
      logger.error("Failed to sync custom claims", { uid, error: err.message });
    }
  }

  return {
    uid,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    disabled: !profile.active,
    profile
  };
}

async function login({ email, password }) {
  const session = await firebaseAuthRequest("accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true
  });

  const decoded = await auth.verifyIdToken(session.idToken);
  const profile = await getProfile(decoded.uid);

  return {
    idToken: session.idToken,
    refreshToken: session.refreshToken,
    expiresIn: Number(session.expiresIn),
    user: profile
  };
}

async function refresh(refreshToken) {
  const refreshed = await firebaseAuthRequest("token", {
    grant_type: "refresh_token",
    refresh_token: refreshToken
  }, true);

  const decoded = await auth.verifyIdToken(refreshed.id_token);
  const profile = await getProfile(decoded.uid);

  return {
    idToken: refreshed.id_token,
    refreshToken: refreshed.refresh_token,
    expiresIn: Number(refreshed.expires_in),
    user: profile
  };
}

async function revokeRefreshTokens(uid) {
  await auth.revokeRefreshTokens(uid);
  return { uid, revoked: true };
}

async function createAuthUser(data, actor) {
  const userRecord = await auth.createUser({
    email: data.email,
    password: data.password,
    displayName: data.name,
    phoneNumber: data.phone || undefined,
    disabled: data.active === false
  });

  // Assign default role only at user creation
  const roleToAssign = data.role || "executive";
  await auth.setCustomUserClaims(userRecord.uid, { role: roleToAssign });

  const profile = {
    id: userRecord.uid,
    uid: userRecord.uid,
    email: data.email,
    name: data.name,
    phone: data.phone || "",
    role: roleToAssign,
    active: data.active !== false,
    ...auditCreate(actor)
  };

  // Safe to use set because this is a newly created user
  await db.collection(COLLECTIONS.USERS).doc(userRecord.uid).set(profile);
  return getProfile(userRecord.uid);
}

async function setRole(uid, role, actor) {
  logger.info("Updating user role", { uid, role, actor: actor?.email || "system" });
  await auth.setCustomUserClaims(uid, { role });
  // Use update instead of set to avoid overwriting other document fields
  await db.collection(COLLECTIONS.USERS).doc(uid).update({
    role,
    ...auditUpdate(actor)
  });
  return getProfile(uid);
}

async function forgotPassword(email) {
  if (!env.firebaseWebApiKey) {
    throw new AppError("FIREBASE_WEB_API_KEY is required", 500, "AUTH_CONFIG_MISSING");
  }
  
  // Use Firebase Identity Toolkit to send password reset email
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${env.firebaseWebApiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email })
  });
  
  const payload = await response.json();
  if (!response.ok) {
    const code = payload?.error?.message || "RESET_FAILED";
    if (code === "EMAIL_NOT_FOUND") {
      throw new AppError("No account found with this email address.", 404, "EMAIL_NOT_FOUND");
    }
    if (code === "INVALID_EMAIL") {
      throw new AppError("The email address is invalid.", 400, "INVALID_EMAIL");
    }
    throw new AppError(payload?.error?.message || "Failed to send reset email", 400, code);
  }
  return { sent: true };
}

async function changePassword(uid, { currentPassword, newPassword }) {
  // Verify the user exists
  const userRecord = await auth.getUser(uid);
  if (!userRecord.email) {
    throw new AppError("User has no email address", 400, "NO_EMAIL");
  }

  // Re-authenticate with current password to verify identity
  try {
    await firebaseAuthRequest("accounts:signInWithPassword", {
      email: userRecord.email,
      password: currentPassword,
      returnSecureToken: false
    });
  } catch {
    throw new AppError("Current password is incorrect", 401, "WRONG_PASSWORD");
  }

  // Update password via Admin SDK
  await auth.updateUser(uid, { password: newPassword });
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