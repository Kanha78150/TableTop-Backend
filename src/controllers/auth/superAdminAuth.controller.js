import {
  Admin,
  validateSuperAdminRegistration,
  validateSuperAdminLogin,
  validateEmailVerification,
  validateResendOtp,
  validateAdminUpdate,
} from "../../models/Admin.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { generateTokens } from "../../utils/tokenUtils.js";
import { sendEmail } from "../../utils/emailService.js";
import { generateOtp, generateOtpExpiry } from "../../utils/otpGenerator.js";

// Helper function to set auth cookies
const setAuthCookies = (res, tokens) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
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
 * Register Super Admin
 * Only one super admin is allowed in the system
 * @route POST /api/v1/auth/super-admin/register
 */
export const registerSuperAdmin = async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateSuperAdminRegistration(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const { name, email, password, dateOfBirth } = req.body;

    // Check if super admin already exists
    const existingSuperAdmin = await Admin.findOne({ role: "super_admin" });
    if (existingSuperAdmin) {
      return next(
        new APIError(
          409,
          "Super Admin already exists. Only one Super Admin is allowed in the system."
        )
      );
    }

    // Check if email already exists
    const existingEmail = await Admin.findOne({ email });
    if (existingEmail) {
      return next(new APIError(409, "Email is already registered"));
    }

    // Generate OTP for email verification
    const otp = generateOtp();
    const otpExpiry = generateOtpExpiry(10); // 10 minutes

    // Create super admin with unverified status
    const superAdmin = new Admin({
      name,
      email,
      password,
      dateOfBirth: new Date(dateOfBirth),
      role: "super_admin",
      emailVerified: false,
      emailVerificationOtp: otp,
      emailVerificationOtpExpiry: otpExpiry,
      status: "active", // Super admin is active by default
    });

    await superAdmin.save();

    // Send verification email
    await sendEmail({
      to: email,
      subject: "Super Admin Email Verification",
      template: "super-admin-verification",
      data: {
        name,
        otp,
        expiryMinutes: 10,
      },
    });

    res.status(201).json(
      new APIResponse(
        201,
        {
          superAdmin: {
            id: superAdmin._id,
            name: superAdmin.name,
            email: superAdmin.email,
            role: superAdmin.role,
            emailVerified: superAdmin.emailVerified,
          },
          message:
            "Super Admin account created successfully. Please verify your email using the OTP sent to your email address.",
        },
        "Registration successful. Please check your email for verification OTP."
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Verify Email with OTP
 * @route POST /api/v1/auth/super-admin/verify-email
 */
export const verifyEmail = async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateEmailVerification(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const { email, otp } = req.body;

    // Find super admin by email
    const superAdmin = await Admin.findOne({
      email,
      role: "super_admin",
    });

    if (!superAdmin) {
      return next(new APIError(404, "Super Admin not found"));
    }

    // Check if already verified
    if (superAdmin.emailVerified) {
      return next(new APIError(400, "Email is already verified"));
    }

    // Check if OTP matches
    if (superAdmin.emailVerificationOtp !== otp) {
      return next(new APIError(400, "Invalid OTP"));
    }

    // Check if OTP has expired
    if (new Date() > superAdmin.emailVerificationOtpExpiry) {
      return next(
        new APIError(
          400,
          "OTP has expired. Please request a new OTP using the resend option."
        )
      );
    }

    // Update verification status
    superAdmin.emailVerified = true;
    superAdmin.emailVerificationOtp = undefined;
    superAdmin.emailVerificationOtpExpiry = undefined;
    await superAdmin.save();

    res.status(200).json(
      new APIResponse(
        200,
        {
          superAdmin: {
            id: superAdmin._id,
            name: superAdmin.name,
            email: superAdmin.email,
            role: superAdmin.role,
            emailVerified: superAdmin.emailVerified,
          },
        },
        "Email verified successfully. You can now login."
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Resend OTP for email verification
 * @route POST /api/v1/auth/super-admin/resend-otp
 */
export const resendOtp = async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateResendOtp(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const { email } = req.body;

    // Find super admin by email
    const superAdmin = await Admin.findOne({
      email,
      role: "super_admin",
    });

    if (!superAdmin) {
      return next(new APIError(404, "Super Admin not found"));
    }

    // Check if already verified
    if (superAdmin.emailVerified) {
      return next(
        new APIError(400, "Email is already verified. Please login.")
      );
    }

    // Generate new OTP
    const otp = generateOtp();
    const otpExpiry = generateOtpExpiry(10); // 10 minutes

    // Update OTP in database
    superAdmin.emailVerificationOtp = otp;
    superAdmin.emailVerificationOtpExpiry = otpExpiry;
    await superAdmin.save();

    // Send new verification email
    await sendEmail({
      to: email,
      subject: "Super Admin Email Verification - New OTP",
      template: "super-admin-verification",
      data: {
        name: superAdmin.name,
        otp,
        expiryMinutes: 10,
      },
    });

    res.status(200).json(
      new APIResponse(
        200,
        {
          message: "New OTP has been sent to your email address",
          expiresIn: "10 minutes",
        },
        "OTP resent successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Login Super Admin
 * Requires email, password, and dateOfBirth for authentication
 * @route POST /api/v1/auth/super-admin/login
 */
export const loginSuperAdmin = async (req, res, next) => {
  try {
    // Validate request body
    const { error } = validateSuperAdminLogin(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const { email, password, dateOfBirth } = req.body;

    // Find super admin by email and role
    const superAdmin = await Admin.findOne({
      email,
      role: "super_admin",
    });

    if (!superAdmin) {
      return next(new APIError(401, "Invalid credentials"));
    }

    // Check if account is locked
    if (superAdmin.isLocked) {
      return next(
        new APIError(
          423,
          "Account is temporarily locked due to too many failed login attempts. Please try again later."
        )
      );
    }

    // Check if account is active
    if (superAdmin.status !== "active") {
      return next(
        new APIError(403, "Account is inactive. Please contact support.")
      );
    }

    // Check if email is verified
    if (!superAdmin.emailVerified) {
      return next(
        new APIError(
          403,
          "Please verify your email first before logging in. Check your email for the verification OTP."
        )
      );
    }

    // Verify password
    const isPasswordValid = await superAdmin.comparePassword(password);
    if (!isPasswordValid) {
      await superAdmin.incLoginAttempts();
      return next(new APIError(401, "Invalid credentials"));
    }

    // Verify date of birth
    const providedDOB = new Date(dateOfBirth).toISOString().split("T")[0];
    const storedDOB = new Date(superAdmin.dateOfBirth)
      .toISOString()
      .split("T")[0];

    if (providedDOB !== storedDOB) {
      await superAdmin.incLoginAttempts();
      return next(new APIError(401, "Invalid credentials"));
    }

    // Reset login attempts on successful login
    await superAdmin.resetLoginAttempts();

    // Generate JWT tokens
    const tokens = generateTokens({
      _id: superAdmin._id,
      email: superAdmin.email,
      role: superAdmin.role,
    });

    // Update refresh token and last login
    superAdmin.refreshToken = tokens.refreshToken;
    superAdmin.lastLogin = new Date();
    await superAdmin.save();

    // Set cookies
    setAuthCookies(res, tokens);

    res.status(200).json(
      new APIResponse(
        200,
        {
          superAdmin: {
            id: superAdmin._id,
            name: superAdmin.name,
            email: superAdmin.email,
            role: superAdmin.role,
            dateOfBirth: superAdmin.dateOfBirth,
            emailVerified: superAdmin.emailVerified,
            lastLogin: superAdmin.lastLogin,
            createdAt: superAdmin.createdAt,
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
        "Super Admin logged in successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Logout Super Admin
 * Clears refresh token and auth cookies
 * @route POST /api/v1/auth/super-admin/logout
 */
export const logoutSuperAdmin = async (req, res, next) => {
  try {
    // Clear refresh token from database
    const superAdmin = await Admin.findById(req.admin._id);
    if (superAdmin) {
      superAdmin.refreshToken = null;
      await superAdmin.save();
    }

    // Clear cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    res.status(200).json(new APIResponse(200, null, "Logged out successfully"));
  } catch (error) {
    next(error);
  }
};

/**
 * Get Super Admin Profile
 * Returns current super admin's profile information
 * @route GET /api/v1/auth/super-admin/profile
 */
export const getSuperAdminProfile = async (req, res, next) => {
  try {
    const superAdmin = await Admin.findById(req.admin._id).select(
      "-password -refreshToken -emailVerificationOtp -emailVerificationOtpExpiry"
    );

    if (!superAdmin) {
      return next(new APIError(404, "Super Admin not found"));
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          superAdmin: {
            id: superAdmin._id,
            name: superAdmin.name,
            email: superAdmin.email,
            role: superAdmin.role,
            dateOfBirth: superAdmin.dateOfBirth,
            emailVerified: superAdmin.emailVerified,
            status: superAdmin.status,
            lastLogin: superAdmin.lastLogin,
            createdAt: superAdmin.createdAt,
            updatedAt: superAdmin.updatedAt,
          },
        },
        "Profile retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Update Super Admin Profile
 * Allows updating name only (email and dateOfBirth cannot be changed)
 * @route PUT /api/v1/auth/super-admin/profile
 */
export const updateSuperAdminProfile = async (req, res, next) => {
  try {
    // Only allow updating name
    const allowedUpdates = ["name"];
    const updates = {};

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Check if there are any valid updates
    if (Object.keys(updates).length === 0) {
      return next(new APIError(400, "No valid fields to update"));
    }

    // Validate name if provided
    if (updates.name && updates.name.trim().length < 2) {
      return next(new APIError(400, "Name must be at least 2 characters long"));
    }

    const superAdmin = await Admin.findByIdAndUpdate(req.admin._id, updates, {
      new: true,
      runValidators: true,
    }).select(
      "-password -refreshToken -emailVerificationOtp -emailVerificationOtpExpiry"
    );

    if (!superAdmin) {
      return next(new APIError(404, "Super Admin not found"));
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          superAdmin: {
            id: superAdmin._id,
            name: superAdmin.name,
            email: superAdmin.email,
            role: superAdmin.role,
            dateOfBirth: superAdmin.dateOfBirth,
            emailVerified: superAdmin.emailVerified,
            status: superAdmin.status,
            lastLogin: superAdmin.lastLogin,
            updatedAt: superAdmin.updatedAt,
          },
        },
        "Profile updated successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};
