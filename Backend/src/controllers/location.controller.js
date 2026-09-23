const locationService = require("../services/location.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const listCities = asyncHandler(async (_req, res) => {
  const data = await locationService.listCities();
  sendSuccess(res, data, "Cities fetched");
});

const listSectors = asyncHandler(async (req, res) => {
  const data = await locationService.listSectors(req.query);
  sendSuccess(res, data, "Sectors fetched");
});

const listSocieties = asyncHandler(async (req, res) => {
  const data = await locationService.listSocieties(req.query);
  sendSuccess(res, data, "Societies fetched");
});

const tree = asyncHandler(async (_req, res) => {
  const data = await locationService.getLocationTree();
  sendSuccess(res, data, "Location tree fetched");
});

const upsert = asyncHandler(async (req, res) => {
  await locationService.upsertLocationHierarchy(req.body, req.user);
  const data = await locationService.getLocationTree();
  sendSuccess(res, data, "Location saved", 201);
});

const deleteCity = asyncHandler(async (req, res) => {
  await locationService.deleteCity(req.params.id);
  sendSuccess(res, { id: req.params.id, deleted: true }, "City deleted");
});

const deleteSector = asyncHandler(async (req, res) => {
  await locationService.deleteSector(req.params.id);
  sendSuccess(res, { id: req.params.id, deleted: true }, "Sector deleted");
});

const deleteSociety = asyncHandler(async (req, res) => {
  await locationService.deleteSociety(req.params.id);
  sendSuccess(res, { id: req.params.id, deleted: true }, "Society deleted");
});

module.exports = {
  listCities,
  listSectors,
  listSocieties,
  tree,
  upsert,
  deleteCity,
  deleteSector,
  deleteSociety
};
