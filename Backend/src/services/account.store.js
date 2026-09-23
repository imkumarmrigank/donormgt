// Login credentials in the auth_accounts table. Profiles live in the users collection.
const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("../config/database");
const { AppError } = require("../utils/AppError");

const BCRYPT_ROUNDS = 10;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function findByEmail(email) {
  const { rows } = await pool.query("SELECT * FROM auth_accounts WHERE lower(email) = $1", [normalizeEmail(email)]);
  return rows[0] || null;
}

async function findByUid(uid) {
  const { rows } = await pool.query("SELECT * FROM auth_accounts WHERE uid = $1", [uid]);
  return rows[0] || null;
}

async function createAccount({ email, password, disabled = false, uid }) {
  if (!password || String(password).length < 6) {
    throw new AppError("Password must be at least 6 characters.", 422, "WEAK_PASSWORD");
  }
  if (await findByEmail(email)) {
    throw new AppError("An account with this email already exists.", 409, "EMAIL_EXISTS");
  }
  const hash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO auth_accounts (uid, email, password_hash, disabled)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [uid || randomUUID(), normalizeEmail(email), hash, disabled === true]
  );
  return rows[0];
}

async function verifyPassword(account, password) {
  if (!account) return false;
  return bcrypt.compare(String(password || ""), account.password_hash);
}

async function setPassword(uid, password) {
  if (!password || String(password).length < 6) {
    throw new AppError("Password must be at least 6 characters.", 422, "WEAK_PASSWORD");
  }
  const hash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
  // Changing the password signs out every other session.
  await pool.query(
    "UPDATE auth_accounts SET password_hash = $2, token_version = token_version + 1, updated_at = now() WHERE uid = $1",
    [uid, hash]
  );
}

async function updateAccount(uid, { email, disabled }) {
  if (email !== undefined) {
    const existing = await findByEmail(email);
    if (existing && existing.uid !== uid) {
      throw new AppError("An account with this email already exists.", 409, "EMAIL_EXISTS");
    }
    await pool.query("UPDATE auth_accounts SET email = $2, updated_at = now() WHERE uid = $1", [uid, normalizeEmail(email)]);
  }
  if (typeof disabled === "boolean") {
    await pool.query(
      `UPDATE auth_accounts
          SET disabled = $2,
              token_version = token_version + CASE WHEN $2 THEN 1 ELSE 0 END,
              updated_at = now()
        WHERE uid = $1`,
      [uid, disabled]
    );
  }
}

async function bumpTokenVersion(uid) {
  await pool.query("UPDATE auth_accounts SET token_version = token_version + 1, updated_at = now() WHERE uid = $1", [uid]);
}

async function recordLogin(uid) {
  await pool.query("UPDATE auth_accounts SET last_login_at = now() WHERE uid = $1", [uid]);
}

async function deleteAccount(uid) {
  const { rowCount } = await pool.query("DELETE FROM auth_accounts WHERE uid = $1", [uid]);
  return rowCount > 0;
}

module.exports = {
  normalizeEmail,
  findByEmail,
  findByUid,
  createAccount,
  verifyPassword,
  setPassword,
  updateAccount,
  bumpTokenVersion,
  recordLogin,
  deleteAccount
};
