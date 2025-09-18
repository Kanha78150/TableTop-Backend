import bcrypt from "bcrypt";
import { APIError } from "../../utils/APIError.js";
import {
  User,
  validateUser,
  validateEditProfile,
  validateChangePassword,
  validateResetPassword,
} from "../../models/User.model.js";
import { generateTokens } from "../../utils/tokenUtils.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";
import { generateOtp } from "../../utils/otpGenerator.js";
import {
  sendEmailOtp,
  sendPasswordResetEmail,
} from "../../utils/emailService.js";
import { generateResetToken, hashToken } from "../../utils/tokenGenerator.js";
import { CookieOptions } from "../../config/jwtOptions.js";
import fs from "fs";

export const Signup = async (req, res) => {
  try {
    console.log("Signup attempt with data:", req.body);

    // Validate input
    const { error } = validateUser(req.body);
    if (error) {
      console.log("Validation error:", error.details[0].message);
      throw new APIError(400, error.details[0].message);
    }

    const { name, username, email, password, phone } = req.body;
    console.log("Validation passed, checking for existing user...");

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }, { phone }],
    });
    if (existingUser) {
      console.log("User already exists:", existingUser.email);
      throw new APIError(
        400,
        "User with this email, username, or phone already exists"
      );
    }

    console.log("No existing user found, hashing password...");
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    console.log("Password hashed, handling profile image...");
    // Handle profile image upload
    let profileImageUrl = null;
    if (req.file) {
      try {
        console.log("Uploading profile image to cloudinary...");
        const cloudinaryResponse = await uploadToCloudinary(req.file.path);
        // Extract the secure URL from the Cloudinary response
        profileImageUrl =
          cloudinaryResponse.secure_url || cloudinaryResponse.url;
        // Remove local file after upload
        fs.unlinkSync(req.file.path);
        console.log(
          "Profile image uploaded successfully, URL:",
          profileImageUrl
        );
      } catch (uploadError) {
        console.error("Profile image upload failed:", uploadError);
        // Continue with signup even if image upload fails
      }
    }

    console.log("Generating OTP...");
    // Generate only email OTP (skip SMS for now)
    const emailOtp = generateOtp();

    console.log("Creating new user...");
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

    console.log("Saving user to database...");
    await newUser.save();
    console.log("User saved successfully");

    console.log("Sending email OTP...");
    // Send only email OTP
    try {
      await sendEmailOtp(email, emailOtp);
      console.log(`Email OTP sent to ${email}`);
    } catch (emailError) {
      console.error("Failed to send email OTP:", emailError);
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

    console.error("Signup error:", error);
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during signup");
  }
};

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

export const Login = async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      throw new APIError(400, "Email/Username and password are required");
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
      throw new APIError(403, "Please verify your email before logging in");
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
    res.cookie("accessToken", accessToken, CookieOptions);
    res.cookie("refreshToken", refreshToken, CookieOptions);

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
      message: "Login successful",
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

export const resendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new APIError(400, "Email is required");
    }

    const user = await User.findOne({ email });
    if (!user) {
      throw new APIError(404, "User not found");
    }

    if (user.isEmailVerified) {
      throw new APIError(400, "Email is already verified");
    }

    // Generate new OTP
    const emailOtp = generateOtp();
    user.emailOtp = emailOtp;
    await user.save();

    // Send OTP
    await sendEmailOtp(email, emailOtp);

    res.status(200).json({
      success: true,
      message: "Email OTP sent successfully",
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error while resending email OTP");
  }
};

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
        message: "If the email exists, a password reset link has been sent",
      });
    }

    // Generate reset token
    const resetToken = generateResetToken();
    const hashedToken = hashToken(resetToken);

    // Set reset token and expiry (1 hour)
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // Send password reset email
    try {
      await sendPasswordResetEmail(email, resetToken);
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
      // Continue without throwing error for testing purposes
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

export const editProfile = async (req, res) => {
  try {
    console.log("Edit profile attempt for user:", req.user?.id);
    const userId = req.user.id; // From auth middleware
    const { error } = validateEditProfile(req.body);
    if (error) {
      console.log("Validation error:", error.details[0].message);
      throw new APIError(400, error.details[0].message);
    }

    const { name, username, phone } = req.body;
    console.log("Edit profile data:", { name, username, phone });

    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found:", userId);
      throw new APIError(404, "User not found");
    }

    console.log("User found, checking for conflicts...");
    // Check if username or phone already exists (if being updated)
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        console.log("Username already exists:", username);
        throw new APIError(400, "Username already exists");
      }
    }

    if (phone && phone !== user.phone) {
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        console.log("Phone number already exists:", phone);
        throw new APIError(400, "Phone number already exists");
      }
    }

    console.log("No conflicts found, handling profile image...");
    // Handle profile image upload
    let profileImageUrl = user.profileImage;
    if (req.file) {
      try {
        console.log("Uploading new profile image...");
        const cloudinaryResponse = await uploadToCloudinary(req.file.path);
        // Extract the secure URL from the Cloudinary response
        profileImageUrl =
          cloudinaryResponse.secure_url || cloudinaryResponse.url;
        // Remove local file after upload
        fs.unlinkSync(req.file.path);
        console.log(
          "Profile image uploaded successfully, URL:",
          profileImageUrl
        );
      } catch (uploadError) {
        console.error("Profile image upload failed:", uploadError);
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

    console.error("Edit profile error:", error);
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during profile update");
  }
};

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
      message: "Password changed successfully. Please login again.",
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during password change");
  }
};

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

export const logout = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

    // Clear refresh token from database
    await User.findByIdAndUpdate(userId, {
      refreshToken: null,
    });

    // Clear cookies
    res.clearCookie("accessToken", CookieOptions);
    res.clearCookie("refreshToken", CookieOptions);

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
    res.clearCookie("accessToken", CookieOptions);
    res.clearCookie("refreshToken", CookieOptions);

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
