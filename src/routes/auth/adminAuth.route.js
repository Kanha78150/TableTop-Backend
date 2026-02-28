import express from "express";
import {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
  getAdminProfile,
  changePassword,
  updateAdminProfile,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationOtp,
  getAllAdmins,
  updateAdmin,
  deleteAdmin,
  bootstrapSuperAdmin,
} from "../../controllers/auth/adminAuth.controller.js";
import {
  authenticateAdmin,
  requireSuperAdmin,
  requireSelfOrSuperAdmin,
  rateLimitSensitiveOps,
} from "../../middleware/roleAuth.middleware.js";

import { upload } from "../../middleware/multer.middleware.js";

const router = express.Router();

// Public routes (no authentication required)
router.post(
  "/bootstrap-super-admin",
  rateLimitSensitiveOps,
  bootstrapSuperAdmin
); // Bootstrap super admin (only works if no super admin exists)
router.post("/register", registerAdmin); // Admin signup
router.post("/login", loginAdmin); // Admin login
router.post("/forgot-password", rateLimitSensitiveOps, forgotPassword);
router.post("/reset-password", rateLimitSensitiveOps, resetPassword);
router.post("/verify-email", verifyEmail);
router.post(
  "/resend-verification-otp",
  rateLimitSensitiveOps,
  resendVerificationOtp
);

// Protected routes (authentication required)
router.use(authenticateAdmin); // All routes below require authentication

// Self-service routes
router.get("/profile", getAdminProfile);
router.put("/profile", upload.single("profileImage"), updateAdminProfile);
router.post("/change-password", changePassword);
router.post("/logout", logoutAdmin);

router.get("/all", requireSuperAdmin, getAllAdmins);
router.put("/:adminId", requireSuperAdmin, updateAdmin);
router.delete("/:adminId", requireSuperAdmin, deleteAdmin);

export default router;
