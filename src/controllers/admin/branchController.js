import {
  Branch,
  validateBranch,
  validateUpdateBranch,
  validateBranchLocationSearch,
} from "../../models/Branch.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import {
  addServiceStatusToBranches,
  addBranchServiceStatus,
} from "../../utils/hotelStatusHelper.js";

// Create a new branch
export const createBranch = async (req, res, next) => {
  try {
    const { error } = validateBranch(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    // Check if hotel exists - support both auto-generated hotelId and MongoDB _id
    let hotel;
    const hotelIdentifier = req.body.hotel;

    // Try to find by MongoDB ObjectId first
    if (hotelIdentifier.match(/^[0-9a-fA-F]{24}$/)) {
      hotel = await Hotel.findById(hotelIdentifier);
    }

    // If not found by ObjectId, try to find by auto-generated hotelId
    if (!hotel) {
      hotel = await Hotel.findOne({ hotelId: hotelIdentifier });
    }

    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    // Check if branch with same email already exists
    const existingEmail = await Branch.findOne({
      "contactInfo.email": req.body.contactInfo.email,
    });
    if (existingEmail) {
      return next(new APIError(400, "Branch with this email already exists"));
    }

    const branch = new Branch({
      ...req.body,
      hotel: hotel._id, // Always use the MongoDB ObjectId for the reference
    });
    await branch.save();

    // Populate hotel information
    await branch.populate("hotel", "name hotelId");

    res
      .status(201)
      .json(new APIResponse(201, branch, "Branch created successfully"));
  } catch (error) {
    next(error);
  }
};

// Get all branches with optional filtering
export const getAllBranches = async (req, res, next) => {
  try {
    const {
      hotelId,
      city,
      state,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (hotelId) {
      const hotel = await Hotel.findOne({ hotelId });
      if (hotel) {
        query.hotel = hotel._id;
      }
    }

    if (city) {
      query["location.city"] = new RegExp(city, "i");
    }

    if (state) {
      query["location.state"] = new RegExp(state, "i");
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const branches = await Branch.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("hotel", "name hotelId mainLocation status");

    const totalBranches = await Branch.countDocuments(query);

    // Add service status to branches
    const branchesWithStatus = addServiceStatusToBranches(branches);

    res.status(200).json(
      new APIResponse(
        200,
        {
          branches: branchesWithStatus,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalBranches / limit),
            totalBranches,
            hasNextPage: page < Math.ceil(totalBranches / limit),
            hasPrevPage: page > 1,
          },
        },
        "Branches retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

// Get branch by ID
export const getBranchById = async (req, res, next) => {
  try {
    const { branchId } = req.params;

    const branch = await Branch.findOne({ branchId }).populate(
      "hotel",
      "name hotelId mainLocation contactInfo status"
    );

    if (!branch) {
      return next(new APIError(404, "Branch not found"));
    }

    // Add service status to branch
    const branchWithStatus = addBranchServiceStatus(branch);

    res
      .status(200)
      .json(
        new APIResponse(200, branchWithStatus, "Branch retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};

// Update branch
export const updateBranch = async (req, res, next) => {
  try {
    const { branchId } = req.params;

    const { error } = validateUpdateBranch(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const branch = await Branch.findOneAndUpdate({ branchId }, req.body, {
      new: true,
      runValidators: true,
    }).populate("hotel", "name hotelId");

    if (!branch) {
      return next(new APIError(404, "Branch not found"));
    }

    res
      .status(200)
      .json(new APIResponse(200, branch, "Branch updated successfully"));
  } catch (error) {
    next(error);
  }
};

// Delete branch (soft delete by changing status)
export const deleteBranch = async (req, res, next) => {
  try {
    const { branchId } = req.params;

    // Find the branch first to check if it exists
    const branch = await Branch.findOne({ branchId });
    if (!branch) {
      return next(new APIError(404, "Branch not found"));
    }

    // Check if there are any active managers, staff, or bookings associated with this branch
    const [activeManagers, activeStaff, activeBookings] = await Promise.all([
      // Check for managers in this branch
      req.app
        .get("models")
        ?.Manager?.countDocuments({ branch: branch._id, status: "active" }) ||
        0,
      // Check for staff in this branch
      req.app
        .get("models")
        ?.Staff?.countDocuments({ branch: branch._id, status: "active" }) || 0,
      // Check for active bookings in this branch
      req.app.get("models")?.Booking?.countDocuments({
        branch: branch._id,
        status: { $in: ["confirmed", "pending"] },
      }) || 0,
    ]);

    // Prevent deletion if there are active associations
    if (activeManagers > 0) {
      return next(
        new APIError(
          400,
          `Cannot delete branch: ${activeManagers} active manager(s) still assigned to this branch`
        )
      );
    }
    if (activeStaff > 0) {
      return next(
        new APIError(
          400,
          `Cannot delete branch: ${activeStaff} active staff member(s) still assigned to this branch`
        )
      );
    }
    if (activeBookings > 0) {
      return next(
        new APIError(
          400,
          `Cannot delete branch: ${activeBookings} active booking(s) still exist for this branch`
        )
      );
    }

    // Completely delete the branch from database
    await Branch.findOneAndDelete({ branchId });

    res
      .status(200)
      .json(
        new APIResponse(200, null, "Branch permanently deleted from database")
      );
  } catch (error) {
    next(error);
  }
};

// Deactivate branch (set status to inactive)
export const deactivateBranch = async (req, res, next) => {
  try {
    const { branchId } = req.params;

    const branch = await Branch.findOne({ branchId });
    if (!branch) {
      return next(new APIError(404, "Branch not found"));
    }

    if (branch.status === "inactive") {
      return next(new APIError(400, "Branch is already inactive"));
    }

    // Update branch status
    branch.status = "inactive";
    branch.updatedAt = new Date();
    await branch.save();

    // Populate hotel data for service status
    const populatedBranch = await Branch.findOne({ branchId }).populate(
      "hotel",
      "name hotelId status"
    );

    // Add service status
    const branchWithStatus = addBranchServiceStatus(populatedBranch);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          branchWithStatus,
          "Branch deactivated successfully. It will appear in search results but marked as no services provided."
        )
      );
  } catch (error) {
    next(error);
  }
};

// Reactivate branch (set status to active)
export const reactivateBranch = async (req, res, next) => {
  try {
    const { branchId } = req.params;

    const branch = await Branch.findOne({ branchId });
    if (!branch) {
      return next(new APIError(404, "Branch not found"));
    }

    if (branch.status === "active") {
      return next(new APIError(400, "Branch is already active"));
    }

    // Update branch status
    branch.status = "active";
    branch.updatedAt = new Date();
    await branch.save();

    // Populate hotel data for service status
    const populatedBranch = await Branch.findOne({ branchId }).populate(
      "hotel",
      "name hotelId status"
    );

    // Add service status
    const branchWithStatus = addBranchServiceStatus(populatedBranch);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          branchWithStatus,
          "Branch reactivated successfully. Services are now available."
        )
      );
  } catch (error) {
    next(error);
  }
};

// Search branches by location
export const searchBranchesByLocation = async (req, res, next) => {
  try {
    const { error } = validateBranchLocationSearch(req.query);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const {
      city,
      state,
      pincode,
      latitude,
      longitude,
      radius = 10,
      hotelId,
      page = 1,
      limit = 10,
    } = req.query;

    let query = { status: "active" };

    // Filter by hotel if provided
    if (hotelId) {
      const hotel = await Hotel.findOne({ hotelId });
      if (hotel) {
        query.hotel = hotel._id;
      } else {
        return next(new APIError(404, "Hotel not found"));
      }
    }

    if (city) {
      query["location.city"] = new RegExp(city, "i");
    }

    if (state) {
      query["location.state"] = new RegExp(state, "i");
    }

    if (pincode) {
      query["location.pincode"] = pincode;
    }

    let branches;

    // If coordinates are provided, use geospatial search
    if (latitude && longitude) {
      branches = await Branch.find({
        ...query,
        "location.coordinates": {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(longitude), parseFloat(latitude)],
            },
            $maxDistance: parseFloat(radius) * 1000, // Convert km to meters
          },
        },
      })
        .populate("hotel", "name hotelId")
        .sort({ "rating.average": -1 });
    } else {
      const skip = (page - 1) * limit;
      branches = await Branch.find(query)
        .populate("hotel", "name hotelId")
        .sort({ "rating.average": -1 })
        .skip(skip)
        .limit(parseInt(limit));
    }

    const totalBranches = await Branch.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          branches,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalBranches / limit),
            totalBranches,
            hasNextPage: page < Math.ceil(totalBranches / limit),
            hasPrevPage: page > 1,
          },
        },
        "Branches found in the specified location"
      )
    );
  } catch (error) {
    next(error);
  }
};

// Get branches of a specific hotel
export const getBranchesByHotel = async (req, res, next) => {
  try {
    const { hotelId } = req.params;
    const { status = "active", city, state, page = 1, limit = 10 } = req.query;

    // Find the hotel first
    const hotel = await Hotel.findOne({ hotelId });
    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    let query = {
      hotel: hotel._id,
      status,
    };

    if (city) {
      query["location.city"] = new RegExp(city, "i");
    }

    if (state) {
      query["location.state"] = new RegExp(state, "i");
    }

    const skip = (page - 1) * limit;

    const branches = await Branch.find(query)
      .sort({ "rating.average": -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("hotel", "name hotelId");

    const totalBranches = await Branch.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          hotel: {
            name: hotel.name,
            hotelId: hotel.hotelId,
          },
          branches,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalBranches / limit),
            totalBranches,
            hasNextPage: page < Math.ceil(totalBranches / limit),
            hasPrevPage: page > 1,
          },
        },
        "Hotel branches retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};
