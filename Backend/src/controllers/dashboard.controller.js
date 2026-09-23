const dashboardService = require("../services/dashboard.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const stats = asyncHandler(async (req, res) => {
  const data = await dashboardService.getStats(req.query);
  sendSuccess(res, data, "Dashboard stats fetched");
});

const scheduler = asyncHandler(async (_req, res) => {
  const data = await dashboardService.getSchedulerSummary();
  sendSuccess(res, data, "Scheduler summary fetched");
});

module.exports = {
  stats,
  scheduler
};
