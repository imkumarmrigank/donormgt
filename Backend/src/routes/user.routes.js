const { Router } = require("express");
const controller = require("../controllers/user.controller");
const { validate } = require("../middleware/validate");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { ROLES } = require("../config/roles");
const { idParam, listQuery } = require("../validators/common.validators");
const { createUserSchema, updateUserSchema } = require("../validators/user.validators");

const router = Router();

router.use(requireAuth);
router.get("/", requireRoles(ROLES.ADMIN, ROLES.MANAGER), validate(listQuery), controller.list);
router.post("/", requireRoles(ROLES.ADMIN), validate(createUserSchema), controller.create);
router.get("/:id", requireRoles(ROLES.ADMIN, ROLES.MANAGER), validate(idParam), controller.get);
router.patch("/:id", requireRoles(ROLES.ADMIN), validate(updateUserSchema), controller.update);
router.delete("/:id", requireRoles(ROLES.ADMIN), validate(idParam), controller.remove);

module.exports = router;
