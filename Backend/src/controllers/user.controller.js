const userService = require("../services/user.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const list = asyncHandler(async (req, res) => {
  const data = await userService.listUsers(req.query);
  sendSuccess(res, data, "Users fetched", 200, data.pageInfo ? { pageInfo: data.pageInfo } : undefined);
});

const get = asyncHandler(async (req, res) => {
  const data = await userService.getUser(req.params.id);
  sendSuccess(res, data, "User fetched");
});

const create = asyncHandler(async (req, res) => {
  const data = await userService.createUser(req.body, req.user);
  sendSuccess(res, data, "User created", 201);
});

const update = asyncHandler(async (req, res) => {
  const data = await userService.updateUser(req.params.id, req.body, req.user);
  sendSuccess(res, data, "User updated");
});

const remove = asyncHandler(async (req, res) => {
  const data = await userService.deleteUser(req.params.id);
  sendSuccess(res, data, "User deleted");
});

module.exports = {
  list,
  get,
  create,
  update,
  remove
};
