/* ---------- Import External Packages ---------- */
import bcrypt from "bcrypt";
import fs from "fs";

/* ---------- Import Models ---------- */
import {
  User,
  validateUser,
  validateEditProfile,
  validateChangePassword,
  validateResetPassword,
} from "../../models/User.model.js";

/* ---------- Import Utils ---------- */
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import { generateTokens } from "../../utils/tokenUtils.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";
import { generateOtp } from "../../utils/otpGenerator.js";
import {
  sendEmailOtp,
  sendPasswordResetEmail,
} from "../../utils/emailService.js";
import { generateResetToken, hashToken } from "../../utils/tokenGenerator.js";

/* ---------- Import Config ---------- */
import {
  AccessTokenCookieOptions,
  RefreshTokenCookieOptions,
} from "../../config/jwtOptions.js";

/* ---------- User Signup Controllers ---------- */
export const Signup = async (req, res) => {
  try {
    logger.info("Signup attempt with data:", {
      name: req.body.name,
      username: req.body.username,
      email: req.body.email,
      phone: req.body.phone,
    });

    // Validate input
    const { error } = validateUser(req.body);
    if (error) {
      logger.error("Validation error:", { message: error.details[0].message });
      throw new APIError(400, error.details[0].message);
    }

    const { name, username, email, password, phone } = req.body;
    logger.info("Validation passed, checking for existing user...");

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }, { phone }],
    });
    if (existingUser) {
      logger.error("User already exists:", existingUser.email);
      throw new APIError(
        400,
        "User with this email, username, or phone already exists"
      );
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Handle profile image upload
    let profileImageUrl = null;
    if (req.file) {
      try {
        logger.info("Uploading profile image to cloudinary...");
        const cloudinaryResponse = await uploadToCloudinary(req.file.path);
        // Extract the secure URL from the Cloudinary response
        profileImageUrl =
          cloudinaryResponse.secure_url || cloudinaryResponse.url;
        // Remove local file after upload
        fs.unlinkSync(req.file.path);
        logger.info(
          "Profile image uploaded successfully, URL:",
          profileImageUrl
        );
      } catch (uploadError) {
        logger.error("Profile image upload failed:", { uploadError });
        // Continue with signup even if image upload fails
      }
    }

    // Generate only email OTP (skip SMS for now)
    const emailOtp = generateOtp();

    logger.info("Creating new user...");
    // Create user
    const newUser = new User({
      name,
      username,
      email,
      phone,
      password: hashedPassword,
      profileImage: profileImageUrl,
      emailOtp,
      // phoneOtp removed - we'll implement SMS verification later
      // isPhoneVerified defaults to false, phone verification will be added later
    });

    await newUser.save();
    logger.info("User saved successfully");

    // Send only email OTP
    try {
      await sendEmailOtp(email, emailOtp);
      if (process.env.NODE_ENV === "development") {
        logger.debug("Email OTP sent", { email });
      }
    } catch (emailError) {
      logger.error("Failed to send email OTP:", emailError);
      throw new APIError(
        500,
        "Failed to send verification email. Please try again."
      );
    }

    // Return response without sensitive data
    const userResponse = {
      id: newUser._id,
      name: newUser.name,
      username: newUser.username,
      email: newUser.email,
      phone: newUser.phone,
      profileImage: newUser.profileImage,
      isEmailVerified: newUser.isEmailVerified,
      coins: newUser.coins,
    };

    res.status(201).json({
      success: true,
      message:
        "User registered successfully. Please verify your email to complete the registration.",
      data: userResponse,
    });
  } catch (error) {
    // Clean up uploaded file if there's an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    logger.error("Signup error:", { error });
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during signup");
  }
};

/*---------- Verify the email ------------- */
export const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      throw new APIError(400, "Email and OTP are required");
    }

    const user = await User.findOne({ email });
    if (!user) {
      throw new APIError(404, "User not found");
    }

    if (user.isEmailVerified) {
      throw new APIError(400, "Email is already verified");
    }

    if (user.emailOtp !== otp) {
      throw new APIError(400, "Invalid OTP");
    }

    // Update user verification status
    user.isEmailVerified = true;
    user.emailOtp = null; // Clear OTP after verification
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

/* ---------------- Login -------------------- */
export const Login = async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      throw new APIError(
        400,
        "Please provide your email or username and password"
      );
    }

    // Find user by email or username
    const user = await User.findOne({
      $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
    });

    if (!user) {
      throw new APIError(401, "Invalid credentials");
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      throw new APIError(
        403,
        "Email not verified. Please verify your email to continue."
      );
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new APIError(401, "Invalid credentials");
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save();

    // Set cookies
    res.cookie("accessToken", accessToken, AccessTokenCookieOptions);
    res.cookie("refreshToken", refreshToken, RefreshTokenCookieOptions);

    // Return user data without sensitive information
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
    };

    res.status(200).json({
      success: true,
      message: "Login successful. Welcome back!",
      data: {
        user: userResponse,
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during login");
  }
};

/*--------- Resend OTP ---------- */
export const resendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new APIError(400, "Email is required");
    }

    const user = await User.findOne({ email });
    if (!user) {
      throw new APIError(404, "No account found with this email");
    }

    if (user.isEmailVerified) {
      throw new APIError(400, "This email is already verified");
    }

    // Generate new OTP
    const emailOtp = generateOtp();
    user.emailOtp = emailOtp;
    await user.save();

    // Send OTP
    await sendEmailOtp(email, emailOtp);

    res.status(200).json({
      success: true,
      message: "Verification OTP has been sent to your email",
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error while resending email OTP");
  }
};

/*------------ ForgotPassword ---------------- */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new APIError(400, "Email is required");
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.status(200).json({
        success: true,
        message:
          "If an account with this email exists, you will receive a password reset link shortly.",
      });
    }

    // Generate reset token
    const resetToken = generateResetToken();
    const hashedToken = hashToken(resetToken);

    // Set reset token and expiry (15 minutes)
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await user.save();

    // Send password reset email
    try {
      await sendPasswordResetEmail(email, resetToken);
    } catch (emailError) {
      logger.error("Failed to send password reset email", { emailError });
      throw new APIError(
        500,
        "Failed to send password reset email. Please try again."
      );
    }

    // Include reset token in response for development/testing
    // In production, remove the resetToken from response for security
    const response = {
      success: true,
      message: "Password reset link sent to your email",
    };

    // Add token to response only in development mode
    if (process.env.NODE_ENV === "development") {
      response.resetToken = resetToken;
      response.note =
        "Reset token included for testing purposes. Use this token in the reset-password endpoint.";
    }

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(
      500,
      "Internal server error during password reset request"
    );
  }
};

/*------------ Reset Password ---------------- */
export const resetPassword = async (req, res) => {
  try {
    const { error } = validateResetPassword(req.body);
    if (error) throw new APIError(400, error.details[0].message);

    const { token, newPassword } = req.body;

    // Hash the received token to compare with stored token
    const hashedToken = hashToken(token);

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw new APIError(400, "Invalid or expired reset token");
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear reset token
    user.password = hashedPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.refreshToken = null; // Invalidate all sessions
    await user.save();

    res.status(200).json({
      success: true,
      message:
        "Password reset successfully. Please login with your new password.",
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during password reset");
  }
};

/*------------ Edit Profile ---------------- */
export const editProfile = async (req, res) => {
  try {
    logger.info("Edit profile attempt for user:", req.user?.id);
    const userId = req.user.id; // From auth middleware
    const { error } = validateEditProfile(req.body);
    if (error) {
      logger.error("Validation error:", { message: error.details[0].message });
      throw new APIError(400, error.details[0].message);
    }

    const { name, username, phone } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      throw new APIError(404, "User not found");
    }

    // Check if username or phone already exists (if being updated)
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        throw new APIError(400, "This username is already taken");
      }
    }

    if (phone && phone !== user.phone) {
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        throw new APIError(400, "This phone number is already in use");
      }
    }

    // Handle profile image upload
    let profileImageUrl = user.profileImage;
    if (req.file) {
      try {
        logger.info("Uploading new profile image...");
        const cloudinaryResponse = await uploadToCloudinary(req.file.path);
        // Extract the secure URL from the Cloudinary response
        profileImageUrl =
          cloudinaryResponse.secure_url || cloudinaryResponse.url;
        // Remove local file after upload
        fs.unlinkSync(req.file.path);
        logger.info(
          "Profile image uploaded successfully, URL:",
          profileImageUrl
        );
      } catch (uploadError) {
        logger.error("Profile image upload failed:", { uploadError });
        throw new APIError(500, "Failed to upload profile image");
      }
    }

    // Update user fields
    if (name) user.name = name;
    if (username) user.username = username;
    if (phone) user.phone = phone;
    if (profileImageUrl !== user.profileImage)
      user.profileImage = profileImageUrl;

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
    };

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: userResponse,
    });
  } catch (error) {
    // Clean up uploaded file if there's an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    logger.error("Edit profile error:", error);
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during profile update");
  }
};

/*------------- Change Password ---------------- */
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { error } = validateChangePassword(req.body);
    if (error) throw new APIError(400, error.details[0].message);

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      throw new APIError(404, "User not found");
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      throw new APIError(400, "Current password is incorrect");
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password and invalidate all sessions
    user.password = hashedPassword;
    user.refreshToken = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully. Please log in again.",
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during password change");
  }
};

/*--------------- Get Profile -------------- */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

    const user = await User.findById(userId).select(
      "-password -refreshToken -emailOtp -phoneOtp -passwordResetToken -passwordResetExpires"
    );
    if (!user) {
      throw new APIError(404, "User not found");
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error while fetching profile");
  }
};

/*-------------- Logout ----------------*/
export const logout = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

    // Clear refresh token from database
    await User.findByIdAndUpdate(userId, {
      refreshToken: null,
    });

    // Clear cookies
    res.clearCookie("accessToken", AccessTokenCookieOptions);
    res.clearCookie("refreshToken", RefreshTokenCookieOptions);

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during logout");
  }
};

export const logoutAll = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

    // Clear refresh token from database (invalidates all sessions)
    await User.findByIdAndUpdate(userId, {
      refreshToken: null,
    });

    // Clear cookies
    res.clearCookie("accessToken", AccessTokenCookieOptions);
    res.clearCookie("refreshToken", RefreshTokenCookieOptions);

    res.status(200).json({
      success: true,
      message: "Logged out from all devices successfully",
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(
      500,
      "Internal server error during logout from all devices"
    );
  }
};
