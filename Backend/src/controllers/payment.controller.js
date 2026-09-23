const paymentService = require("../services/payment.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

// GET /api/v1/payments — collectionGroup query across all pickup sub-collections
const list = asyncHandler(async (req, res) => {
  const data = await paymentService.listPayments(req.query);
  sendSuccess(res, data, "Payments fetched", 200, data.pageInfo ? { pageInfo: data.pageInfo } : undefined);
});

// GET /api/v1/payments/pickups/:pickupId
const getPickupPayments = asyncHandler(async (req, res) => {
  const data = await paymentService.getPickupPayments(req.params.pickupId);
  sendSuccess(res, data, "Pickup payments fetched");
});

// GET /api/v1/payments/partners/summary?dateFrom=&dateTo=&partnerId=&search=
// Returns backend-grouped partner payment rows — no client-side grouping needed
const partnerSummary = asyncHandler(async (req, res) => {
  const data = await paymentService.getPartnerSummary(req.query);
  sendSuccess(res, data, "Partner payment summary fetched");
});

// POST /api/v1/payments/partners/:partnerId/record
const record = asyncHandler(async (req, res) => {
  const data = await paymentService.recordPartnerPayment(req.params.partnerId, req.body, req.user);
  sendSuccess(res, data, "Payment recorded", 201);
});

// POST /api/v1/payments/partners/:partnerId/clear-balance
const clearBalance = asyncHandler(async (req, res) => {
  const data = await paymentService.clearPartnerBalance(req.params.partnerId, req.body, req.user);
  sendSuccess(res, data, "Partner balance cleared");
});

module.exports = {
  list,
  getPickupPayments,
  partnerSummary,
  record,
  clearBalance
};
