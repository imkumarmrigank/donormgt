const multer = require("multer");
const { env } = require("../config/env");
const { AppError } = require("../utils/AppError");

const imageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const documentTypes = new Set([
  ...imageTypes,
  "application/pdf"
]);

const allowedTypes = documentTypes;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadMb * 1024 * 1024,
    files: 1
  },
  fileFilter(_req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      callback(new AppError("Only JPEG, PNG, WebP, and PDF uploads are allowed", 415, "UNSUPPORTED_FILE_TYPE"));
      return;
    }
    callback(null, true);
  }
});

const partnerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadMb * 1024 * 1024,
    files: 2
  },
  fileFilter(_req, file, callback) {
    if (file.fieldname === "photo") {
      if (!imageTypes.has(file.mimetype)) {
        callback(new AppError("Partner photo must be a JPEG, PNG, or WebP image", 415, "UNSUPPORTED_PHOTO_TYPE"));
        return;
      }
      callback(null, true);
      return;
    }

    if (file.fieldname === "aadhaarDoc" || file.fieldname === "aadhaarDocument") {
      if (!documentTypes.has(file.mimetype)) {
        callback(new AppError("Aadhaar document must be a JPEG, PNG, WebP, or PDF file", 415, "UNSUPPORTED_AADHAAR_TYPE"));
        return;
      }
      callback(null, true);
      return;
    }

    callback(new AppError(`Unsupported file field: ${file.fieldname}`, 400, "UNSUPPORTED_FILE_FIELD"));
  }
});

module.exports = { upload, partnerUpload };
