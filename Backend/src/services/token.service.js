const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { AppError } = require("../utils/AppError");

function secret() {
  if (!env.jwtSecret) {
    throw new AppError("JWT_SECRET is not configured on the server.", 500, "AUTH_CONFIG_MISSING");
  }
  return env.jwtSecret;
}

function issueSession(account, profile) {
  const idToken = jwt.sign(
    {
      typ: "access",
      email: account.email,
      name: profile?.name || "",
      role: profile?.role || null,
      tv: account.token_version
    },
    secret(),
    { subject: account.uid, expiresIn: env.accessTokenTtlSeconds }
  );
  const refreshToken = jwt.sign(
    { typ: "refresh", tv: account.token_version },
    secret(),
    { subject: account.uid, expiresIn: `${env.refreshTokenTtlDays}d` }
  );
  return { idToken, refreshToken, expiresIn: env.accessTokenTtlSeconds };
}

function verify(token, expectedType) {
  let decoded;
  try {
    decoded = jwt.verify(token, secret());
  } catch {
    throw new AppError("Invalid or expired token", 401, "UNAUTHENTICATED");
  }
  if (decoded.typ !== expectedType) {
    throw new AppError("Invalid or expired token", 401, "UNAUTHENTICATED");
  }
  return { ...decoded, uid: decoded.sub };
}

module.exports = { issueSession, verify };
