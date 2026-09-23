const donorService = require("../services/donor.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const list = asyncHandler(async (req, res) => {
  const data = await donorService.listDonors(req.query);
  sendSuccess(res, data, "Donors fetched", 200, data.pageInfo ? { pageInfo: data.pageInfo } : undefined);
});

const get = asyncHandler(async (req, res) => {
  const data = await donorService.getDonor(req.params.id);
  sendSuccess(res, data, "Donor fetched");
});

const create = asyncHandler(async (req, res) => {
  const data = await donorService.createDonor(req.body, req.user);
  sendSuccess(res, data, "Donor created", 201);
});

const update = asyncHandler(async (req, res) => {
  const data = await donorService.updateDonor(req.params.id, req.body, req.user);
  sendSuccess(res, data, "Donor updated");
});

const remove = asyncHandler(async (req, res) => {
  const data = await donorService.deleteDonor(req.params.id);
  sendSuccess(res, data, "Donor deleted");
});

module.exports = {
  list,
  get,
  create,
  update,
  remove
};
