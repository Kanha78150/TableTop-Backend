import { Manager } from "../../models/Manager.model.js";
import { Staff, staffValidationSchemas } from "../../models/Staff.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";
import fs from "fs";
import { sendStaffWelcomeEmail } from "../../utils/emailService.js";
import {
  addServiceStatusToStaff,
  addStaffServiceStatus,
} from "../../utils/hotelStatusHelper.js";
import {
  updateResourceUsage,
  decreaseResourceUsage,
} from "../../middleware/subscriptionAuth.middleware.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";

// Staff Management (admin-specific)
export const getAllStaff = asyncHandler(async (req, res, next) => {
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
    })
    .populate({
      path: "manager",
      select: "name employeeId email",
    })
    .populate({
      path: "createdBy",
      select: "name email role",
    })
    .populate({
      path: "hotel",
      select: "name hotelId email status",
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
  });

export const getStaffById = asyncHandler(async (req, res, next) => {
  const { staffId } = req.params;

  // Base query with admin restriction
  const query = {};
  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  let staff;

  // Check if staffId is MongoDB ObjectId or auto-generated staffId
  if (staffId.match(/^[0-9a-fA-F]{24}$/)) {
    // MongoDB ObjectId format
    query._id = staffId;
    staff = await Staff.findOne(query);
  } else {
    // Auto-generated staffId format (e.g., STF-2025-00001)
    query.staffId = staffId;
    staff = await Staff.findOne(query);
  }

  if (!staff) {
    return next(new APIError(404, "Staff not found or access denied"));
  }

  // Check if admin has access to this staff's branch
  if (
    req.admin.role === "branch_admin" &&
    req.admin.canAccessBranch &&
    !req.admin.canAccessBranch(staff.branch._id)
  ) {
    return next(new APIError(403, "You don't have access to this staff"));
  }

  // Populate related data
  const populatedStaff = await Staff.findById(staff._id)
    .populate({
      path: "hotel",
      select: "name hotelId email status",
    })
    .populate({
      path: "branch",
      select: "name branchId location status",
    })
    .populate({
      path: "manager",
      select: "name employeeId email",
    })
    .populate({
      path: "createdBy",
      select: "name email role",
    })
    .select("-password -refreshToken");

  // Add service status
  const staffWithStatus = addServiceStatusToStaff([populatedStaff]);

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { staff: staffWithStatus[0] },
        "Staff retrieved successfully"
      )
    );
  });

export const createStaff = asyncHandler(async (req, res, next) => {
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
    profileImage,
    permissions,
    emergencyContact,
  } = req.body;

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
  const hotelQuery = {};
  if (req.admin && req.admin.role !== "super_admin") {
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
    if (req.admin && req.admin.role !== "super_admin") {
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

    const managerQuery = {};
    if (req.admin && req.admin.role !== "super_admin") {
      managerQuery.createdBy = req.admin._id;
    }

    if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a valid MongoDB ObjectId
      managerQuery._id = managerId;
      manager = await Manager.findOne(managerQuery).populate("branch hotel");
      console.log(
        "Found manager by ObjectId:",
        manager ? "Found" : "Not found"
      );
    } else {
      // It's a custom employeeId (e.g., MGR-2025-00001)
      managerQuery.employeeId = managerId;
      manager = await Manager.findOne(managerQuery).populate("branch hotel");
      console.log(
        "Found manager by employeeId:",
        manager ? "Found" : "Not found"
      );
    }

    if (!manager) {
      return next(new APIError(404, "Manager not found or access denied"));
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
    createdBy: req.admin ? req.admin._id : req.manager?.createdBy, // Associate staff with creating admin
    profileImage: profileImage || null,
    permissions: permissions || undefined,
    emergencyContact: emergencyContact || undefined,
  });

  // Handle profile image upload
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.path);
      staff.profileImage = result.secure_url;
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (uploadError) {
      console.error("Error uploading staff profile image:", uploadError);
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  }

  console.log("Staff object before save:", {
    name: staff.name,
    email: staff.email,
    role: staff.role,
    staffId: staff.staffId,
    hotel: staff.hotel,
    branch: staff.branch,
  });

  try {
    await staff.save();

    console.log("Staff saved successfully with staffId:", staff.staffId);

    // Update subscription usage counter for staff (skip for super_admin)
    if (req.admin && req.admin.role !== "super_admin") {
      try {
        await updateResourceUsage(req.admin._id, "staff");
      } catch (usageError) {
        // If usage update fails, delete the created staff and throw error
        await Staff.findByIdAndDelete(staff._id);
        throw usageError;
      }
    }
  } catch (saveError) {
    console.error("Save error details:", {
      code: saveError.code,
      message: saveError.message,
      keyPattern: saveError.keyPattern,
      keyValue: saveError.keyValue,
      name: saveError.name,
    });

    // Handle MongoDB duplicate key errors
    if (saveError.code === 11000) {
      // Check what actually exists in database
      if (saveError.keyPattern && saveError.keyPattern.staffId) {
        const existingStaff = await Staff.findOne({
          staffId: saveError.keyValue.staffId,
        });
        console.log(
          "Existing staff found:",
          existingStaff
            ? {
                id: existingStaff._id,
                name: existingStaff.name,
                email: existingStaff.email,
                staffId: existingStaff.staffId,
                createdAt: existingStaff.createdAt,
              }
            : "No staff found with this ID"
        );

        return next(
          new APIError(
            409,
            `Staff ID ${saveError.keyValue.staffId} already exists. Please try again.`
          )
        );
      }
      if (saveError.keyPattern && saveError.keyPattern.email) {
        return next(
          new APIError(409, "Staff with this email already exists")
        );
      }
      return next(
        new APIError(409, "Duplicate entry found. Please check your input.")
      );
    }
    throw saveError; // Re-throw other errors
  }

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
  });

export const updateStaff = asyncHandler(async (req, res, next) => {
  const { staffId } = req.params;
  const updates = req.body;

  // Only admins can update staff
  if (!["admin", "super_admin", "branch_admin"].includes(req.admin.role)) {
    return next(new APIError(403, "Only admins can update staff"));
  }

  // Remove sensitive fields from updates
  delete updates.password;
  delete updates.refreshToken;

  // Handle profile image upload
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.path);
      updates.profileImage = result.secure_url;
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (uploadError) {
      console.error("Error uploading staff profile image:", uploadError);
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  }

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

  // Handle branch ID conversion (support both MongoDB ObjectId and auto-generated branchId)
  if (updates.branch) {
    if (!updates.branch.match(/^[0-9a-fA-F]{24}$/)) {
      // It's an auto-generated branchId, find the corresponding MongoDB ObjectId
      const branch = await Branch.findOne({ branchId: updates.branch });
      if (!branch) {
        return next(new APIError(404, "Branch not found"));
      }
      updates.branch = branch._id;
    }
  }

  // Handle hotel ID conversion (support both MongoDB ObjectId and auto-generated hotelId)
  if (updates.hotel) {
    if (!updates.hotel.match(/^[0-9a-fA-F]{24}$/)) {
      // It's an auto-generated hotelId, find the corresponding MongoDB ObjectId
      const hotel = await Hotel.findOne({ hotelId: updates.hotel });
      if (!hotel) {
        return next(new APIError(404, "Hotel not found"));
      }
      updates.hotel = hotel._id;
    }
  }

  // If manager assignment is being updated, validate it
  if (updates.manager) {
    let manager;
    if (updates.manager.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId
      manager = await Manager.findById(updates.manager).populate("branch");
    } else {
      // It's an auto-generated employeeId
      manager = await Manager.findOne({
        employeeId: updates.manager,
      }).populate("branch");
    }

    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Convert manager to ObjectId if it was an employeeId
    updates.manager = manager._id;

    // Ensure manager is from the same branch as staff (use updated branch if provided)
    const staffBranchId = updates.branch || currentStaff.branch._id;
    if (manager.branch._id.toString() !== staffBranchId.toString()) {
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
  });

export const deleteStaff = asyncHandler(async (req, res, next) => {
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

  // Decrease subscription usage counter for staff (skip for super_admin)
  if (req.admin && req.admin.role !== "super_admin") {
    try {
      await decreaseResourceUsage(req.admin._id, "staff");
    } catch (usageError) {
      console.error("Failed to decrease staff usage counter:", usageError);
      // Log error but don't fail the deletion
    }
  }

  res
    .status(200)
    .json(new APIResponse(200, null, "Staff deleted successfully"));
  });

// Deactivate staff (set status to inactive)
export const deactivateStaff = asyncHandler(async (req, res, next) => {
  const { staffId } = req.params;

  // Base query with admin restriction
  const query = {};
  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  // Find staff by MongoDB ObjectId or staffId - support both formats
  let staff;
  if (staffId.match(/^[0-9a-fA-F]{24}$/)) {
    query._id = staffId;
    staff = await Staff.findOne(query);
  } else {
    query.staffId = staffId;
    staff = await Staff.findOne(query);
  }

  if (!staff) {
    return next(new APIError(404, "Staff not found or access denied"));
  }

  // Check if admin has access to this staff's branch
  if (
    req.admin.role === "branch_admin" &&
    req.admin.canAccessBranch &&
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
  });

// Reactivate staff (set status to active)
export const reactivateStaff = asyncHandler(async (req, res, next) => {
  const { staffId } = req.params;

  // Base query with admin restriction
  const query = {};
  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  // Find staff by MongoDB ObjectId or staffId - support both formats
  let staff;
  if (staffId.match(/^[0-9a-fA-F]{24}$/)) {
    query._id = staffId;
    staff = await Staff.findOne(query);
  } else {
    query.staffId = staffId;
    staff = await Staff.findOne(query);
  }

  if (!staff) {
    return next(new APIError(404, "Staff not found or access denied"));
  }

  // Check if admin has access to this staff's branch
  if (
    req.admin.role === "branch_admin" &&
    req.admin.canAccessBranch &&
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
  });

// Admin-only function to assign staff to a manager
export const assignStaffToManager = asyncHandler(async (req, res, next) => {
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

  // Check if staff has a branch assigned
  if (!staff.branch) {
    return next(new APIError(400, "Staff member has no branch assigned"));
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
    // Get manager details - support both MongoDB ObjectId and managerId
    if (managerId.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId
      manager = await Manager.findById(managerId).populate("branch");
    } else {
      // It's a managerId (auto-generated)
      manager = await Manager.findOne({ employeeId: managerId }).populate(
        "branch"
      );
    }

    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Check if manager has a branch assigned
    if (!manager.branch) {
      return next(new APIError(400, "Manager has no branch assigned"));
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
  staff.manager = manager ? manager._id : null;
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
        manager
          ? `Staff assigned to manager ${manager.name} successfully`
          : "Staff unassigned from manager successfully"
      )
    );
  });

// Admin-only function to get all staff under a specific manager
export const getStaffByManager = asyncHandler(async (req, res, next) => {
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

  // Check if manager has a branch assigned
  if (!manager.branch) {
    return next(new APIError(400, "Manager has no branch assigned"));
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

  // Build query - use manager's MongoDB ObjectId for the query
  const query = { manager: manager._id, status };
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
  });

// Admin-only function to update staff permissions
export const updateStaffPermissions = asyncHandler(async (req, res, next) => {
  const { staffId } = req.params;
  const { permissions } = req.body;

  // Only admin and super_admin can update staff permissions (not branch_admin)
  if (!["admin", "super_admin"].includes(req.admin.role)) {
    return next(
      new APIError(
        403,
        "Only admin and super admin can update staff permissions"
      )
    );
  }

  // Validate the permissions data using the updatePermissions schema
  const { error } = staffValidationSchemas.updatePermissions.validate({
    permissions,
  });

  if (error) {
    return next(new APIError(400, error.details[0].message));
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

  // No branch access check needed since only admin and super_admin can access this endpoint

  // Update staff permissions using the MongoDB ObjectId
  const updatedStaff = await Staff.findByIdAndUpdate(
    staff._id,
    { permissions },
    {
      new: true,
      runValidators: true,
    }
  )
    .populate("branch", "name branchId location")
    .populate("manager", "name employeeId email")
    .select("-password -refreshToken");

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { staff: updatedStaff },
        "Staff permissions updated successfully"
      )
    );
  });
