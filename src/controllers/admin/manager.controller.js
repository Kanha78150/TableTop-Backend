import {
  Manager,
  managerValidationSchemas,
} from "../../models/Manager.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";
import fs from "fs";
import { sendManagerWelcomeEmail } from "../../utils/emailService.js";
import {
  addServiceStatusToManagers,
  addManagerServiceStatus,
} from "../../utils/hotelStatusHelper.js";
import {
  updateResourceUsage,
  decreaseResourceUsage,
} from "../../middleware/subscriptionAuth.middleware.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";

// Manager Management (admin-specific)
export const getAllManagers = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    search,
    branchId,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const query = {};

  // Add admin restriction (super admin can see all)
  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  if (search) {
    query.$or = [
      { name: new RegExp(search, "i") },
      { email: new RegExp(search, "i") },
      { phone: new RegExp(search, "i") },
    ];
  }

  if (branchId) {
    // Verify branch belongs to admin before filtering
    const branchQuery = { branchId };
    if (req.admin.role !== "super_admin") {
      branchQuery.createdBy = req.admin._id;
    }

    const branch = await Branch.findOne(branchQuery);
    if (!branch) {
      return next(new APIError(404, "Branch not found or access denied"));
    }

    query.branch = branch._id;
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
  });

export const getManagerById = asyncHandler(async (req, res, next) => {
  const { managerId } = req.params;

  // Base query with admin restriction
  const query = {};
  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  // Try to find manager by MongoDB ObjectId first, then by custom employeeId
  let manager;
  if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
    // It's a valid MongoDB ObjectId
    query._id = managerId;
    manager = await Manager.findOne(query)
      .populate("hotel", "name hotelId location status")
      .populate("branch", "name branchId location status")
      .select("-password -refreshToken");
  } else {
    // It's a custom employeeId (e.g., MGR-2025-00001)
    query.employeeId = managerId;
    manager = await Manager.findOne(query)
      .populate("hotel", "name hotelId location status")
      .populate("branch", "name branchId location status")
      .select("-password -refreshToken");
  }

  if (!manager) {
    return next(new APIError(404, "Manager not found or access denied"));
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
  });

// create manager
export const createManager = asyncHandler(async (req, res, next) => {
  // Parse FormData string fields (when sent via multipart/form-data)
  if (typeof req.body.permissions === "string") {
    try {
      req.body.permissions = JSON.parse(req.body.permissions);
    } catch (e) {}
  }
  if (typeof req.body.emergencyContact === "string") {
    try {
      req.body.emergencyContact = JSON.parse(req.body.emergencyContact);
    } catch (e) {}
  }

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
    department,
    profileImage,
    permissions,
    emergencyContact,
  } = req.body;

  // Only admins can create managers
  if (!["admin", "super_admin", "branch_admin"].includes(req.admin.role)) {
    return next(new APIError(403, "Only admins can create managers"));
  }

  // Validate hotel exists - support both auto-generated hotelId and MongoDB _id
  let hotel;
  const hotelQuery = {};
  if (req.admin.role !== "super_admin") {
    hotelQuery.createdBy = req.admin._id;
  }

  if (hotelId.match(/^[0-9a-fA-F]{24}$/)) {
    hotelQuery._id = hotelId;
    hotel = await Hotel.findOne(hotelQuery);
  } else {
    hotelQuery.hotelId = hotelId;
    hotel = await Hotel.findOne(hotelQuery);
  }
  if (!hotel) {
    return next(new APIError(404, "Hotel not found or access denied"));
  }

  // Validate branch exists and belongs to the specified hotel (if branchId is provided)
  let branch = null;
  if (branchId) {
    const branchQuery = { hotel: hotel._id };
    if (req.admin.role !== "super_admin") {
      branchQuery.createdBy = req.admin._id;
    }

    if (branchId.match(/^[0-9a-fA-F]{24}$/)) {
      branchQuery._id = branchId;
      branch = await Branch.findOne(branchQuery).populate("hotel");
    } else {
      branchQuery.branchId = branchId;
      branch = await Branch.findOne(branchQuery).populate("hotel");
    }

    if (!branch) {
      return next(new APIError(404, "Branch not found or access denied"));
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
    createdBy: req.admin._id, // Associate manager with creating admin
    department: department || "operations",
    profileImage: profileImage || null,
    permissions: permissions || undefined, // Use provided permissions or model defaults
    emergencyContact: emergencyContact || undefined,
  });

  // Handle profile image upload
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.path);
      manager.profileImage = result.secure_url;
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (uploadError) {
      console.error("Error uploading manager profile image:", uploadError);
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  }

  await manager.save();

  // Update subscription usage counter for managers (skip for super_admin)
  if (req.admin.role !== "super_admin") {
    try {
      await updateResourceUsage(req.admin._id, "managers");
    } catch (usageError) {
      // If usage update fails, delete the created manager and throw error
      await Manager.findByIdAndDelete(manager._id);
      throw usageError;
    }
  }

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
  });

export const updateManager = asyncHandler(async (req, res, next) => {
  const { managerId } = req.params;
  const updates = req.body;

  // Remove sensitive fields from updates
  delete updates.password;
  delete updates.refreshToken;
  delete updates.createdBy; // Prevent changing the creator

  // Handle profile image upload
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.path);
      updates.profileImage = result.secure_url;
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (uploadError) {
      console.error("Error uploading manager profile image:", uploadError);
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  }

  // Base query with admin restriction
  const query = {};
  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  // Try to find and update manager by MongoDB ObjectId first, then by custom employeeId
  let manager;
  if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
    // It's a valid MongoDB ObjectId
    query._id = managerId;
    manager = await Manager.findOneAndUpdate(query, updates, {
      new: true,
      runValidators: true,
    })
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location")
      .select("-password -refreshToken");
  } else {
    // It's a custom employeeId (e.g., MGR-2025-00001)
    query.employeeId = managerId;
    manager = await Manager.findOneAndUpdate(query, updates, {
      new: true,
      runValidators: true,
    })
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location")
      .select("-password -refreshToken");
  }

  if (!manager) {
    return next(new APIError(404, "Manager not found or access denied"));
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
  });

export const deleteManager = asyncHandler(async (req, res, next) => {
  const { managerId } = req.params;

  // Base query with admin restriction
  const query = {};
  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  // Try to find manager by MongoDB ObjectId first, then by custom employeeId
  let manager;
  if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
    // It's a valid MongoDB ObjectId
    query._id = managerId;
    manager = await Manager.findOne(query)
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location");
  } else {
    // It's a custom employeeId (e.g., MGR-2025-00001)
    query.employeeId = managerId;
    manager = await Manager.findOne(query)
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location");
  }

  if (!manager) {
    return next(new APIError(404, "Manager not found or access denied"));
  }

  // Check if admin has access to this manager's branch
  if (
    req.admin.role === "branch_admin" &&
    !req.admin.canAccessBranch(manager.branch._id)
  ) {
    return next(new APIError(403, "You don't have access to this manager"));
  }

  // Delete manager using the same query to ensure admin restriction
  await Manager.findOneAndDelete(query);

  // Decrease subscription usage counter for managers (skip for super_admin)
  if (req.admin.role !== "super_admin") {
    try {
      await decreaseResourceUsage(req.admin._id, "managers");
    } catch (usageError) {
      console.error("Failed to decrease manager usage counter:", usageError);
      // Log error but don't fail the deletion
    }
  }

  res
    .status(200)
    .json(new APIResponse(200, null, "Manager deleted successfully"));
  });

// Deactivate manager (set status to inactive) (admin-specific)
export const deactivateManager = asyncHandler(async (req, res, next) => {
  const { managerId } = req.params;

  // Base query with admin restriction
  const query = {};
  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  // Try to find manager by MongoDB ObjectId first, then by custom employeeId
  let manager;
  if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
    query._id = managerId;
    manager = await Manager.findOne(query);
  } else {
    query.employeeId = managerId;
    manager = await Manager.findOne(query);
  }

  if (!manager) {
    return next(new APIError(404, "Manager not found or access denied"));
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
  });

// Reactivate manager (set status to active) (admin-specific)
export const reactivateManager = asyncHandler(async (req, res, next) => {
  const { managerId } = req.params;

  // Base query with admin restriction
  const query = {};
  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  // Try to find manager by MongoDB ObjectId first, then by custom employeeId
  let manager;
  if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
    query._id = managerId;
    manager = await Manager.findOne(query);
  } else {
    query.employeeId = managerId;
    manager = await Manager.findOne(query);
  }

  if (!manager) {
    return next(new APIError(404, "Manager not found or access denied"));
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
  });

export const updateManagerPermissions = asyncHandler(async (req, res, next) => {
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
  });
