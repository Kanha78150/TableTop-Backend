import jwt from "jsonwebtoken";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { generateTokens } from "../../utils/tokenUtils.js";
import {
  AccessTokenCookieOptions,
  RefreshTokenCookieOptions,
} from "../../config/jwtOptions.js";
import {
  findUserByIdentifier,
  validateAccountStatus,
  verifyPassword,
  handlePostLoginUpdates,
  fetchAdminHotels,
  formatUserResponse,
} from "../../services/auth.service.js";
import { User } from "../../models/User.model.js";
import { Admin } from "../../models/Admin.model.js";
import { Manager } from "../../models/Manager.model.js";
import { Staff } from "../../models/Staff.model.js";

/**
 * Helper function to set auth cookies
 */
const setAuthCookies = (res, tokens) => {
  res.cookie("accessToken", tokens.accessToken, AccessTokenCookieOptions);
  res.cookie("refreshToken", tokens.refreshToken, RefreshTokenCookieOptions);
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

    // Step 6: Update refresh token in database for all roles
    if (userType === "admin") {
      user.refreshToken = tokens.refreshToken;
      await user.save();
    } else if (userType === "manager") {
      // Use findByIdAndUpdate to avoid password hashing
      await model.findByIdAndUpdate(
        user._id,
        {
          $set: {
            refreshToken: tokens.refreshToken,
          },
        },
        { new: false, runValidators: false }
      );
    } else if (userType === "staff") {
      // Use findByIdAndUpdate to avoid password hashing
      await model.findByIdAndUpdate(
        user._id,
        {
          $set: {
            refreshToken: tokens.refreshToken,
          },
        },
        { new: false, runValidators: false }
      );
    }
    // User refresh token is already saved in handlePostLoginUpdates or separate logic

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

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          responseData,
          `${
            userType.charAt(0).toUpperCase() + userType.slice(1)
          } logged in successfully`
        )
      );
  } catch (error) {
    next(error);
  }
};

/**
 * Unified Refresh Token Controller
 * Handles refresh token generation for User, Admin, Manager, and Staff
 * @route POST /api/v1/auth/refresh-token
 */
export const refreshToken = async (req, res, next) => {
  try {
    // Get refresh token from cookies or body
    const incomingRefreshToken =
      req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
      return next(new APIError(401, "Refresh token is required"));
    }

    // Verify and decode the refresh token
    let decoded;
    try {
      decoded = jwt.verify(
        incomingRefreshToken,
        process.env.JWT_REFRESH_SECRET
      );
    } catch (error) {
      if (
        error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError"
      ) {
        return next(new APIError(401, "Invalid or expired refresh token"));
      }
      throw error;
    }

    // Determine user type from role in token
    const { _id, role } = decoded;
    let user;
    let userType;
    let Model;

    // Map role to model and userType
    if (role === "user") {
      Model = User;
      userType = "user";
    } else if (
      role === "admin" ||
      role === "super_admin" ||
      role === "branch_admin"
    ) {
      Model = Admin;
      userType = "admin";
    } else if (role === "branch_manager") {
      Model = Manager;
      userType = "manager";
    } else if (
      [
        "waiter",
        "kitchen_staff",
        "cleaning_staff",
        "cashier",
        "receptionist",
        "security",
      ].includes(role)
    ) {
      Model = Staff;
      userType = "staff";
    } else {
      return next(new APIError(401, "Invalid role in token"));
    }

    // Find user by ID
    user = await Model.findById(_id);

    if (!user) {
      return next(new APIError(401, "User not found"));
    }

    // ✅ FIX #2: Verify role from DB matches token role (prevent role escalation)
    if (
      (userType === "user" && user.role !== "user") ||
      (userType === "admin" &&
        !["admin", "super_admin", "branch_admin"].includes(user.role)) ||
      (userType === "manager" && user.role !== "branch_manager") ||
      (userType === "staff" &&
        ![
          "waiter",
          "kitchen_staff",
          "cleaning_staff",
          "cashier",
          "receptionist",
          "security",
        ].includes(user.role))
    ) {
      return next(new APIError(401, "Role mismatch - invalid token"));
    }

    // ✅ FIX #1: STRICT refresh token validation (prevent token reuse after logout)
    if (user.refreshToken !== undefined) {
      // If model has refreshToken field, it MUST match
      if (!user.refreshToken || user.refreshToken !== incomingRefreshToken) {
        return next(new APIError(401, "Invalid or expired refresh token"));
      }
    }

    // Check if account is active
    if (user.isActive === false) {
      return next(new APIError(403, "Account is deactivated"));
    }

    // ✅ FIX #3: Generate tokens with explicit payload (consistent structure)
    let tokens;
    if (userType === "admin") {
      tokens = generateTokens({
        _id: user._id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      });
    } else {
      tokens = generateTokens({
        _id: user._id,
        email: user.email,
        role: user.role,
      });
    }

    // Update refresh token in database (only for models that support it)
    if (user.refreshToken !== undefined) {
      user.refreshToken = tokens.refreshToken;
      await user.save({ validateBeforeSave: false });
    }

    // ✅ FIX #4: Conditional cookie setting (optional - only if you want to skip for mobile)
    // For now, keeping cookies for all roles for backward compatibility
    setAuthCookies(res, tokens);

    res.status(200).json(
      new APIResponse(
        200,
        {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          userType,
        },
        "Tokens refreshed successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};
