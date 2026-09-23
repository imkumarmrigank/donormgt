const { db } = require("../config/firebase");
const { COLLECTIONS } = require("../config/collections");
const { AppError } = require("../utils/AppError");
const { cache } = require("../utils/cache");
const accounts = require("../services/account.store");
const tokens = require("../services/token.service");

const AUTH_PROFILE_TTL_SECONDS = 60;

/**
 * Verifies the Bearer access token and attaches { uid, email, name, role } to req.user.
 * The role always comes from the users collection, so role changes apply within a minute.
 */
async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    const [, token] = header.match(/^Bearer\s+(.+)$/i) || [];
    if (!token) {
      throw new AppError("Missing Bearer token", 401, "UNAUTHENTICATED");
    }

    const decoded = tokens.verify(token, "access");

    const state = await cache.getOrFetch(`auth:user:${decoded.uid}`, async () => {
      const [account, userDoc] = await Promise.all([
        accounts.findByUid(decoded.uid),
        db.collection(COLLECTIONS.USERS).doc(decoded.uid).get()
      ]);
      return {
        account: account ? { disabled: account.disabled, tokenVersion: account.token_version } : null,
        profile: userDoc.exists ? userDoc.data() : null
      };
    }, AUTH_PROFILE_TTL_SECONDS);

    if (!state.account || state.account.tokenVersion !== decoded.tv) {
      throw new AppError("Session expired, please login again", 401, "UNAUTHENTICATED");
    }
    if (state.account.disabled || state.profile?.active === false) {
      throw new AppError("This user account is disabled", 403, "USER_DISABLED");
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: state.profile?.name || decoded.name,
      role: String(state.profile?.role || decoded.role || "").toLowerCase(),
      claims: decoded
    };
    next();
  } catch (error) {
    next(error instanceof AppError
      ? error
      : new AppError("Invalid or expired token", 401, "UNAUTHENTICATED"));
  }
}

/**
 * Factory middleware that restricts access to users whose role is
 * in the provided allow-list.
 *
 * Usage: requireRoles(ROLES.ADMIN, ROLES.MANAGER)
 */
function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      next(new AppError("Authentication required", 401, "UNAUTHENTICATED"));
      return;
    }

    if (!roles.includes(req.user.role)) {
      const requiredRoles = roles.join(" or ");
      const currentRole = req.user.role || "unassigned";
      next(new AppError(`Only ${requiredRoles} can perform this action. Your current role is ${currentRole}.`, 403, "FORBIDDEN", {
        requiredRoles: roles,
        currentRole: req.user.role
      }));
      return;
    }

    next();
  };
}

function requirePermissions(...permissions) {
  const allowedRoles = [...new Set(permissions.flat())];
  return requireRoles(...allowedRoles);
}

module.exports = {
  requireAuth,
  requireRoles,
  requirePermissions
};
