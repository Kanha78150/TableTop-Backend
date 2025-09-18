import { Router } from "express";
import {
  Signup,
  Login,
  verifyEmailOtp,
  resendEmailOtp,
  forgotPassword,
  resetPassword,
  editProfile,
  changePassword,
  getProfile,
  logout,
  logoutAll,
} from "../../controllers/auth/userAuth.js";
import {
  googleCallback,
  completeOAuthProfile,
  sendOAuthEmailVerification,
  verifyOAuthEmail,
} from "../../controllers/auth/googleAuth.js";
import { upload } from "../../middleware/multer.middleware.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";
import {
  authenticateUser,
  authenticateOAuthUser,
} from "../../middleware/auth.middleware.js";
import passport from "../../config/oauth.js";

const router = Router();

// Public routes (no authentication required)
router.post("/signup", upload.single("profileImage"), asyncHandler(Signup));
router.post("/login", asyncHandler(Login));
router.post("/verify-email-otp", asyncHandler(verifyEmailOtp));
router.post("/resend-email-otp", asyncHandler(resendEmailOtp));
router.post("/forgot-password", asyncHandler(forgotPassword));
router.post("/reset-password", asyncHandler(resetPassword));

// Google OAuth routes
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  asyncHandler(googleCallback)
);

// Protected routes (authentication required)
router.get("/profile", authenticateUser, asyncHandler(getProfile));
router.put(
  "/edit-profile",
  authenticateUser,
  upload.single("profileImage"),
  asyncHandler(editProfile)
);
router.post("/change-password", authenticateUser, asyncHandler(changePassword));
router.post("/logout", authenticateUser, asyncHandler(logout));
router.post("/logout-all", authenticateUser, asyncHandler(logoutAll));

// OAuth-specific protected routes (allow unverified OAuth users)
router.post(
  "/complete-oauth-profile",
  authenticateOAuthUser,
  asyncHandler(completeOAuthProfile)
);
router.post(
  "/send-oauth-email-verification",
  authenticateOAuthUser,
  asyncHandler(sendOAuthEmailVerification)
);
router.post(
  "/verify-oauth-email",
  authenticateOAuthUser,
  asyncHandler(verifyOAuthEmail)
);

export default router;
