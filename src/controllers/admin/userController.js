import { User } from "../../models/User.model.js";
import {
  Manager,
  managerValidationSchemas,
} from "../../models/Manager.model.js";
import { Staff } from "../../models/Staff.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";

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
      status,
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
      .populate("hotel", "name hotelId")
      .populate("branch", "name branchId location")
      .select("-password -refreshToken")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalManagers = await Manager.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          managers,
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
        .populate("hotel", "name hotelId location")
        .populate("branch", "name branchId location")
        .select("-password -refreshToken");
    } else {
      // It's a custom employeeId (e.g., MGR-2025-00001)
      manager = await Manager.findOne({ employeeId: managerId })
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
      .json(
        new APIResponse(200, { manager }, "Manager retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};

export const createManager = async (req, res, next) => {
  try {
    const { name, email, phone, password, hotelId, branchId } = req.body;

    // Only admins can create managers
    if (req.admin.role !== "super_admin" && req.admin.role !== "branch_admin") {
      return next(new APIError(403, "Only admins can create managers"));
    }

    // Validate hotel exists
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    // Validate branch exists and belongs to the specified hotel
    const branch = await Branch.findById(branchId).populate("hotel");
    if (!branch) {
      return next(new APIError(404, "Branch not found"));
    }

    if (branch.hotel._id.toString() !== hotelId) {
      return next(
        new APIError(400, "Branch does not belong to the specified hotel")
      );
    }

    // Check if admin has access to this branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(branchId)
    ) {
      return next(new APIError(403, "You don't have access to this branch"));
    }

    // Check if manager with same email exists
    const existingManager = await Manager.findOne({ email });
    if (existingManager) {
      return next(new APIError(400, "Manager with this email already exists"));
    }

    const manager = new Manager({
      name,
      email,
      phone,
      password,
      hotel: hotelId,
      branch: branchId,
    });

    await manager.save();

    const populatedManager = await Manager.findById(manager._id)
      .populate("hotel", "name hotelId")
      .populate("branch", "name branchId location")
      .select("-password -refreshToken");

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

export const updateManagerPermissions = async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const { permissions } = req.body;

    // Only super admin can update manager permissions
    if (req.admin.role !== "super_admin") {
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
      .populate("branch", "name branchId location")
      .select("-password -refreshToken")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalStaff = await Staff.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          staff,
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
    const {
      name,
      email,
      phone,
      password,
      hotelId,
      branchId,
      role,
      department,
      managerId,
    } = req.body;

    // Only admins can create staff and assign managers
    if (req.admin.role !== "super_admin" && req.admin.role !== "branch_admin") {
      return next(new APIError(403, "Only admins can create staff"));
    }

    // Validate hotel exists
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    // Validate branch exists and belongs to the specified hotel
    const branch = await Branch.findById(branchId).populate("hotel");
    if (!branch) {
      return next(new APIError(404, "Branch not found"));
    }

    if (branch.hotel._id.toString() !== hotelId) {
      return next(
        new APIError(400, "Branch does not belong to the specified hotel")
      );
    }

    // Check if admin has access to this branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(branchId)
    ) {
      return next(new APIError(403, "You don't have access to this branch"));
    }

    // Validate manager assignment - support both ObjectId and custom employeeId
    if (managerId) {
      let manager;
      if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
        // It's a valid MongoDB ObjectId
        manager = await Manager.findById(managerId).populate("branch hotel");
      } else {
        // It's a custom employeeId (e.g., MGR-2025-00001)
        manager = await Manager.findOne({ employeeId: managerId }).populate(
          "branch hotel"
        );
      }

      if (!manager) {
        return next(new APIError(404, "Manager not found"));
      }

      // Ensure manager is from the same branch and hotel
      if (manager.branch._id.toString() !== branchId) {
        return next(
          new APIError(400, "Manager must be from the same branch as staff")
        );
      }

      if (manager.hotel._id.toString() !== hotelId) {
        return next(
          new APIError(400, "Manager must be from the same hotel as staff")
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

    // Check if staff with same email exists
    const existingStaff = await Staff.findOne({ email });
    if (existingStaff) {
      return next(new APIError(400, "Staff with this email already exists"));
    }

    const staff = new Staff({
      name,
      email,
      phone,
      password,
      hotel: hotelId,
      branch: branchId,
      role,
      department,
      manager: managerId || null, // Admin can optionally assign a manager
    });

    await staff.save();

    const populatedStaff = await Staff.findById(staff._id)
      .populate("hotel", "name hotelId")
      .populate("branch", "name branchId location")
      .populate("manager", "name employeeId email")
      .select("-password -refreshToken");

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
    if (req.admin.role !== "super_admin" && req.admin.role !== "branch_admin") {
      return next(new APIError(403, "Only admins can update staff"));
    }

    // Remove sensitive fields from updates
    delete updates.password;
    delete updates.refreshToken;

    // Get the current staff to check permissions
    const currentStaff = await Staff.findById(staffId).populate("branch");
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

    const staff = await Staff.findByIdAndUpdate(staffId, updates, {
      new: true,
      runValidators: true,
    })
      .populate("branch", "name branchId location")
      .populate("manager", "name employeeId email")
      .select("-password -refreshToken");

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

    const staff = await Staff.findById(staffId).populate("branch");
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

    await Staff.findByIdAndDelete(staffId);

    res
      .status(200)
      .json(new APIResponse(200, null, "Staff deleted successfully"));
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
    if (req.admin.role !== "super_admin" && req.admin.role !== "branch_admin") {
      return next(
        new APIError(403, "Only admins can assign staff to managers")
      );
    }

    // Get staff details
    const staff = await Staff.findById(staffId).populate("branch");
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

    // Populate the updated staff
    const updatedStaff = await Staff.findById(staffId)
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
    if (req.admin.role !== "super_admin" && req.admin.role !== "branch_admin") {
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
