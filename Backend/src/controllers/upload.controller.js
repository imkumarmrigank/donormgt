const storageService = require("../services/storage.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { AppError } = require("../utils/AppError");

const createUploadUrl = asyncHandler(async (req, res) => {
  const data = await storageService.createWriteSignedUrl(req.body);
  sendSuccess(res, data, "Signed upload URL created", 201);
});

const createReadUrl = asyncHandler(async (req, res) => {
  const data = await storageService.createReadSignedUrl(req.body.storagePath);
  sendSuccess(res, data, "Signed read URL created");
});

const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("File is required", 422, "FILE_REQUIRED");
  }

  const data = await storageService.uploadFile({
    file: req.file,
    purpose: req.body.purpose || "general",
    entityId: req.body.entityId || "general",
    user: req.user
  });
  sendSuccess(res, data, "File uploaded", 201);
});

module.exports = {
  createUploadUrl,
  createReadUrl,
  uploadFile
};
