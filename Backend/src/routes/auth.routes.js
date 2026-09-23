const { Router } = require("express");
const controller = require("../controllers/auth.controller");
const { validate } = require("../middleware/validate");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { ROLES } = require("../config/roles");
const {
  loginSchema,
  refreshSchema,
  createAuthUserSchema,
  setRoleSchema,
  forgotPasswordSchema,
  changePasswordSchema
} = require("../validators/auth.validators");

const router = Router();

// Public routes
router.post("/login", validate(loginSchema), controller.login);
router.post("/refresh", validate(refreshSchema), controller.refresh);
router.post("/forgot-password", validate(forgotPasswordSchema), controller.forgotPassword);

// Authenticated routes
router.get("/me", requireAuth, controller.me);
router.post("/logout", requireAuth, controller.logout);
router.post("/change-password", requireAuth, validate(changePasswordSchema), controller.changePassword);

// Admin-only routes
router.post("/users", requireAuth, requireRoles(ROLES.ADMIN), validate(createAuthUserSchema), controller.createAuthUser);
router.patch("/users/:uid/role", requireAuth, requireRoles(ROLES.ADMIN), validate(setRoleSchema), controller.setRole);

module.exports = router;
