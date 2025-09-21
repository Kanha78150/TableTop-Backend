import express from "express";
import {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
  refreshToken,
  getAdminProfile,
  changePassword,
  updateAdminProfile,
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
router.post("/register", registerAdmin); // Admin signup
router.post("/login", loginAdmin); // Admin login
router.post("/forgot-password", rateLimitSensitiveOps, forgotPassword);
router.post("/reset-password", rateLimitSensitiveOps, resetPassword);
router.post("/verify-email", verifyEmail);
router.post("/refresh-token", refreshToken);

// Protected routes (authentication required)
router.use(authenticateAdmin); // All routes below require authentication

// Self-service routes
router.get("/profile", getAdminProfile);
router.put("/profile", updateAdminProfile);
router.post("/change-password", changePassword);
router.post("/logout", logoutAdmin);

router.get("/all", requireSuperAdmin, getAllAdmins);
router.put("/:adminId", requireSuperAdmin, updateAdmin);
router.delete("/:adminId", requireSuperAdmin, deleteAdmin);

export default router;
