import {
  Manager,
  managerValidationSchemas,
} from "../../models/Manager.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { generateTokens } from "../../utils/tokenUtils.js";

// Manager login
export const loginManager = async (req, res, next) => {
  try {
    const { error } = managerValidationSchemas.login.validate(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const { identifier, password } = req.body;

    // Find manager by email or employeeId
    let manager;
    if (identifier.includes("@")) {
      // It's an email
      manager = await Manager.findOne({ email: identifier })
        .populate("hotel", "name hotelId email")
        .populate("branch", "name branchId location");
    } else {
      // It's an employeeId
      manager = await Manager.findOne({ employeeId: identifier })
        .populate("hotel", "name hotelId email")
        .populate("branch", "name branchId location");
    }

    if (!manager) {
      return next(new APIError(401, "Invalid credentials"));
    }

    // Check if account is locked
    if (manager.isLocked) {
      return next(
        new APIError(
          423,
          "Account is temporarily locked due to too many failed login attempts"
        )
      );
    }

    // Check if account is active
    const wasInactive = manager.status === "inactive";
    if (manager.status !== "active" && manager.status !== "inactive") {
      return next(
        new APIError(
          403,
          "Account is not accessible. Please contact administrator."
        )
      );
    }

    // Compare password
    const isPasswordValid = await manager.comparePassword(password);
    if (!isPasswordValid) {
      await manager.incLoginAttempts();
      return next(new APIError(401, "Invalid credentials"));
    }

    // Reset login attempts on successful login
    await manager.resetLoginAttempts();

    // Auto-reactivate inactive account on successful login
    if (wasInactive) {
      manager.status = "active";
      manager.updatedAt = new Date();
      await manager.save();
    }

    try {
      // Check if this is first login and require password change
      const isFirstLogin = manager.isFirstLogin;

      // Generate tokens - pass manager object directly since generateTokens expects user._id
      const tokens = generateTokens(manager);

      // Update last login but don't change isFirstLogin here (will be changed after password update)
      manager.lastLogin = new Date();
      await manager.save();

      // Prepare response data
      const managerData = {
        _id: manager._id,
        name: manager.name,
        email: manager.email,
        employeeId: manager.employeeId,
        phone: manager.phone,
        role: manager.role,
        department: manager.department,
        status: manager.status,
        hotel: {
          _id: manager.hotel._id,
          name: manager.hotel.name,
          hotelId: manager.hotel.hotelId,
        },
        branch: manager.branch
          ? {
              _id: manager.branch._id,
              name: manager.branch.name,
              branchId: manager.branch.branchId,
              location: manager.branch.location,
            }
          : null,
        permissions: manager.permissions,
        lastLogin: manager.lastLogin,
        isFirstLogin: isFirstLogin, // Include first login flag
        createdAt: manager.createdAt,
      };

      res.status(200).json(
        new APIResponse(
          200,
          {
            manager: managerData,
            ...tokens,
            requirePasswordChange: isFirstLogin, // Flag to indicate password change required
            accountStatus: manager.status, // Include account status (now "active" if was reactivated)
            wasReactivated: wasInactive, // Flag to indicate if account was auto-reactivated
          },
          isFirstLogin
            ? "Manager login successful. Password change required."
            : wasInactive
            ? "Manager login successful. Account has been automatically reactivated. Welcome back!"
            : "Manager login successful"
        )
      );
    } catch (tokenError) {
      return next(new APIError(500, "Error generating authentication tokens"));
    }
  } catch (error) {
    next(error);
  }
};

// Manager logout
export const logoutManager = async (req, res, next) => {
  try {
    const manager = await Manager.findById(req.manager._id);
    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Clear refresh token
    manager.refreshToken = null;
    await manager.save();

    res
      .status(200)
      .json(new APIResponse(200, null, "Manager logout successful"));
  } catch (error) {
    next(error);
  }
};

// Get manager profile
export const getManagerProfile = async (req, res, next) => {
  try {
    const manager = await Manager.findById(req.manager._id)
      .populate("hotel", "name hotelId email")
      .populate("branch", "name branchId location")
      .select("-password -refreshToken");

    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { manager },
          "Manager profile retrieved successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

// Change manager password
export const changeManagerPassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return next(new APIError(400, "Current and new password are required"));
    }

    const manager = await Manager.findById(req.manager._id);
    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    const isCurrentPasswordValid = await manager.comparePassword(
      currentPassword
    );
    if (!isCurrentPasswordValid) {
      return next(new APIError(400, "Current password is incorrect"));
    }

    // Update password and mark first login as complete
    manager.password = newPassword;
    manager.isFirstLogin = false; // Mark that first login password change is complete
    await manager.save();

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

// Manager self-deactivation
export const deactivateAccount = async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password) {
      return next(
        new APIError(400, "Password is required to deactivate account")
      );
    }

    const manager = await Manager.findById(req.manager._id);
    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Verify password before deactivation
    const isPasswordValid = await manager.comparePassword(password);
    if (!isPasswordValid) {
      return next(new APIError(400, "Incorrect password"));
    }

    if (manager.status === "inactive") {
      return next(new APIError(400, "Account is already deactivated"));
    }

    // Deactivate the account
    manager.status = "inactive";
    manager.updatedAt = new Date();
    await manager.save();

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

// Manager self-reactivation
export const reactivateAccount = async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password) {
      return next(
        new APIError(400, "Password is required to reactivate account")
      );
    }

    const manager = await Manager.findById(req.manager._id);
    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Verify password before reactivation
    const isPasswordValid = await manager.comparePassword(password);
    if (!isPasswordValid) {
      return next(new APIError(400, "Incorrect password"));
    }

    if (manager.status === "active") {
      return next(new APIError(400, "Account is already active"));
    }

    // Reactivate the account
    manager.status = "active";
    manager.updatedAt = new Date();
    await manager.save();

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
