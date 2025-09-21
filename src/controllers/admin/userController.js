import { User } from "../../models/User.model.js";
import {
  Manager,
  managerValidationSchemas,
} from "../../models/Manager.model.js";
import { Staff, staffValidationSchemas } from "../../models/Staff.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import {
  sendManagerWelcomeEmail,
  sendStaffWelcomeEmail,
} from "../../utils/emailService.js";
import {
  addServiceStatusToManagers,
  addManagerServiceStatus,
  addServiceStatusToStaff,
  addStaffServiceStatus,
} from "../../utils/hotelStatusHelper.js";

// User Management
export const getAllUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      verified,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { username: new RegExp(search, "i") },
        { phone: new RegExp(search, "i") },
      ];
    }

    if (verified !== undefined) {
      query.isEmailVerified = verified === "true";
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const users = await User.find(query)
      .select("-password -refreshToken -passwordResetToken")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments(query);

    // Get user statistics
    const stats = {
      totalUsers: await User.countDocuments(),
      verifiedUsers: await User.countDocuments({ isEmailVerified: true }),
      oauthUsers: await User.countDocuments({ isOAuthUser: true }),
      activeUsers: await User.countDocuments({
        lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }),
    };

    res.status(200).json(
      new APIResponse(
        200,
        {
          users,
          stats,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalUsers / limit),
            totalUsers,
            hasNextPage: page < Math.ceil(totalUsers / limit),
            hasPrevPage: page > 1,
          },
        },
        "Users retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select(
      "-password -refreshToken -passwordResetToken"
    );

    if (!user) {
      return next(new APIError(404, "User not found"));
    }

    // Get user's order history count (you'll need to implement this based on your Order model)
    // const orderCount = await Order.countDocuments({ user: userId });

    res.status(200).json(
      new APIResponse(
        200,
        {
          user,
          // orderCount
        },
        "User details retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { name, username, phone, isEmailVerified, isPhoneVerified, coins } =
      req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        ...(name && { name }),
        ...(username && { username }),
        ...(phone && { phone }),
        ...(isEmailVerified !== undefined && { isEmailVerified }),
        ...(isPhoneVerified !== undefined && { isPhoneVerified }),
        ...(coins !== undefined && { coins }),
      },
      { new: true, runValidators: true }
    ).select("-password -refreshToken -passwordResetToken");

    if (!user) {
      return next(new APIError(404, "User not found"));
    }

    res
      .status(200)
      .json(new APIResponse(200, { user }, "User updated successfully"));
  } catch (error) {
    next(error);
  }
};

export const blockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    // In a real implementation, you might want to add a 'blocked' field to User model
    // For now, we'll set isEmailVerified to false as a way to "block"
    const user = await User.findByIdAndUpdate(
      userId,
      {
        isEmailVerified: false,
        blockedAt: new Date(),
        blockReason: reason || "Blocked by admin",
      },
      { new: true }
    ).select("-password -refreshToken -passwordResetToken");

    if (!user) {
      return next(new APIError(404, "User not found"));
    }

    res
      .status(200)
      .json(new APIResponse(200, { user }, "User blocked successfully"));
  } catch (error) {
    next(error);
  }
};

export const unblockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isEmailVerified: true,
        $unset: { blockedAt: 1, blockReason: 1 },
      },
      { new: true }
    ).select("-password -refreshToken -passwordResetToken");

    if (!user) {
      return next(new APIError(404, "User not found"));
    }

    res
      .status(200)
      .json(new APIResponse(200, { user }, "User unblocked successfully"));
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return next(new APIError(404, "User not found"));
    }

    // TODO: Handle cascading deletes (orders, reviews, etc.)

    res
      .status(200)
      .json(new APIResponse(200, null, "User deleted successfully"));
  } catch (error) {
    next(error);
  }
};

// Manager Management
export const getAllManagers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      branchId,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { phone: new RegExp(search, "i") },
      ];
    }

    if (branchId) {
      query.branch = branchId;
    }

    // Filter by assigned branches if admin has limited access
    if (req.admin.role === "branch_admin") {
      query.branch = { $in: req.admin.assignedBranches };
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const managers = await Manager.find(query)
      .populate("hotel", "name hotelId status")
      .populate("branch", "name branchId location status")
      .select("-password -refreshToken")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalManagers = await Manager.countDocuments(query);

    // Add service status to managers
    const managersWithStatus = addServiceStatusToManagers(managers);

    res.status(200).json(
      new APIResponse(
        200,
        {
          managers: managersWithStatus,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalManagers / limit),
            totalManagers,
            hasNextPage: page < Math.ceil(totalManagers / limit),
            hasPrevPage: page > 1,
          },
        },
        "Managers retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

export const getManagerById = async (req, res, next) => {
  try {
    const { managerId } = req.params;

    // Try to find manager by MongoDB ObjectId first, then by custom employeeId
    let manager;
    if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a valid MongoDB ObjectId
      manager = await Manager.findById(managerId)
        .populate("hotel", "name hotelId location status")
        .populate("branch", "name branchId location status")
        .select("-password -refreshToken");
    } else {
      // It's a custom employeeId (e.g., MGR-2025-00001)
      manager = await Manager.findOne({ employeeId: managerId })
        .populate("hotel", "name hotelId location status")
        .populate("branch", "name branchId location status")
        .select("-password -refreshToken");
    }

    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Check if admin has access to this manager's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(manager.branch._id)
    ) {
      return next(new APIError(403, "You don't have access to this manager"));
    }

    // Add service status to manager
    const managerWithStatus = addManagerServiceStatus(manager);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { manager: managerWithStatus },
          "Manager retrieved successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

export const createManager = async (req, res, next) => {
  try {
    // Validate request body using Joi schema
    const { error } = managerValidationSchemas.register.validate(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const {
      name,
      email,
      phone,
      password,
      hotel: hotelId,
      branch: branchId,
    } = req.body;

    console.log("Creating manager with data:", {
      name,
      email,
      phone,
      hotel: hotelId,
      branch: branchId,
    });

    // Only admins can create managers
    if (!["admin", "super_admin", "branch_admin"].includes(req.admin.role)) {
      return next(new APIError(403, "Only admins can create managers"));
    }

    // Validate hotel exists - support both auto-generated hotelId and MongoDB _id
    let hotel;
    if (hotelId.match(/^[0-9a-fA-F]{24}$/)) {
      hotel = await Hotel.findById(hotelId);
    } else {
      hotel = await Hotel.findOne({ hotelId: hotelId });
    }
    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    // Validate branch exists and belongs to the specified hotel (if branchId is provided)
    let branch = null;
    if (branchId) {
      if (branchId.match(/^[0-9a-fA-F]{24}$/)) {
        branch = await Branch.findById(branchId).populate("hotel");
      } else {
        branch = await Branch.findOne({ branchId: branchId }).populate("hotel");
      }

      if (!branch) {
        return next(new APIError(404, "Branch not found"));
      }

      if (branch.hotel._id.toString() !== hotel._id.toString()) {
        return next(
          new APIError(400, "Branch does not belong to the specified hotel")
        );
      }

      // Check if admin has access to this branch
      if (
        req.admin.role === "branch_admin" &&
        req.admin.canAccessBranch &&
        !req.admin.canAccessBranch(branch._id)
      ) {
        return next(new APIError(403, "You don't have access to this branch"));
      }
    }

    // Check if manager with same email exists
    const existingManager = await Manager.findOne({ email });
    if (existingManager) {
      return next(new APIError(400, "Manager with this email already exists"));
    }

    // Store plain text password for email (before hashing)
    const plainTextPassword = password;

    const manager = new Manager({
      name,
      email,
      phone,
      password,
      hotel: hotel._id, // Always use MongoDB ObjectId for reference
      branch: branch ? branch._id : null, // Use MongoDB ObjectId if branch exists, null if optional
    });

    await manager.save();

    const populatedManager = await Manager.findById(manager._id)
      .populate("hotel", "name hotelId email")
      .populate("branch", "name branchId location")
      .select("-password -refreshToken");

    // Send welcome email with credentials
    try {
      await sendManagerWelcomeEmail(
        {
          name: manager.name,
          email: manager.email,
          employeeId: manager.employeeId,
          tempPassword: plainTextPassword,
        },
        {
          name: hotel.name,
          email: hotel.email,
        },
        branch ? { name: branch.name } : null
      );
      console.log(`Welcome email sent to manager: ${manager.email}`);
    } catch (emailError) {
      console.error("Failed to send welcome email to manager:", emailError);
      // Don't fail the creation if email fails, just log the error
    }

    res
      .status(201)
      .json(
        new APIResponse(
          201,
          { manager: populatedManager },
          "Manager created successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

export const updateManager = async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const updates = req.body;

    // Remove sensitive fields from updates
    delete updates.password;
    delete updates.refreshToken;

    // Try to find and update manager by MongoDB ObjectId first, then by custom employeeId
    let manager;
    if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a valid MongoDB ObjectId
      manager = await Manager.findByIdAndUpdate(managerId, updates, {
        new: true,
        runValidators: true,
      })
        .populate("hotel", "name hotelId location")
        .populate("branch", "name branchId location")
        .select("-password -refreshToken");
    } else {
      // It's a custom employeeId (e.g., MGR-2025-00001)
      manager = await Manager.findOneAndUpdate(
        { employeeId: managerId },
        updates,
        {
          new: true,
          runValidators: true,
        }
      )
        .populate("hotel", "name hotelId location")
        .populate("branch", "name branchId location")
        .select("-password -refreshToken");
    }

    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Check if admin has access to this manager's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(manager.branch._id)
    ) {
      return next(new APIError(403, "You don't have access to this manager"));
    }

    res
      .status(200)
      .json(new APIResponse(200, { manager }, "Manager updated successfully"));
  } catch (error) {
    next(error);
  }
};

export const deleteManager = async (req, res, next) => {
  try {
    const { managerId } = req.params;

    // Try to find manager by MongoDB ObjectId first, then by custom employeeId
    let manager;
    if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a valid MongoDB ObjectId
      manager = await Manager.findById(managerId)
        .populate("hotel", "name hotelId location")
        .populate("branch", "name branchId location");
    } else {
      // It's a custom employeeId (e.g., MGR-2025-00001)
      manager = await Manager.findOne({ employeeId: managerId })
        .populate("hotel", "name hotelId location")
        .populate("branch", "name branchId location");
    }

    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Check if admin has access to this manager's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(manager.branch._id)
    ) {
      return next(new APIError(403, "You don't have access to this manager"));
    }

    // Delete manager by ObjectId or custom employeeId
    if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
      await Manager.findByIdAndDelete(managerId);
    } else {
      await Manager.findOneAndDelete({ employeeId: managerId });
    }

    res
      .status(200)
      .json(new APIResponse(200, null, "Manager deleted successfully"));
  } catch (error) {
    next(error);
  }
};

// Deactivate manager (set status to inactive)
export const deactivateManager = async (req, res, next) => {
  try {
    const { managerId } = req.params;

    // Try to find manager by MongoDB ObjectId first, then by custom employeeId
    let manager;
    if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
      manager = await Manager.findById(managerId);
    } else {
      manager = await Manager.findOne({ employeeId: managerId });
    }

    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Check if admin has access to this manager's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(manager.branch)
    ) {
      return next(new APIError(403, "You don't have access to this manager"));
    }

    if (manager.status === "inactive") {
      return next(new APIError(400, "Manager is already inactive"));
    }

    // Update manager status
    manager.status = "inactive";
    manager.updatedAt = new Date();
    await manager.save();

    // Populate related data for service status
    const populatedManager = await Manager.findById(manager._id)
      .populate("hotel", "name hotelId status")
      .populate("branch", "name branchId status")
      .select("-password -refreshToken");

    // Add service status
    const managerWithStatus = addManagerServiceStatus(populatedManager);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          managerWithStatus,
          "Manager deactivated successfully. They will appear in search results but marked as no services provided."
        )
      );
  } catch (error) {
    next(error);
  }
};

// Reactivate manager (set status to active)
export const reactivateManager = async (req, res, next) => {
  try {
    const { managerId } = req.params;

    // Try to find manager by MongoDB ObjectId first, then by custom employeeId
    let manager;
    if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
      manager = await Manager.findById(managerId);
    } else {
      manager = await Manager.findOne({ employeeId: managerId });
    }

    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Check if admin has access to this manager's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(manager.branch)
    ) {
      return next(new APIError(403, "You don't have access to this manager"));
    }

    if (manager.status === "active") {
      return next(new APIError(400, "Manager is already active"));
    }

    // Update manager status
    manager.status = "active";
    manager.updatedAt = new Date();
    await manager.save();

    // Populate related data for service status
    const populatedManager = await Manager.findById(manager._id)
      .populate("hotel", "name hotelId status")
      .populate("branch", "name branchId status")
      .select("-password -refreshToken");

    // Add service status
    const managerWithStatus = addManagerServiceStatus(populatedManager);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          managerWithStatus,
          "Manager reactivated successfully. Services are now available."
        )
      );
  } catch (error) {
    next(error);
  }
};

export const updateManagerPermissions = async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const { permissions } = req.body;

    // Only super admin can update manager permissions
    if (!["admin", "super_admin"].includes(req.admin.role)) {
      return next(
        new APIError(403, "Only super admin can update manager permissions")
      );
    }

    // Validate the permissions data using the updatePermissions schema
    const { error } = managerValidationSchemas.updatePermissions.validate({
      permissions,
    });
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    // Try to find and update manager by MongoDB ObjectId first, then by custom employeeId
    let manager;
    if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a valid MongoDB ObjectId
      manager = await Manager.findByIdAndUpdate(
        managerId,
        { permissions },
        {
          new: true,
          runValidators: true,
        }
      )
        .populate("hotel", "name hotelId location")
        .populate("branch", "name branchId location")
        .select("-password -refreshToken");
    } else {
      // It's a custom employeeId (e.g., MGR-2025-00001)
      manager = await Manager.findOneAndUpdate(
        { employeeId: managerId },
        { permissions },
        {
          new: true,
          runValidators: true,
        }
      )
        .populate("hotel", "name hotelId location")
        .populate("branch", "name branchId location")
        .select("-password -refreshToken");
    }

    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { manager },
          "Manager permissions updated successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

// Staff Management
export const getAllStaff = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      branchId,
      role,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { phone: new RegExp(search, "i") },
      ];
    }

    if (branchId) {
      query.branch = branchId;
    }

    if (role) {
      query.role = role;
    }

    // Filter by assigned branches if admin has limited access
    if (req.admin.role === "branch_admin") {
      query.branch = { $in: req.admin.assignedBranches };
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const staff = await Staff.find(query)
      .populate({
        path: "branch",
        select: "name branchId location status",
        populate: {
          path: "hotel",
          select: "name hotelId status",
        },
      })
      .select("-password -refreshToken")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalStaff = await Staff.countDocuments(query);

    // Add service status to staff
    const staffWithStatus = addServiceStatusToStaff(staff);

    res.status(200).json(
      new APIResponse(
        200,
        {
          staff: staffWithStatus,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalStaff / limit),
            totalStaff,
            hasNextPage: page < Math.ceil(totalStaff / limit),
            hasPrevPage: page > 1,
          },
        },
        "Staff retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

export const createStaff = async (req, res, next) => {
  try {
    // Validate request body using Joi schema
    const { error } = staffValidationSchemas.register.validate(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const {
      name,
      email,
      phone,
      password,
      hotel: hotelId,
      branch: branchId,
      role,
      department,
      manager: managerId,
    } = req.body;

    console.log("Creating staff with data:", {
      name,
      email,
      phone,
      hotel: hotelId,
      branch: branchId,
      role,
      department,
      manager: managerId,
    });

    // Only admins and managers can create staff
    if (
      !["admin", "super_admin", "branch_admin", "branch_manager"].includes(
        req.admin?.role || req.manager?.role
      )
    ) {
      return next(
        new APIError(403, "Only admins and managers can create staff")
      );
    }

    // Validate hotel exists - support both auto-generated hotelId and MongoDB _id
    let hotel;
    if (hotelId.match(/^[0-9a-fA-F]{24}$/)) {
      hotel = await Hotel.findById(hotelId);
    } else {
      hotel = await Hotel.findOne({ hotelId: hotelId });
    }
    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    // Validate branch exists and belongs to the specified hotel (if branchId is provided)
    let branch = null;
    if (branchId) {
      if (branchId.match(/^[0-9a-fA-F]{24}$/)) {
        branch = await Branch.findById(branchId).populate("hotel");
      } else {
        branch = await Branch.findOne({ branchId: branchId }).populate("hotel");
      }

      if (!branch) {
        return next(new APIError(404, "Branch not found"));
      }

      if (branch.hotel._id.toString() !== hotel._id.toString()) {
        return next(
          new APIError(400, "Branch does not belong to the specified hotel")
        );
      }

      // Check if admin has access to this branch
      if (
        (req.admin?.role === "branch_admin" &&
          req.admin.canAccessBranch &&
          !req.admin.canAccessBranch(branch._id)) ||
        (req.manager?.role === "branch_manager" &&
          req.manager.branch.toString() !== branch._id.toString())
      ) {
        return next(new APIError(403, "You don't have access to this branch"));
      }
    }

    // Validate manager assignment - support both ObjectId and custom employeeId
    let manager = null;
    if (managerId) {
      console.log("Looking for manager with ID:", managerId);

      if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
        // It's a valid MongoDB ObjectId
        manager = await Manager.findById(managerId).populate("branch hotel");
        console.log(
          "Found manager by ObjectId:",
          manager ? "Found" : "Not found"
        );
      } else {
        // It's a custom employeeId (e.g., MGR-2025-00001)
        manager = await Manager.findOne({ employeeId: managerId }).populate(
          "branch hotel"
        );
        console.log(
          "Found manager by employeeId:",
          manager ? "Found" : "Not found"
        );
      }

      if (!manager) {
        return next(new APIError(404, "Manager not found"));
      }

      console.log("Manager found:", {
        id: manager._id,
        employeeId: manager.employeeId,
        hasHotel: !!manager.hotel,
        hotelId: manager.hotel?._id,
        hasBranch: !!manager.branch,
        branchId: manager.branch?._id,
      });

      // Ensure manager has hotel populated and is from the same hotel
      if (!manager.hotel || !manager.hotel._id) {
        return next(
          new APIError(500, "Manager hotel data not properly populated")
        );
      }

      if (manager.hotel._id.toString() !== hotel._id.toString()) {
        return next(
          new APIError(400, "Manager must be from the same hotel as staff")
        );
      }

      // If branch is specified, ensure manager is from the same branch
      if (branch) {
        if (!manager.branch || !manager.branch._id) {
          return next(
            new APIError(400, "Manager does not have a branch assigned")
          );
        }

        if (manager.branch._id.toString() !== branch._id.toString()) {
          return next(
            new APIError(400, "Manager must be from the same branch as staff")
          );
        }
      }

      // Check if admin/manager has access to assign this manager
      if (
        (req.admin?.role === "branch_admin" &&
          req.admin.canAccessBranch &&
          manager.branch &&
          !req.admin.canAccessBranch(manager.branch._id)) ||
        (req.manager?.role === "branch_manager" &&
          manager.branch &&
          req.manager.branch.toString() !== manager.branch._id.toString())
      ) {
        return next(
          new APIError(403, "You don't have access to assign this manager")
        );
      }
    }

    // Check if staff with same email exists
    const existingStaff = await Staff.findOne({ email });
    if (existingStaff) {
      return next(new APIError(400, "Staff with this email already exists"));
    }

    // Store plain text password for email (before hashing)
    const plainTextPassword = password;

    const staff = new Staff({
      name,
      email,
      phone,
      password,
      hotel: hotel._id, // Always use MongoDB ObjectId for reference
      branch: branch ? branch._id : null, // Use MongoDB ObjectId if branch exists, null if optional
      role,
      department,
      manager: manager ? manager._id : null, // Use MongoDB ObjectId if manager exists, null if not assigned
    });

    await staff.save();

    const populatedStaff = await Staff.findById(staff._id)
      .populate("hotel", "name hotelId email")
      .populate("branch", "name branchId location")
      .populate("manager", "name employeeId")
      .select("-password -refreshToken");

    // Send welcome email with credentials
    try {
      await sendStaffWelcomeEmail(
        {
          name: staff.name,
          email: staff.email,
          staffId: staff.staffId,
          tempPassword: plainTextPassword,
          role: staff.role,
          department: staff.department,
        },
        {
          name: hotel.name,
          email: hotel.email,
        },
        branch ? { name: branch.name } : null,
        manager ? { name: manager.name } : null
      );
      console.log(`Welcome email sent to staff: ${staff.email}`);
    } catch (emailError) {
      console.error("Failed to send welcome email to staff:", emailError);
      // Don't fail the creation if email fails, just log the error
    }

    res
      .status(201)
      .json(
        new APIResponse(
          201,
          { staff: populatedStaff },
          "Staff created successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

export const updateStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const updates = req.body;

    // Only admins can update staff
    if (!["admin", "super_admin", "branch_admin"].includes(req.admin.role)) {
      return next(new APIError(403, "Only admins can update staff"));
    }

    // Remove sensitive fields from updates
    delete updates.password;
    delete updates.refreshToken;

    // Get the current staff to check permissions - support both MongoDB _id and staffId
    let currentStaff;
    if (staffId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId
      currentStaff = await Staff.findById(staffId).populate("branch");
    } else {
      // It's a staffId (auto-generated)
      currentStaff = await Staff.findOne({ staffId: staffId }).populate(
        "branch"
      );
    }

    if (!currentStaff) {
      return next(new APIError(404, "Staff not found"));
    }

    // Check if admin has access to this staff's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(currentStaff.branch._id)
    ) {
      return next(
        new APIError(403, "You don't have access to this staff member")
      );
    }

    // If manager assignment is being updated, validate it
    if (updates.manager) {
      const manager = await Manager.findById(updates.manager).populate(
        "branch"
      );
      if (!manager) {
        return next(new APIError(404, "Manager not found"));
      }

      // Ensure manager is from the same branch as staff
      if (
        manager.branch._id.toString() !== currentStaff.branch._id.toString()
      ) {
        return next(
          new APIError(400, "Manager must be from the same branch as staff")
        );
      }

      // Check if admin has access to the manager's branch
      if (
        req.admin.role === "branch_admin" &&
        !req.admin.canAccessBranch(manager.branch._id)
      ) {
        return next(
          new APIError(403, "You don't have access to assign this manager")
        );
      }
    }

    // Update the staff using the correct query
    let staff;
    if (staffId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId
      staff = await Staff.findByIdAndUpdate(staffId, updates, {
        new: true,
        runValidators: true,
      })
        .populate("branch", "name branchId location")
        .populate("manager", "name employeeId email")
        .select("-password -refreshToken");
    } else {
      // It's a staffId (auto-generated)
      staff = await Staff.findOneAndUpdate({ staffId: staffId }, updates, {
        new: true,
        runValidators: true,
      })
        .populate("branch", "name branchId location")
        .populate("manager", "name employeeId email")
        .select("-password -refreshToken");
    }

    res
      .status(200)
      .json(new APIResponse(200, { staff }, "Staff updated successfully"));
  } catch (error) {
    next(error);
  }
};

export const deleteStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;

    // Find staff by MongoDB ObjectId or staffId - support both formats
    let staff;
    if (staffId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId
      staff = await Staff.findById(staffId).populate("branch");
    } else {
      // It's a staffId (auto-generated)
      staff = await Staff.findOne({ staffId: staffId }).populate("branch");
    }

    if (!staff) {
      return next(new APIError(404, "Staff not found"));
    }

    // Check if admin has access to this staff's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(staff.branch._id)
    ) {
      return next(
        new APIError(403, "You don't have access to this staff member")
      );
    }

    // Delete using the MongoDB ObjectId
    await Staff.findByIdAndDelete(staff._id);

    res
      .status(200)
      .json(new APIResponse(200, null, "Staff deleted successfully"));
  } catch (error) {
    next(error);
  }
};

// Deactivate staff (set status to inactive)
export const deactivateStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;

    // Find staff by MongoDB ObjectId or staffId - support both formats
    let staff;
    if (staffId.match(/^[0-9a-fA-F]{24}$/)) {
      staff = await Staff.findById(staffId);
    } else {
      staff = await Staff.findOne({ staffId: staffId });
    }

    if (!staff) {
      return next(new APIError(404, "Staff not found"));
    }

    // Check if admin has access to this staff's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(staff.branch)
    ) {
      return next(
        new APIError(403, "You don't have access to this staff member")
      );
    }

    if (staff.status === "inactive") {
      return next(new APIError(400, "Staff is already inactive"));
    }

    // Update staff status
    staff.status = "inactive";
    staff.updatedAt = new Date();
    await staff.save();

    // Populate related data for service status
    const populatedStaff = await Staff.findById(staff._id)
      .populate({
        path: "branch",
        select: "name branchId status",
        populate: {
          path: "hotel",
          select: "name hotelId status",
        },
      })
      .select("-password -refreshToken");

    // Add service status
    const staffWithStatus = addStaffServiceStatus(populatedStaff);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          staffWithStatus,
          "Staff deactivated successfully. They will appear in search results but marked as no services provided."
        )
      );
  } catch (error) {
    next(error);
  }
};

// Reactivate staff (set status to active)
export const reactivateStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;

    // Find staff by MongoDB ObjectId or staffId - support both formats
    let staff;
    if (staffId.match(/^[0-9a-fA-F]{24}$/)) {
      staff = await Staff.findById(staffId);
    } else {
      staff = await Staff.findOne({ staffId: staffId });
    }

    if (!staff) {
      return next(new APIError(404, "Staff not found"));
    }

    // Check if admin has access to this staff's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(staff.branch)
    ) {
      return next(
        new APIError(403, "You don't have access to this staff member")
      );
    }

    if (staff.status === "active") {
      return next(new APIError(400, "Staff is already active"));
    }

    // Update staff status
    staff.status = "active";
    staff.updatedAt = new Date();
    await staff.save();

    // Populate related data for service status
    const populatedStaff = await Staff.findById(staff._id)
      .populate({
        path: "branch",
        select: "name branchId status",
        populate: {
          path: "hotel",
          select: "name hotelId status",
        },
      })
      .select("-password -refreshToken");

    // Add service status
    const staffWithStatus = addStaffServiceStatus(populatedStaff);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          staffWithStatus,
          "Staff reactivated successfully. Services are now available."
        )
      );
  } catch (error) {
    next(error);
  }
};

// Admin-only function to assign staff to a manager
export const assignStaffToManager = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { managerId } = req.body;

    // Only admins can assign staff to managers
    if (!["admin", "super_admin", "branch_admin"].includes(req.admin.role)) {
      return next(
        new APIError(403, "Only admins can assign staff to managers")
      );
    }

    // Get staff details - support both MongoDB ObjectId and staffId
    let staff;
    if (staffId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId
      staff = await Staff.findById(staffId).populate("branch");
    } else {
      // It's a staffId (auto-generated)
      staff = await Staff.findOne({ staffId: staffId }).populate("branch");
    }

    if (!staff) {
      return next(new APIError(404, "Staff not found"));
    }

    // Check if admin has access to this staff's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(staff.branch._id)
    ) {
      return next(
        new APIError(403, "You don't have access to this staff member")
      );
    }

    let manager = null;
    if (managerId) {
      // Get manager details
      manager = await Manager.findById(managerId).populate("branch");
      if (!manager) {
        return next(new APIError(404, "Manager not found"));
      }

      // Ensure manager is from the same branch as staff
      if (manager.branch._id.toString() !== staff.branch._id.toString()) {
        return next(
          new APIError(400, "Manager must be from the same branch as staff")
        );
      }

      // Check if admin has access to the manager's branch
      if (
        req.admin.role === "branch_admin" &&
        !req.admin.canAccessBranch(manager.branch._id)
      ) {
        return next(
          new APIError(403, "You don't have access to assign this manager")
        );
      }
    }

    // Update staff's manager assignment
    staff.manager = managerId || null;
    await staff.save();

    // Populate the updated staff using the MongoDB ObjectId
    const updatedStaff = await Staff.findById(staff._id)
      .populate("branch", "name branchId location")
      .populate("manager", "name employeeId email")
      .select("-password -refreshToken");

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { staff: updatedStaff },
          managerId
            ? `Staff assigned to manager ${manager.name} successfully`
            : "Staff unassigned from manager successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

// Admin-only function to get all staff under a specific manager
export const getStaffByManager = async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const {
      page = 1,
      limit = 10,
      status = "active",
      role,
      department,
    } = req.query;

    // Only admins can view staff assignments
    if (!["admin", "super_admin", "branch_admin"].includes(req.admin.role)) {
      return next(new APIError(403, "Only admins can view staff assignments"));
    }

    // Get manager details - support both ObjectId and custom employeeId
    let manager;
    if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a valid MongoDB ObjectId
      manager = await Manager.findById(managerId).populate("branch");
    } else {
      // It's a custom employeeId (e.g., MGR-2025-00001)
      manager = await Manager.findOne({ employeeId: managerId }).populate(
        "branch"
      );
    }

    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Check if admin has access to the manager's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(manager.branch._id)
    ) {
      return next(
        new APIError(403, "You don't have access to this manager's staff")
      );
    }

    // Build query
    const query = { manager: managerId, status };
    if (role) query.role = role;
    if (department) query.department = department;

    const skip = (page - 1) * limit;

    const staff = await Staff.find(query)
      .populate("branch", "name branchId location")
      .populate("manager", "name employeeId email")
      .select("-password -refreshToken")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalStaff = await Staff.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          staff,
          manager: {
            name: manager.name,
            employeeId: manager.employeeId,
            email: manager.email,
            branch: manager.branch.name,
          },
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalStaff / limit),
            totalStaff,
            hasNextPage: page < Math.ceil(totalStaff / limit),
            hasPreviousPage: page > 1,
          },
        },
        "Staff under manager retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};
