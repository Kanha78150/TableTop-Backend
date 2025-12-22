import { Admin } from "../models/Admin.model.js";
import { Manager } from "../models/Manager.model.js";
import { Staff } from "../models/Staff.model.js";
import { Hotel } from "../models/Hotel.model.js";
import { APIError } from "../utils/APIError.js";

/**
 * Intelligent user detection across Admin, Manager, and Staff models
 * @param {string} identifier - Email, employeeId, or staffId
 * @returns {Object} { user, userType, model }
 */
export const findUserByIdentifier = async (identifier) => {
  let user = null;
  let userType = null;
  let model = null;

  // Detect identifier pattern
  const isEmail = identifier.includes("@");
  const isManagerId = identifier.startsWith("MGR-");
  const isStaffId = identifier.startsWith("STF-");

  // Try to find user based on identifier pattern
  if (isEmail) {
    // Email - check all models in priority order: Admin -> Manager -> Staff
    user = await Admin.findOne({ email: identifier }).populate(
      "assignedBranches",
      "name branchId location"
    );
    if (user) {
      userType = "admin";
      model = Admin;
      return { user, userType, model };
    }

    user = await Manager.findOne({ email: identifier })
      .populate("hotel", "name hotelId email")
      .populate("branch", "name branchId location");
    if (user) {
      userType = "manager";
      model = Manager;
      return { user, userType, model };
    }

    user = await Staff.findOne({ email: identifier })
      .populate("hotel", "name hotelId email")
      .populate("branch", "name branchId location")
      .populate("manager", "name employeeId email");
    if (user) {
      userType = "staff";
      model = Staff;
      return { user, userType, model };
    }
  } else if (isManagerId) {
    // Manager employee ID
    user = await Manager.findOne({ employeeId: identifier })
      .populate("hotel", "name hotelId email")
      .populate("branch", "name branchId location");
    if (user) {
      userType = "manager";
      model = Manager;
      return { user, userType, model };
    }
  } else if (isStaffId) {
    // Staff ID
    user = await Staff.findOne({ staffId: identifier })
      .populate("hotel", "name hotelId email")
      .populate("branch", "name branchId location")
      .populate("manager", "name employeeId email");
    if (user) {
      userType = "staff";
      model = Staff;
      return { user, userType, model };
    }
  } else {
    // Unknown pattern - try all possibilities
    // Try manager employee ID
    user = await Manager.findOne({ employeeId: identifier })
      .populate("hotel", "name hotelId email")
      .populate("branch", "name branchId location");
    if (user) {
      userType = "manager";
      model = Manager;
      return { user, userType, model };
    }

    // Try staff ID
    user = await Staff.findOne({ staffId: identifier })
      .populate("hotel", "name hotelId email")
      .populate("branch", "name branchId location")
      .populate("manager", "name employeeId email");
    if (user) {
      userType = "staff";
      model = Staff;
      return { user, userType, model };
    }
  }

  return { user: null, userType: null, model: null };
};

/**
 * Validate account status and security checks
 * @param {Object} user - User document
 * @param {string} userType - 'admin', 'manager', or 'staff'
 * @throws {APIError} If account has issues
 */
export const validateAccountStatus = (user, userType) => {
  // Check if account is locked
  if (user.isLocked) {
    throw new APIError(
      423,
      "Account is temporarily locked due to too many failed login attempts"
    );
  }

  // Check account status based on user type
  if (userType === "admin") {
    if (user.status !== "active") {
      throw new APIError(
        403,
        "Account is inactive. Please contact super admin."
      );
    }

    // Admin-specific: Check email verification
    if (!user.emailVerified) {
      throw new APIError(
        403,
        "Please verify your email first before logging in. Check your email for the verification OTP."
      );
    }
  } else if (userType === "manager") {
    if (user.status !== "active" && user.status !== "inactive") {
      throw new APIError(
        403,
        "Account is not accessible. Please contact administrator."
      );
    }
  } else if (userType === "staff") {
    if (user.status !== "active" && user.status !== "inactive") {
      throw new APIError(
        403,
        "Account is not accessible. Please contact your manager."
      );
    }
  }
};

/**
 * Handle password verification and failed login attempts
 * @param {Object} user - User document
 * @param {string} password - Plain text password
 * @returns {boolean} true if password is valid
 * @throws {APIError} If password is invalid
 */
export const verifyPassword = async (user, password) => {
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    await user.incLoginAttempts();
    throw new APIError(401, "Invalid credentials");
  }
  return true;
};

/**
 * Handle post-login account updates
 * @param {Object} user - User document
 * @param {string} userType - 'admin', 'manager', or 'staff'
 * @returns {Object} { wasInactive, isFirstLogin }
 */
export const handlePostLoginUpdates = async (user, userType) => {
  // Reset login attempts on successful login
  await user.resetLoginAttempts();

  let wasInactive = false;
  let isFirstLogin = false;

  // Auto-reactivate inactive accounts (Manager and Staff only)
  if (userType !== "admin" && user.status === "inactive") {
    wasInactive = true;
    user.status = "active";
    user.updatedAt = new Date();
    await user.save();
  }

  // Check first login flag (Manager and Staff only)
  if (userType !== "admin" && user.isFirstLogin !== undefined) {
    isFirstLogin = user.isFirstLogin;
  }

  return { wasInactive, isFirstLogin };
};

/**
 * Fetch additional data for admin users
 * @param {Object} admin - Admin document
 * @returns {Array} Created hotels
 */
export const fetchAdminHotels = async (admin) => {
  const createdHotels = await Hotel.find({ createdBy: admin._id })
    .select(
      "name hotelId mainLocation contactInfo status rating starRating images"
    )
    .lean();
  return createdHotels || [];
};

/**
 * Format user response based on user type
 * @param {Object} user - User document
 * @param {string} userType - 'admin', 'manager', or 'staff'
 * @param {Object} tokens - { accessToken, refreshToken }
 * @param {Object} additionalData - Additional data (e.g., createdHotels, flags)
 * @returns {Object} Formatted response data
 */
export const formatUserResponse = (user, userType, tokens, additionalData = {}) => {
  const baseResponse = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    userType,
  };

  if (userType === "admin") {
    return {
      ...baseResponse,
      admin: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        permissions: user.permissions,
        assignedBranches: user.assignedBranches,
        lastLogin: user.lastLogin,
      },
      createdHotels: additionalData.createdHotels || [],
    };
  } else if (userType === "manager") {
    return {
      ...baseResponse,
      manager: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        phone: user.phone,
        role: user.role,
        department: user.department,
        status: user.status,
        permissions: user.permissions,
        hotel: user.hotel,
        branch: user.branch,
      },
      isFirstLogin: additionalData.isFirstLogin || false,
      wasInactive: additionalData.wasInactive || false,
      requirePasswordChange: additionalData.isFirstLogin || false,
    };
  } else if (userType === "staff") {
    return {
      ...baseResponse,
      staff: {
        id: user._id,
        name: user.name,
        email: user.email,
        staffId: user.staffId,
        phone: user.phone,
        role: user.role,
        department: user.department,
        status: user.status,
        currentShift: user.currentShift,
        permissions: user.permissions,
        hotel: user.hotel,
        branch: user.branch,
        manager: user.manager,
      },
      isFirstLogin: additionalData.isFirstLogin || false,
      wasInactive: additionalData.wasInactive || false,
      requirePasswordChange: additionalData.isFirstLogin || false,
    };
  }

  return baseResponse;
};
