const setupService = require("../services/setup.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

/**
 * GET /api/v1/setup/status
 * Public — returns whether the first-admin setup has been completed.
 */
const status = asyncHandler(async (_req, res) => {
  const data = await setupService.getSetupStatus();
  sendSuccess(res, data, "Setup status");
});

/**
 * POST /api/v1/setup/first-admin
 * Public — one-time endpoint to promote a Firebase Auth user to admin.
 *
 * Body: { setupSecret: string, uid: string }
 */
const firstAdmin = asyncHandler(async (req, res) => {
  const data = await setupService.setupFirstAdmin(req.body);
  sendSuccess(res, data, "First admin created", 201);
});

module.exports = {
  status,
  firstAdmin
};
