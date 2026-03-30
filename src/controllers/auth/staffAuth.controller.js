import { Staff, staffValidationSchemas } from "../../models/Staff.model.js";
import { Order } from "../../models/Order.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { generateTokens } from "../../utils/tokenUtils.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";
import { handleDeactivationSideEffects } from "../../services/staffDeactivation.service.js";
import {
  CookieOptions,
} from "../../config/jwtOptions.js";


// Staff login
export const loginStaff = asyncHandler(async (req, res, next) => {
  const { error } = staffValidationSchemas.login.validate(req.body);
  if (error) {
    return next(new APIError(400, error.details[0].message));
  }

  const { identifier, password } = req.body;

  // Find staff by email or staffId
  let staff;
  if (identifier.includes("@")) {
    // It's an email
    staff = await Staff.findOne({ email: identifier })
      .populate("hotel", "name hotelId email")
      .populate("branch", "name branchId location")
      .populate("manager", "name employeeId email");
  } else {
    // It's a staffId
    staff = await Staff.findOne({ staffId: identifier })
      .populate("hotel", "name hotelId email")
      .populate("branch", "name branchId location")
      .populate("manager", "name employeeId email");
  }

  if (!staff) {
    return next(new APIError(401, "Invalid credentials"));
  }

  // Check if account is locked
  if (staff.isLocked) {
    return next(
      new APIError(
        423,
        "Account is temporarily locked due to too many failed login attempts"
      )
    );
  }

  // Check if account is active
  // Only self-deactivated ("inactive") accounts can auto-reactivate on login
  // Admin/manager-set statuses (suspended, on_leave, on_break) must stay blocked
  const wasInactive = staff.status === "inactive";
  if (staff.status !== "active" && staff.status !== "inactive") {
    const statusMessages = {
      suspended: "Account is suspended. Please contact your admin.",
      on_leave: "Account is marked as on leave. Please contact your manager.",
      on_break: "Account is on break. Please contact your manager.",
    };
    return next(
      new APIError(
        403,
        statusMessages[staff.status] || "Account is not accessible. Please contact your manager."
      )
    );
  }

  // Compare password
  const isPasswordValid = await staff.comparePassword(password);
  if (!isPasswordValid) {
    await staff.incLoginAttempts();
    return next(new APIError(401, "Invalid credentials"));
  }

  // Reset login attempts on successful login
  await staff.resetLoginAttempts();

  // Auto-reactivate inactive account on successful login
  if (wasInactive) {
    staff.status = "active";
    staff.updatedAt = new Date();
    await staff.save();
  }

  try {
    // Check if this is first login and require password change
    const isFirstLogin = staff.isFirstLogin;

    // Generate tokens - pass staff object directly since generateTokens expects user._id
    const tokens = generateTokens(staff);

    // Save refresh token and update first login flag
    await Staff.findByIdAndUpdate(
      staff._id,
      {
        $set: {
          refreshToken: tokens.refreshToken,
          lastLogin: new Date(),
          isFirstLogin: false, // Mark first login as complete
        },
      },
      { new: false, runValidators: false }
    );

    // Prepare response data
    const staffData = {
      _id: staff._id,
      id: staff._id.toString(),
      name: staff.name,
      email: staff.email,
      staffId: staff.staffId,
      phone: staff.phone,
      role: staff.role,
      department: staff.department,
      status: staff.status,
      currentShift: staff.currentShift,
      hotel: {
        _id: staff.hotel._id,
        id: staff.hotel._id.toString(),
        name: staff.hotel.name,
        hotelId: staff.hotel.hotelId,
      },
      branch: staff.branch
        ? {
            _id: staff.branch._id,
            id: staff.branch._id.toString(),
            name: staff.branch.name,
            branchId: staff.branch.branchId,
            location: staff.branch.location,
          }
        : null,
      manager: staff.manager
        ? {
            _id: staff.manager._id,
            id: staff.manager._id.toString(),
            name: staff.manager.name,
            employeeId: staff.manager.employeeId,
            email: staff.manager.email,
          }
        : null,
      permissions: staff.permissions,
      lastLogin: staff.lastLogin,
      isFirstLogin: isFirstLogin, // Include first login flag
      createdAt: staff.createdAt,
    };

    res.status(200).json(
      new APIResponse(
        200,
        {
          staff: staffData,
          ...tokens,
          requirePasswordChange: isFirstLogin, // Flag to indicate password change required
          accountStatus: staff.status, // Include account status (now "active" if was reactivated)
          wasReactivated: wasInactive, // Flag to indicate if account was auto-reactivated
        },
        isFirstLogin
          ? "Staff login successful. Password change required."
          : wasInactive
            ? "Staff login successful. Account has been automatically reactivated. Welcome back!"
            : "Staff login successful"
      )
    );
  } catch (tokenError) {
    return next(new APIError(500, "Error generating authentication tokens"));
  }
  });

// Staff logout
export const logoutStaff = asyncHandler(async (req, res, next) => {
  const staff = await Staff.findById(req.staff._id);
  if (!staff) {
    return next(new APIError(404, "Staff not found"));
  }

  // Block logout if staff has active orders
  const activeOrdersCount = await Order.countDocuments({
    staff: staff._id,
    status: { $in: ["pending", "confirmed", "preparing", "ready", "served"] },
  });

  if (activeOrdersCount > 0) {
    return next(
      new APIError(
        400,
        `Cannot logout. You have ${activeOrdersCount} active order(s). Please complete or hand off all orders before logging out.`
      )
    );
  }

  // Clear refresh token
  staff.refreshToken = null;
  await staff.save();

  // Clear cookies
  res.clearCookie("accessToken", CookieOptions);
  res.clearCookie("refreshToken", CookieOptions);

  res.status(200).json(new APIResponse(200, null, "Staff logout successful"));
  });

// Get staff profile
export const getStaffProfile = asyncHandler(async (req, res, next) => {
  const staff = await Staff.findById(req.staff._id)
    .populate("hotel", "name hotelId email")
    .populate("branch", "name branchId location")
    .populate("manager", "name employeeId email")
    .select("-password -refreshToken");

  if (!staff) {
    return next(new APIError(404, "Staff not found"));
  }

  res
    .status(200)
    .json(
      new APIResponse(200, { staff }, "Staff profile retrieved successfully")
    );
  });

// Change staff password
export const changeStaffPassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new APIError(400, "Current and new password are required"));
  }

  const staff = await Staff.findById(req.staff._id);
  if (!staff) {
    return next(new APIError(404, "Staff not found"));
  }

  const isCurrentPasswordValid = await staff.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return next(new APIError(400, "Current password is incorrect"));
  }

  // Update password and mark first login as complete
  staff.password = newPassword;
  staff.isFirstLogin = false; // Mark that first login password change is complete
  await staff.save();

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        null,
        "Password changed successfully. First login complete."
      )
    );
  });

// Staff self-deactivation
export const deactivateAccount = asyncHandler(async (req, res, next) => {
  const { password } = req.body;

  if (!password) {
    return next(
      new APIError(400, "Password is required to deactivate account")
    );
  }

  const staff = await Staff.findById(req.staff._id);
  if (!staff) {
    return next(new APIError(404, "Staff not found"));
  }

  // Verify password before deactivation
  const isPasswordValid = await staff.comparePassword(password);
  if (!isPasswordValid) {
    return next(new APIError(400, "Incorrect password"));
  }

  if (staff.status === "inactive") {
    return next(new APIError(400, "Account is already deactivated"));
  }

  // Block deactivation if staff has active orders
  // Only completed and cancelled orders are terminal — everything else blocks deactivation
  // Note: "queued" orders are not assigned to staff, so they don't need to be checked
  const activeOrdersCount = await Order.countDocuments({
    staff: staff._id,
    status: { $in: ["pending", "confirmed", "preparing", "ready", "served"] },
  });

  if (activeOrdersCount > 0) {
    return next(
      new APIError(
        400,
        `Cannot deactivate account. You have ${activeOrdersCount} active order(s). Please complete or hand off all orders before deactivating.`
      )
    );
  }

  // Deactivate the account
  staff.status = "inactive";
  staff.updatedAt = new Date();
  await staff.save();

  // Handle deactivation side effects (order reassignment, socket disconnect, manager notification)
  const sideEffects = await handleDeactivationSideEffects(staff, {
    deactivatedBy: "self",
  });

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { deactivationSideEffects: sideEffects },
        "Account deactivated successfully. You can reactivate it anytime by logging in."
      )
    );
  });

// Staff self-reactivation
export const reactivateAccount = asyncHandler(async (req, res, next) => {
  const { password } = req.body;

  if (!password) {
    return next(
      new APIError(400, "Password is required to reactivate account")
    );
  }

  const staff = await Staff.findById(req.staff._id);
  if (!staff) {
    return next(new APIError(404, "Staff not found"));
  }

  // Verify password before reactivation
  const isPasswordValid = await staff.comparePassword(password);
  if (!isPasswordValid) {
    return next(new APIError(400, "Incorrect password"));
  }

  if (staff.status === "active") {
    return next(new APIError(400, "Account is already active"));
  }

  // Reactivate the account
  staff.status = "active";
  staff.updatedAt = new Date();
  await staff.save();

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        null,
        "Account reactivated successfully. Welcome back!"
      )
    );
  });
