import express from "express";
import {
  registerSuperAdmin,
  verifyEmail,
  resendOtp,
  loginSuperAdmin,
  logoutSuperAdmin,
  getSuperAdminProfile,
  updateSuperAdminProfile,
} from "../../controllers/auth/superAdminAuth.controller.js";
import {
  authenticateAdmin,
  requireSuperAdmin,
} from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

/**
 * @route   POST /api/v1/auth/super-admin/register
 * @desc    Register a new super admin
 * @access  Public (but only allows one super admin)
 * @body    { name, email, password, dateOfBirth }
 */
router.post("/register", registerSuperAdmin);

/**
 * @route   POST /api/v1/auth/super-admin/verify-email
 * @desc    Verify super admin email with OTP
 * @access  Public
 * @body    { email, otp }
 */
router.post("/verify-email", verifyEmail);

/**
 * @route   POST /api/v1/auth/super-admin/resend-otp
 * @desc    Resend OTP for email verification
 * @access  Public
 * @body    { email }
 */
router.post("/resend-otp", resendOtp);

/**
 * @route   POST /api/v1/auth/super-admin/login
 * @desc    Login super admin
 * @access  Public
 * @body    { email, password, dateOfBirth }
 */
router.post("/login", loginSuperAdmin);

/**
 * @route   POST /api/v1/auth/super-admin/logout
 * @desc    Logout super admin
 * @access  Private (Super Admin)
 */
router.post("/logout", authenticateAdmin, requireSuperAdmin, logoutSuperAdmin);

/**
 * @route   GET /api/v1/auth/super-admin/profile
 * @desc    Get super admin profile
 * @access  Private (Super Admin)
 */
router.get(
  "/profile",
  authenticateAdmin,
  requireSuperAdmin,
  getSuperAdminProfile
);

/**
 * @route   PUT /api/v1/auth/super-admin/profile
 * @desc    Update super admin profile
 * @access  Private (Super Admin)
 * @body    { name, email, dateOfBirth }
 */
router.put(
  "/profile",
  authenticateAdmin,
  requireSuperAdmin,
  updateSuperAdminProfile
);

export default router;
