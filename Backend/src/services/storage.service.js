const path = require("path");
const { randomUUID } = require("crypto");
const cloudinary = require("cloudinary").v2;
const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { logger } = require("../config/logger");
const { AppError } = require("../utils/AppError");
const { sanitizeFileName, sanitizePathSegment } = require("../utils/sanitize");

// Files are stored as Cloudinary "authenticated" assets, so they can only be fetched
// through signed URLs (Aadhaar documents and payment proofs must not be public).
// storagePath = "<resource_type>/<delivery type>/<public_id>".
const DELIVERY_TYPE = "authenticated";

function configured() {
  if (!env.cloudinaryUrl) {
    throw new AppError("File uploads are not configured (CLOUDINARY_URL is missing).", 500, "STORAGE_NOT_CONFIGURED");
  }
  // The SDK reads CLOUDINARY_URL itself; this keeps it in sync if env was loaded late.
  cloudinary.config({ secure: true });
  return cloudinary;
}

function buildPublicId({ purpose = "general", entityId = "general", fileName, raw }) {
  const clean = sanitizeFileName(fileName);
  const base = raw ? clean : path.basename(clean, path.extname(clean));
  return [
    sanitizePathSegment(env.cloudinaryFolder),
    sanitizePathSegment(purpose),
    sanitizePathSegment(entityId || "general"),
    `${Date.now()}-${randomUUID().slice(0, 8)}-${base}`
  ].join("/");
}

function parseStoragePath(storagePath) {
  const [resourceType, type, ...rest] = String(storagePath || "").split("/");
  if (!["image", "raw", "video"].includes(resourceType) || !type || !rest.length) {
    throw new AppError("Unknown storage path", 400, "INVALID_STORAGE_PATH");
  }
  return { resourceType, type, publicId: rest.join("/") };
}

// Cloudinary refuses to deliver PDFs from its CDN on this account, so raw files are
// opened through the app: a stable link carrying a signed token, which redirects to a
// short-lived download URL from Cloudinary's API.
const VIEW_LINK_TTL_SECONDS = 600;

function viewLink(storagePath) {
  const token = jwt.sign({ typ: "file", p: storagePath }, env.jwtSecret);
  return `${env.apiPrefix}/uploads/view/${token}`;
}

function resolveViewToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new AppError("This file link is not valid", 404, "FILE_NOT_FOUND");
  }
  if (decoded.typ !== "file") throw new AppError("This file link is not valid", 404, "FILE_NOT_FOUND");
  const { resourceType, type, publicId } = parseStoragePath(decoded.p);
  return configured().utils.private_download_url(publicId, "", {
    resource_type: resourceType,
    type,
    expires_at: Math.floor(Date.now() / 1000) + VIEW_LINK_TTL_SECONDS
  });
}

function signedUrl(storagePath) {
  const { resourceType, type, publicId } = parseStoragePath(storagePath);
  if (resourceType === "raw") return viewLink(storagePath);
  return configured().url(publicId, {
    resource_type: resourceType,
    type,
    sign_url: true,
    secure: true
  });
}

async function createReadSignedUrl(storagePath) {
  return {
    storagePath,
    signedUrl: signedUrl(storagePath),
    expiresAt: null
  };
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = configured().uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });
}

async function uploadFile({ file, purpose, entityId, user }) {
  // PDFs go up as raw files: Cloudinary blocks PDF delivery from the image pipeline by default.
  const raw = file.mimetype === "application/pdf";
  const resourceType = raw ? "raw" : "image";
  const publicId = buildPublicId({ purpose, entityId, fileName: file.originalname, raw });

  let result;
  try {
    result = await uploadBuffer(file.buffer, {
      public_id: publicId,
      resource_type: resourceType,
      type: DELIVERY_TYPE,
      overwrite: false,
      context: {
        originalName: file.originalname,
        uploadedBy: user?.uid || "system"
      }
    });
  } catch (err) {
    logger.error("Cloudinary upload failed", { publicId, error: err.message });
    throw new AppError(`File upload failed: ${err.message}`, 502, "STORAGE_UPLOAD_FAILED");
  }

  const storagePath = `${resourceType}/${DELIVERY_TYPE}/${result.public_id}`;
  const url = raw ? viewLink(storagePath) : (result.secure_url || signedUrl(storagePath));
  logger.info("File uploaded to Cloudinary", { fileName: file.originalname, storagePath });

  return {
    storagePath,
    fileName: file.originalname,
    contentType: file.mimetype,
    size: file.size,
    url,
    downloadUrl: url,
    signedUrl: url,
    expiresAt: null,
    uploadedAt: new Date().toISOString()
  };
}

async function deleteFile(storagePath) {
  if (!storagePath) return false;
  let parsed;
  try {
    parsed = parseStoragePath(storagePath);
  } catch {
    return false; // e.g. a leftover Firebase Storage path
  }
  const result = await configured().uploader.destroy(parsed.publicId, {
    resource_type: parsed.resourceType,
    type: parsed.type,
    invalidate: true
  });
  return result?.result === "ok";
}

module.exports = {
  createReadSignedUrl,
  resolveViewToken,
  uploadFile,
  deleteFile
};
