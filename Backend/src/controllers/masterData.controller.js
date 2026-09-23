const masterDataService = require("../services/masterData.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

// Combined master data (backward compatible)
const get = asyncHandler(async (_req, res) => {
  const data = await masterDataService.getMasterData();
  sendSuccess(res, data, "Master data fetched");
});

// ── RST Items ─────────────────────────────────────────────────────────────────
const listRstItems = asyncHandler(async (_req, res) => {
  const data = await masterDataService.listRstItems();
  sendSuccess(res, data, "RST items fetched");
});

const createRstItem = asyncHandler(async (req, res) => {
  const data = await masterDataService.createRstItem(req.body, req.user);
  sendSuccess(res, data, "RST item created", 201);
});

const updateRstItem = asyncHandler(async (req, res) => {
  const data = await masterDataService.updateRstItem(req.params.id, req.body, req.user);
  sendSuccess(res, data, "RST item updated");
});

const deleteRstItem = asyncHandler(async (req, res) => {
  const data = await masterDataService.deleteRstItem(req.params.id);
  sendSuccess(res, data, "RST item deleted");
});

// ── SKS Items ─────────────────────────────────────────────────────────────────
const listSksItems = asyncHandler(async (_req, res) => {
  const data = await masterDataService.listSksItems();
  sendSuccess(res, data, "SKS items fetched");
});

const createSksItem = asyncHandler(async (req, res) => {
  const data = await masterDataService.createSksItem(req.body, req.user);
  sendSuccess(res, data, "SKS item created", 201);
});

const updateSksItem = asyncHandler(async (req, res) => {
  const data = await masterDataService.updateSksItem(req.params.id, req.body, req.user);
  sendSuccess(res, data, "SKS item updated");
});

const deleteSksItem = asyncHandler(async (req, res) => {
  const data = await masterDataService.deleteSksItem(req.params.id);
  sendSuccess(res, data, "SKS item deleted");
});

module.exports = {
  get,
  listRstItems, createRstItem, updateRstItem, deleteRstItem,
  listSksItems, createSksItem, updateSksItem, deleteSksItem
};
