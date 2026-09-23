const { Router } = require("express");
const controller = require("../controllers/donor.controller");
const { validate } = require("../middleware/validate");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { ROLES } = require("../config/roles");
const { idParam, listQuery } = require("../validators/common.validators");
const { createDonorSchema, updateDonorSchema } = require("../validators/donor.validators");

const router = Router();

router.use(requireAuth);
router.get("/", validate(listQuery), controller.list);
router.post("/", requireRoles(ROLES.ADMIN, ROLES.MANAGER), validate(createDonorSchema), controller.create);
router.get("/:id", validate(idParam), controller.get);
router.patch("/:id", requireRoles(ROLES.ADMIN, ROLES.MANAGER), validate(updateDonorSchema), controller.update);
router.delete("/:id", requireRoles(ROLES.ADMIN, ROLES.MANAGER), validate(idParam), controller.remove);

module.exports = router;
