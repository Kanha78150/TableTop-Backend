import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { generateTokens } from "../../utils/tokenUtils.js";
import {
  findUserByIdentifier,
  validateAccountStatus,
  verifyPassword,
  handlePostLoginUpdates,
  fetchAdminHotels,
  formatUserResponse,
} from "../../services/authService.js";

/**
 * Helper function to set auth cookies
 */
const setAuthCookies = (res, tokens) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
  };

  res.cookie("accessToken", tokens.accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie("refreshToken", tokens.refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

/**
 * Unified Login Controller
 * Handles login for Admin, Manager, and Staff with automatic role detection
 * @route POST /api/v1/auth/login
 */
export const unifiedLogin = async (req, res, next) => {
  try {
    // Accept multiple field names for flexibility
    const identifier = req.body.identifier || req.body.email;
    const { password } = req.body;

    // Validate input
    if (!identifier || !password) {
      return next(
        new APIError(400, "Identifier (email/ID) and password are required")
      );
    }

    // Step 1: Find user across all models
    const { user, userType, model } = await findUserByIdentifier(identifier);

    if (!user) {
      return next(new APIError(401, "Invalid credentials"));
    }

    // Step 2: Validate account status and security checks
    try {
      validateAccountStatus(user, userType);
    } catch (error) {
      return next(error);
    }

    // Step 3: Verify password
    try {
      await verifyPassword(user, password);
    } catch (error) {
      return next(error);
    }

    // Step 4: Handle post-login updates
    const { wasInactive, isFirstLogin } = await handlePostLoginUpdates(
      user,
      userType
    );

    // Step 5: Generate tokens
    let tokens;
    try {
      if (userType === "admin") {
        tokens = generateTokens({
          _id: user._id,
          role: user.role,
          permissions: user.permissions,
        });
      } else {
        tokens = generateTokens(user);
      }
    } catch (tokenError) {
      return next(new APIError(500, "Token generation failed"));
    }

    // Step 6: Update refresh token (for admin)
    if (userType === "admin") {
      user.refreshToken = tokens.refreshToken;
      await user.save();
    }

    // Step 7: Fetch additional data based on user type
    let additionalData = { wasInactive, isFirstLogin };
    if (userType === "admin") {
      const createdHotels = await fetchAdminHotels(user);
      additionalData.createdHotels = createdHotels;
    }

    // Step 8: Set cookies
    setAuthCookies(res, tokens);

    // Step 9: Format and send response
    const responseData = formatUserResponse(
      user,
      userType,
      tokens,
      additionalData
    );

    res.status(200).json(
      new APIResponse(
        200,
        responseData,
        `${userType.charAt(0).toUpperCase() + userType.slice(1)} logged in successfully`
      )
    );
  } catch (error) {
    next(error);
  }
};
