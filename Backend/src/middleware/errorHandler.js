const { AppError } = require("../utils/AppError");
const { sendError } = require("../utils/response");
const { logger } = require("../config/logger");
const { env } = require("../config/env");

function notFoundHandler(req, _res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, "NOT_FOUND"));
}

function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || (error.name === "MulterError" ? 400 : 500);
  const uploadError = error.name === "MulterError"
    ? new AppError(
      error.code === "LIMIT_FILE_SIZE"
        ? `File is too large. Maximum upload size is ${env.maxUploadMb} MB.`
        : error.code === "LIMIT_FILE_COUNT"
          ? "Too many files uploaded for this request."
          : error.code === "LIMIT_UNEXPECTED_FILE"
            ? "This upload field is not supported."
            : error.message,
      statusCode,
      error.code || "UPLOAD_ERROR"
    )
    : null;

  const appError = error instanceof AppError
    ? error
    : uploadError
      ? uploadError
    : new AppError(
      statusCode === 500 ? "Something went wrong" : error.message,
      statusCode,
      error.code || (statusCode === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR")
    );

  // Log original error for debugging (especially Firestore errors)
  if (statusCode === 500 && !(error instanceof AppError)) {
    logger.error("Original error: " + (error.message || error), {
      code: error.code,
      originalStack: error.stack
    });
  }

  logger.error(appError.message, {
    code: appError.code,
    statusCode: appError.statusCode,
    stack: appError.stack
  });

  sendError(res, appError);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
