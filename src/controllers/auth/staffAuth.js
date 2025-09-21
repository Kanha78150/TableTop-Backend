import { Staff, staffValidationSchemas } from "../../models/Staff.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { generateTokens } from "../../utils/tokenUtils.js";

// Staff login
export const loginStaff = async (req, res, next) => {
  try {
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
    const wasInactive = staff.status === "inactive";
    if (staff.status !== "active" && staff.status !== "inactive") {
      return next(
        new APIError(
          403,
          "Account is not accessible. Please contact your manager."
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

      // Update last login but don't change isFirstLogin here (will be changed after password update)
      staff.lastLogin = new Date();
      await staff.save();

      // Prepare response data
      const staffData = {
        _id: staff._id,
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
          name: staff.hotel.name,
          hotelId: staff.hotel.hotelId,
        },
        branch: staff.branch
          ? {
              _id: staff.branch._id,
              name: staff.branch.name,
              branchId: staff.branch.branchId,
              location: staff.branch.location,
            }
          : null,
        manager: staff.manager
          ? {
              _id: staff.manager._id,
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
  } catch (error) {
    next(error);
  }
};

// Staff logout
export const logoutStaff = async (req, res, next) => {
  try {
    const staff = await Staff.findById(req.staff._id);
    if (!staff) {
      return next(new APIError(404, "Staff not found"));
    }

    // Clear refresh token
    staff.refreshToken = null;
    await staff.save();

    res.status(200).json(new APIResponse(200, null, "Staff logout successful"));
  } catch (error) {
    next(error);
  }
};

// Get staff profile
export const getStaffProfile = async (req, res, next) => {
  try {
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
  } catch (error) {
    next(error);
  }
};

// Change staff password
export const changeStaffPassword = async (req, res, next) => {
  try {
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
  } catch (error) {
    next(error);
  }
};

// Staff self-deactivation
export const deactivateAccount = async (req, res, next) => {
  try {
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

    // Deactivate the account
    staff.status = "inactive";
    staff.updatedAt = new Date();
    await staff.save();

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          null,
          "Account deactivated successfully. You can reactivate it anytime by logging in."
        )
      );
  } catch (error) {
    next(error);
  }
};

// Staff self-reactivation
export const reactivateAccount = async (req, res, next) => {
  try {
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
  } catch (error) {
    next(error);
  }
};
