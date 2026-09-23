const { AppError } = require("../utils/AppError");

function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params
    });

    if (!result.success) {
      next(new AppError("Validation failed. Please Try Again!", 422, "VALIDATION_ERROR", result.error.flatten()));
      return;
    }

    req.body = result.data.body ?? req.body;
    req.query = result.data.query ?? req.query;
    req.params = result.data.params ?? req.params;
    next();
  };
}

module.exports = { validate };
