import { APIError } from "../../utils/APIError.js";
import { User, validateOAuthUserCompletion } from "../../models/User.model.js";
import { generateTokens } from "../../utils/tokenUtils.js";
import { generateOtp } from "../../utils/otpGenerator.js";
import { sendEmailOtp } from "../../utils/emailService.js";
import { CookieOptions } from "../../config/jwtOptions.js";

/**
 * Google OAuth Authentication Controller
 *
 * This controller handles Google OAuth authentication for both login and signup scenarios.
 *
 * Available endpoints:
 *
 * 1. GET /api/v1/auth/user/google - Initiates Google OAuth for signup
 * 2. GET /api/v1/auth/user/google/login - Initiates Google OAuth for login
 * 3. GET /api/v1/auth/user/google/callback - Handles OAuth callback from Google
 *
 * OAuth Flow Logic:
 * - If user exists with googleId: Login (returning user)
 * - If user exists with email but no googleId: Link Google account
 * - If user doesn't exist: Create new user (signup)
 *
 * After successful authentication, users are redirected to:
 * - /complete-profile if username/phone missing
 * - /dashboard if profile is complete
 *
 * URL parameters indicate the authentication result:
 * - newUser=true: New user signup
 * - linked=true: Account linking
 * - returning=true: Returning user login
 * - message: success/error message
 */

export const googleAuth = (req, res, next) => {
  // This will redirect to Google OAuth for signup
  // Handled by passport middleware
};

export const googleLogin = (req, res, next) => {
  // This will redirect to Google OAuth for login
  // Handled by passport middleware
};

export const googleCallback = async (req, res) => {
  try {
    const user = req.user; // From passport

    if (!user) {
      throw new APIError(401, "Google authentication failed");
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Save refresh token to user (remove temporary flags)
    const isNewUser = user.isNewUser;
    const isReturningUser = user.isReturningUser;
    const isAccountLinked = user.isAccountLinked;

    // Clean up temporary flags
    delete user.isNewUser;
    delete user.isReturningUser;
    delete user.isAccountLinked;

    user.refreshToken = refreshToken;
    await user.save();

    // Set cookies
    res.cookie("accessToken", accessToken, CookieOptions);
    res.cookie("refreshToken", refreshToken, CookieOptions);

    // Check if user needs to complete profile
    const needsCompletion = !user.username || !user.phone;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    // Determine redirect based on user scenario
    if (isNewUser) {
      // New user signup via Google
      if (needsCompletion) {
        res.redirect(
          `${frontendUrl}/complete-profile?token=${accessToken}&newUser=true&message=signup_success`
        );
      } else {
        res.redirect(
          `${frontendUrl}/dashboard?token=${accessToken}&message=signup_success&welcome=true`
        );
      }
    } else if (isAccountLinked) {
      // Existing user linked Google account
      if (needsCompletion) {
        res.redirect(
          `${frontendUrl}/complete-profile?token=${accessToken}&linked=true&message=account_linked`
        );
      } else {
        res.redirect(
          `${frontendUrl}/dashboard?token=${accessToken}&message=account_linked`
        );
      }
    } else if (isReturningUser) {
      // Returning Google user (login)
      if (needsCompletion) {
        res.redirect(
          `${frontendUrl}/complete-profile?token=${accessToken}&returning=true&message=login_success`
        );
      } else {
        res.redirect(
          `${frontendUrl}/dashboard?token=${accessToken}&message=login_success`
        );
      }
    } else {
      // Default case (shouldn't happen but fallback)
      if (needsCompletion) {
        res.redirect(`${frontendUrl}/complete-profile?token=${accessToken}`);
      } else {
        res.redirect(`${frontendUrl}/dashboard?token=${accessToken}`);
      }
    }
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    res.redirect(`${frontendUrl}/login?error=oauth_failed`);
  }
};

export const completeOAuthProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { error } = validateOAuthUserCompletion(req.body);
    if (error) throw new APIError(400, error.details[0].message);

    const { username, phone } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      throw new APIError(404, "User not found");
    }

    if (!user.isOAuthUser) {
      throw new APIError(400, "This endpoint is only for OAuth users");
    }

    // Check if username already exists (if provided)
    if (username) {
      const existingUser = await User.findOne({ username });
      if (existingUser && existingUser._id.toString() !== userId) {
        throw new APIError(400, "Username already exists");
      }
    }

    // Check if phone already exists (if provided)
    if (phone) {
      const existingUser = await User.findOne({ phone });
      if (existingUser && existingUser._id.toString() !== userId) {
        throw new APIError(400, "Phone number already exists");
      }
    }

    // Update user profile
    if (username) user.username = username;
    if (phone) user.phone = phone;

    await user.save();

    // Return updated user data
    const userResponse = {
      id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      profileImage: user.profileImage,
      isEmailVerified: user.isEmailVerified,
      coins: user.coins,
      role: user.role,
      authProvider: user.authProvider,
      isOAuthUser: user.isOAuthUser,
    };

    res.status(200).json({
      success: true,
      message: "Profile completed successfully",
      data: userResponse,
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during profile completion");
  }
};

export const sendOAuthEmailVerification = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

    const user = await User.findById(userId);
    if (!user) {
      throw new APIError(404, "User not found");
    }

    if (!user.isOAuthUser) {
      throw new APIError(400, "This endpoint is only for OAuth users");
    }

    if (user.isEmailVerified) {
      throw new APIError(400, "Email is already verified");
    }

    // Generate and send OTP
    const emailOtp = generateOtp();
    user.emailOtp = emailOtp;
    await user.save();

    try {
      await sendEmailOtp(user.email, emailOtp);
      console.log(`Email OTP sent to ${user.email}`);
    } catch (emailError) {
      console.error("Failed to send email OTP:", emailError);
      throw new APIError(500, "Failed to send verification email");
    }

    res.status(200).json({
      success: true,
      message: "Verification email sent successfully",
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(
      500,
      "Internal server error while sending verification email"
    );
  }
};

export const verifyOAuthEmail = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { otp } = req.body;

    if (!otp) {
      throw new APIError(400, "OTP is required");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new APIError(404, "User not found");
    }

    if (!user.isOAuthUser) {
      throw new APIError(400, "This endpoint is only for OAuth users");
    }

    if (user.isEmailVerified) {
      throw new APIError(400, "Email is already verified");
    }

    if (user.emailOtp !== otp) {
      throw new APIError(400, "Invalid OTP");
    }

    // Update user verification status
    user.isEmailVerified = true;
    user.emailOtp = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during email verification");
  }
};
