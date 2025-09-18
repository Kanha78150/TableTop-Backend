import {
  Branch,
  validateBranch,
  validateUpdateBranch,
  validateBranchLocationSearch,
} from "../../models/Branch.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";

// Create a new branch
export const createBranch = async (req, res, next) => {
  try {
    const { error } = validateBranch(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    // Check if hotel exists
    const hotel = await Hotel.findById(req.body.hotel);
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

    const branch = new Branch(req.body);
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
      status = "active",
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { status };

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
      .populate("hotel", "name hotelId mainLocation");

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
      "name hotelId mainLocation contactInfo"
    );

    if (!branch) {
      return next(new APIError(404, "Branch not found"));
    }

    res
      .status(200)
      .json(new APIResponse(200, branch, "Branch retrieved successfully"));
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

    const branch = await Branch.findOneAndUpdate(
      { branchId },
      { status: "inactive" },
      { new: true }
    );

    if (!branch) {
      return next(new APIError(404, "Branch not found"));
    }

    res
      .status(200)
      .json(new APIResponse(200, null, "Branch deleted successfully"));
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
