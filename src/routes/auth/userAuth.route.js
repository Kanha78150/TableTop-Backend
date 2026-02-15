import { Router } from "express";

// Import Controllers
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
} from "../../controllers/auth/userAuth.controller.js";
import {
  googleAuth,
  googleLogin,
  googleCallback,
  completeOAuthProfile,
  sendOAuthEmailVerification,
  verifyOAuthEmail,
} from "../../controllers/auth/googleAuth.controller.js";

// Import Middlewares
import { upload } from "../../middleware/multer.middleware.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";
import {
  authenticateUser,
  authenticateOAuthUser,
} from "../../middleware/auth.middleware.js";

// Import oauth
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
// For signup flow
router.get(
  "/google",
  googleAuth,
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// For login flow
router.get(
  "/google/login",
  googleLogin,
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Common callback for both login and signup
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
