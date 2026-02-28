/*----------- Import External package -------------*/
import jwt from "jsonwebtoken";

/*-------------- Import Model ----------------*/
import {
  Admin,
  validateAdmin,
  validateAdminLogin,
  validateAdminUpdate,
  validatePasswordChange,
  validatePasswordReset,
  validateEmailVerification,
  validateResendOtp,
} from "../../models/Admin.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";

/*-------------- Import utils ----------------*/
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";
import { generateTokens } from "../../utils/tokenUtils.js";
import { generateResetToken, hashToken } from "../../utils/tokenGenerator.js";
import {
  sendEmail,
  sendAdminPasswordResetEmail,
} from "../../utils/emailService.js";
import { generateOtp, hashOtp, verifyOtp } from "../../utils/otpGenerator.js";
import { logger } from "../../utils/logger.js";
import fs from "fs";

/*-------------- Import config ----------------*/
import {
  CookieOptions,
  AccessTokenCookieOptions,
  RefreshTokenCookieOptions,
} from "../../config/jwtOptions.js";

// Update admin profile
export const updateAdminProfile = async (req, res, next) => {
  try {
    const allowedUpdates = ["name", "phone", "profileImage"];
    const updates = {};
    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Handle profile image upload
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.path);
        updates.profileImage = result.secure_url;
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (uploadError) {
        console.error("Error uploading admin profile image:", uploadError);
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }
    }

    const admin = await Admin.findByIdAndUpdate(req.admin._id, updates, {
      new: true,
      runValidators: true,
    });
    if (!admin) {
      return next(new APIError(404, "Admin not found"));
    }
    res
      .status(200)
      .json(new APIResponse(200, { admin }, "Profile updated successfully"));
  } catch (error) {
    next(error);
  }
};

// Change password
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return next(new APIError(400, "Current and new password are required"));
    }
    const admin = await Admin.findById(req.admin._id);
    if (!admin) {
      return next(new APIError(404, "Admin not found"));
    }
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return next(new APIError(400, "Current password is incorrect"));
    }
    admin.password = newPassword;
    await admin.save();
    res
      .status(200)
      .json(new APIResponse(200, null, "Password changed successfully"));
  } catch (error) {
    next(error);
  }
};

const setAuthCookies = (res, tokens) => {
  res.cookie("accessToken", tokens.accessToken, AccessTokenCookieOptions);
  res.cookie("refreshToken", tokens.refreshToken, RefreshTokenCookieOptions);
};

// Admin login
export const loginAdmin = async (req, res, next) => {
  try {
    const { error } = validateAdminLogin(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const { email, password } = req.body;

    // Find admin by email
    const admin = await Admin.findOne({ email }).populate({
      path: "assignedBranches",
      select: "name branchId location hotel",
      populate: {
        path: "hotel",
        select: "_id name hotelId",
      },
    });

    if (!admin) {
      return next(new APIError(401, "Invalid email or password"));
    }

    // Check if account is locked
    if (admin.isLocked) {
      return next(
        new APIError(
          423,
          "Account is temporarily locked due to too many failed login attempts"
        )
      );
    }

    // Check if account is active
    if (admin.status !== "active") {
      return next(
        new APIError(403, "Account is inactive. Please contact super admin.")
      );
    }

    // Check if email is verified
    if (!admin.emailVerified) {
      return next(
        new APIError(
          403,
          "Please verify your email first before logging in. Check your email for the verification OTP."
        )
      );
    }

    // Compare password
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      await admin.incLoginAttempts();
      return next(new APIError(401, "Invalid email or password"));
    }

    // Reset login attempts on successful login
    await admin.resetLoginAttempts();

    // Auto-assign branches if admin has no assigned branches
    if (!admin.assignedBranches || admin.assignedBranches.length === 0) {
      // Find all hotels created by this admin
      const adminHotels = await Hotel.find({ createdBy: admin._id }).select(
        "_id"
      );

      if (adminHotels.length > 0) {
        // Find all branches for these hotels
        const hotelIds = adminHotels.map((hotel) => hotel._id);
        const branches = await Branch.find({
          hotel: { $in: hotelIds },
          status: "active",
        }).select("_id");

        if (branches.length > 0) {
          // Auto-assign all branches to admin
          admin.assignedBranches = branches.map((branch) => branch._id);
          await admin.save();

          // Re-fetch admin with populated branches
          const updatedAdmin = await Admin.findById(admin._id).populate({
            path: "assignedBranches",
            select: "name branchId location hotel",
            populate: {
              path: "hotel",
              select: "_id name hotelId",
            },
          });

          // Update admin object with populated data
          admin.assignedBranches = updatedAdmin.assignedBranches;
        }
      }
    }

    try {
      // Generate tokens
      const tokens = generateTokens({
        _id: admin._id,
        role: admin.role,
        permissions: admin.permissions,
      });

      // Update refresh token
      admin.refreshToken = tokens.refreshToken;
      await admin.save();

      // Fetch hotels created by this admin
      const createdHotels = await Hotel.find({ createdBy: admin._id })
        .select(
          "name hotelId mainLocation contactInfo status rating starRating images"
        )
        .lean();

      // Set cookies
      setAuthCookies(res, tokens);

      res.status(200).json(
        new APIResponse(
          200,
          {
            admin: {
              id: admin._id,
              name: admin.name,
              email: admin.email,
              role: admin.role,
              department: admin.department,
              permissions: admin.permissions,
              assignedBranches: admin.assignedBranches,
              lastLogin: admin.lastLogin,
            },
            createdHotels: createdHotels || [],
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          },
          "Admin logged in successfully"
        )
      );
    } catch (tokenError) {
      return next(new APIError(500, "Token generation failed"));
    }
  } catch (error) {
    next(error);
  }
};

// Admin logout
export const logoutAdmin = async (req, res, next) => {
  try {
    // Clear refresh token from database
    await Admin.findByIdAndUpdate(req.admin._id, {
      $unset: { refreshToken: 1 },
    });

    // Clear cookies
    res.clearCookie("accessToken", CookieOptions);
    res.clearCookie("refreshToken", CookieOptions);

    res
      .status(200)
      .json(new APIResponse(200, null, "Admin logged out successfully"));
  } catch (error) {
    next(error);
  }
};

// Get admin profile
export const getAdminProfile = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.admin._id)
      .populate("assignedBranches", "name branchId location")
      .populate("createdBy", "name email");

    if (!admin) {
      return next(new APIError(404, "Admin not found"));
    }

    res
      .status(200)
      .json(
        new APIResponse(200, { admin }, "Admin profile retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};

// Register Admin
export const registerAdmin = async (req, res, next) => {
  try {
    const { error } = validateAdmin(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const { name, email, phone, password, profileImage } = req.body;

    // Check if admin with same email already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return next(new APIError(400, "Admin with this email already exists"));
    }

    // Generate OTP and expiry
    const otp = generateOtp();
    const hashedOtp = hashOtp(otp);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const admin = new Admin({
      name,
      email,
      phone,
      password,
      profileImage: profileImage || null,
      role: "admin",
      status: "active",
      emailVerified: false,
      emailVerificationOtp: hashedOtp,
      emailVerificationOtpExpiry: otpExpiry,
    });

    await admin.save();

    // Send OTP email
    await sendEmail({
      to: admin.email,
      subject: "Verify your admin account",
      text: `Your OTP for email verification is: ${otp}`,
    });

    res.status(201).json(
      new APIResponse(
        201,
        {
          admin: {
            id: admin._id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
            status: admin.status,
            profileImage: admin.profileImage,
          },
        },
        "Admin created successfully. Please verify your email using the OTP sent to your email before logging in."
      )
    );
  } catch (error) {
    next(error);
  }
};

// Forgot password
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return next(new APIError(400, "Email is required"));
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      // Don't reveal if email exists or not
      return res
        .status(200)
        .json(
          new APIResponse(
            200,
            null,
            "If the email exists, a password reset link has been sent"
          )
        );
    }

    // Generate reset token and hash it for secure storage (Issue #1, #4)
    const resetToken = generateResetToken();
    const hashedToken = hashToken(resetToken);

    admin.passwordResetToken = hashedToken;
    admin.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await admin.save();

    // Send reset email via dedicated service function (Issue #2)
    await sendAdminPasswordResetEmail(admin.email, resetToken, admin.name);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          null,
          "If the email exists, a password reset link has been sent"
        )
      );
  } catch (error) {
    next(error);
  }
};

// Reset password
export const resetPassword = async (req, res, next) => {
  try {
    const { error } = validatePasswordReset(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const { token, newPassword } = req.body;

    // Hash the received token to compare with stored hashed token (Issue #4)
    const hashedToken = hashToken(token);

    const admin = await Admin.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!admin) {
      return next(new APIError(400, "Invalid or expired reset token"));
    }

    // Update password (let model pre-save middleware handle hashing — Issue #3)
    admin.password = newPassword;
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;
    admin.loginAttempts = 0;
    admin.lockUntil = undefined;
    admin.refreshToken = null; // Invalidate all sessions (Issue #9)
    await admin.save();

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          null,
          "Password reset successfully. All existing sessions have been invalidated for security. Please log in again with your new password."
        )
      );
  } catch (error) {
    next(error);
  }
};

// Verify email by OTP
export const verifyEmail = async (req, res, next) => {
  try {
    const { error } = validateEmailVerification(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const { email, otp } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return next(new APIError(404, "Admin not found"));
    }

    if (admin.emailVerified) {
      return res
        .status(200)
        .json(new APIResponse(200, null, "Email already verified"));
    }

    if (!admin.emailVerificationOtp || !admin.emailVerificationOtpExpiry) {
      return next(new APIError(400, "No OTP found. Please request a new one."));
    }

    if (admin.emailVerificationOtpExpiry < new Date()) {
      return next(
        new APIError(400, "OTP has expired. Please request a new one.")
      );
    }

    // Verify OTP using secure comparison
    if (!verifyOtp(otp, admin.emailVerificationOtp)) {
      return next(new APIError(400, "Invalid OTP"));
    }

    admin.emailVerified = true;
    admin.emailVerificationOtp = undefined;
    admin.emailVerificationOtpExpiry = undefined;
    await admin.save();

    res
      .status(200)
      .json(new APIResponse(200, null, "Email verified successfully"));
  } catch (error) {
    next(error);
  }
};

// Resend email verification OTP
export const resendVerificationOtp = async (req, res, next) => {
  try {
    const { error } = validateResendOtp(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const { email } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return next(new APIError(404, "Admin not found"));
    }

    if (admin.emailVerified) {
      return res
        .status(200)
        .json(new APIResponse(200, null, "Email is already verified"));
    }

    // Check if we can resend OTP (rate limiting)
    const now = new Date();
    const lastOtpTime = admin.emailVerificationOtpExpiry
      ? new Date(admin.emailVerificationOtpExpiry.getTime() - 10 * 60 * 1000)
      : null; // Subtract 10 minutes to get creation time

    if (lastOtpTime && now - lastOtpTime < 60 * 1000) {
      // 1 minute cooldown
      return next(
        new APIError(
          429,
          "Please wait at least 1 minute before requesting a new OTP"
        )
      );
    }

    // Generate new OTP and expiry
    const otp = generateOtp();
    const hashedOtp = hashOtp(otp);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    admin.emailVerificationOtp = hashedOtp;
    admin.emailVerificationOtpExpiry = otpExpiry;
    await admin.save();

    // Send OTP email
    await sendEmail({
      to: admin.email,
      subject: "Verify your admin account - New OTP",
      text: `Your new OTP for email verification is: ${otp}. This OTP will expire in 10 minutes.`,
    });

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          null,
          "New verification OTP has been sent to your email address"
        )
      );
  } catch (error) {
    next(error);
  }
};

// Get all admins (only for super_admin)
export const getAllAdmins = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      role,
      status,
      department,
      search,
    } = req.query;

    const query = {};

    if (role) query.role = role;
    if (status) query.status = status;
    if (department) query.department = department;

    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { employeeId: new RegExp(search, "i") },
      ];
    }

    const skip = (page - 1) * limit;

    const admins = await Admin.find(query)
      .populate("assignedBranches", "name branchId location")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalAdmins = await Admin.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          admins,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalAdmins / limit),
            totalAdmins,
            hasNextPage: page < Math.ceil(totalAdmins / limit),
            hasPrevPage: page > 1,
          },
        },
        "Admins retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

// Update admin (only for super_admin)
export const updateAdmin = async (req, res, next) => {
  try {
    const { adminId } = req.params;
    const { error } = validateAdminUpdate(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    // Filter allowed fields to prevent privilege escalation (Issue #10)
    const allowedFields = [
      "name",
      "phone",
      "profileImage",
      "department",
      "status",
      "assignedBranches",
      "employeeId",
    ];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const admin = await Admin.findByIdAndUpdate(adminId, updates, {
      new: true,
      runValidators: true,
    }).populate("assignedBranches", "name branchId location");

    if (!admin) {
      return next(new APIError(404, "Admin not found"));
    }

    res
      .status(200)
      .json(new APIResponse(200, { admin }, "Admin updated successfully"));
  } catch (error) {
    next(error);
  }
};

// Delete admin (only for super_admin)
export const deleteAdmin = async (req, res, next) => {
  try {
    const { adminId } = req.params;

    const admin = await Admin.findByIdAndUpdate(
      adminId,
      { status: "inactive" },
      { new: true }
    );

    if (!admin) {
      return next(new APIError(404, "Admin not found"));
    }

    res
      .status(200)
      .json(new APIResponse(200, null, "Admin deactivated successfully"));
  } catch (error) {
    next(error);
  }
};

// Bootstrap Super Admin - Only works if no Super Admin exists
export const bootstrapSuperAdmin = async (req, res, next) => {
  try {
    logger.info("Bootstrap Super Admin request received");

    // Production Security: Check if any Super Admin already exists
    const existingSuperAdmin = await Admin.findOne({ role: "super_admin" });

    if (existingSuperAdmin) {
      logger.warn("Bootstrap attempt blocked - Super Admin already exists");
      return next(
        new APIError(403, "Super Admin already exists. Bootstrap not allowed.")
      );
    }

    // Validate request data
    const { error } = validateAdmin(req.body);
    if (error) {
      logger.error("Bootstrap validation failed", {
        message: error.details[0].message,
      });
      return next(new APIError(400, error.details[0].message));
    }

    const {
      name,
      email,
      phone,
      password,
      department = "system",
      employeeId,
    } = req.body;

    // Production Security: Validate password strength
    if (password.length < 8) {
      return next(
        new APIError(
          400,
          "Password must be at least 8 characters long for Super Admin"
        )
      );
    }

    // Check if admin with this email already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      logger.error("Bootstrap failed - Email already exists", { email });
      return next(new APIError(409, "Admin with this email already exists"));
    }

    logger.info("Creating Super Admin", { name, email, department });

    // Generate email verification token (though auto-verified)
    const emailVerificationToken = generateResetToken();

    // Create Super Admin with full permissions
    // Note: Password will be automatically hashed by the pre-save middleware
    const superAdmin = new Admin({
      name,
      email,
      phone,
      password, // Don't hash here - let the model's pre-save middleware handle it
      role: "super_admin",
      department,
      employeeId: employeeId || "SUPER001",
      assignedBranches: [], // Super admin has access to all branches
      permissions: {
        manageBranches: true,
        manageUsers: true,
        manageManagers: true,
        manageStaff: true,
        manageMenu: true,
        managePricing: true,
        manageOffers: true,
        viewReports: true,
        viewAnalytics: true,
        viewFinancials: true,
        manageInventory: true,
        manageSystem: true,
        manageAdmins: true,
      },
      emailVerificationToken,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      emailVerified: true, // Auto-verify for bootstrap
      status: "active",
    });

    await superAdmin.save();
    logger.info("Super Admin saved to database successfully");

    // Generate secure tokens
    const { accessToken, refreshToken } = generateTokens(superAdmin);

    // Set secure HTTP-only cookies
    setAuthCookies(res, { accessToken, refreshToken });

    // Remove sensitive data from response
    const adminResponse = superAdmin.toObject();
    delete adminResponse.password;
    delete adminResponse.emailVerificationToken;
    delete adminResponse.passwordResetToken;

    logger.info("Super Admin bootstrap completed successfully");

    res.status(201).json(
      new APIResponse(
        201,
        {
          admin: adminResponse,
          accessToken,
          refreshToken,
          systemStatus: "initialized",
          message:
            "🎉 Super Admin created successfully! System is now ready for production use.",
          nextSteps: [
            "1. Create your first hotel using POST /api/v1/admin/hotels",
            "2. Create branches using POST /api/v1/admin/branches",
            "3. Create additional admins using POST /api/v1/auth/admin/register",
            "4. Set up menu categories and items",
          ],
        },
        "Super Admin bootstrap completed successfully"
      )
    );
  } catch (error) {
    logger.error("Super Admin bootstrap failed", { message: error.message });
    next(error);
  }
};
