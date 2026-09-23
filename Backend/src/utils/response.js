function sendSuccess(res, data = null, message = "OK", statusCode = 200, meta = undefined) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {})
  });
}

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "Something went wrong",
      ...(error.details ? { details: error.details } : {})
    }
  });
}

module.exports = {
  sendSuccess,
  sendError
};
