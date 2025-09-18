import express from "express";
import {
  loginAdmin,
  logoutAdmin,
  refreshToken,
  getAdminProfile,
  updateAdminProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  getAllAdmins,
  updateAdmin,
  deleteAdmin,
  bootstrapSuperAdmin,
} from "../../controllers/auth/adminAuth.js";
import {
  authenticateAdmin,
  requireSuperAdmin,
  requireSelfOrSuperAdmin,
  rateLimitSensitiveOps,
} from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

// Public routes (no authentication required)
router.post("/bootstrap", rateLimitSensitiveOps, bootstrapSuperAdmin); // One-time Super Admin creation with rate limiting
router.post("/login", loginAdmin);
router.post("/forgot-password", rateLimitSensitiveOps, forgotPassword);
router.post("/reset-password", rateLimitSensitiveOps, resetPassword);
router.get("/verify-email", verifyEmail);
router.post("/refresh-token", refreshToken);

// Protected routes (authentication required)
router.use(authenticateAdmin); // All routes below require authentication

// Self-service routes
router.get("/profile", getAdminProfile);
router.put("/profile", updateAdminProfile);
router.post("/change-password", rateLimitSensitiveOps, changePassword);
router.post("/logout", logoutAdmin);

router.get("/all", requireSuperAdmin, getAllAdmins);
router.put("/:adminId", requireSuperAdmin, updateAdmin);
router.delete("/:adminId", requireSuperAdmin, deleteAdmin);

export default router;
