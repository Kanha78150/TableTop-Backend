import {
  Hotel,
  validateHotel,
  validateUpdateHotel,
} from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import {
  addServiceStatusToHotels,
  categorizeHotelsByStatus,
} from "../../utils/hotelStatusHelper.js";
import {
  updateResourceUsage,
  decreaseResourceUsage,
} from "../../middleware/subscriptionAuth.middleware.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";
import fs from "fs";
import { logger } from "../../utils/logger.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";
import { locationUtils } from "../../services/hotel.service.js";

// Create a new hotel
export const createHotel = asyncHandler(async (req, res, next) => {
  // Parse hotel data if it comes as FormData
  const hotelData =
    typeof req.body.hotelData === "string"
      ? JSON.parse(req.body.hotelData)
      : req.body;

  const { error } = validateHotel(hotelData);
  if (error) {
    return next(new APIError(400, error.details[0].message));
  }

  // Check if hotel with same email already exists
  const existingEmail = await Hotel.findOne({
    "contactInfo.email": hotelData.contactInfo.email,
  });
  if (existingEmail) {
    return next(new APIError(400, "Hotel with this email already exists"));
  }

  // Handle image uploads
  let uploadedImages = [];
  if (req.files && req.files.length > 0) {
    logger.info(`Uploading ${req.files.length} images to Cloudinary...`);

    // Upload each image to Cloudinary
    for (const file of req.files) {
      try {
        const result = await uploadToCloudinary(file.path);
        uploadedImages.push({
          url: result.secure_url,
          alt: hotelData.name || "Hotel image",
        });

        // Delete temporary file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (uploadError) {
        logger.error("Error uploading image:", uploadError);
        // Clean up any uploaded images if there's an error
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    logger.info(`Successfully uploaded ${uploadedImages.length} images`);
  }

  // Create hotel with admin association
  const hotel = new Hotel({
    ...hotelData,
    images: uploadedImages.length > 0 ? uploadedImages : [],
    createdBy: req.admin._id, // Associate with current admin
  });
  await hotel.save();

  // Update subscription usage counter for hotels (skip for super_admin)
  if (req.admin.role !== "super_admin") {
    try {
      await updateResourceUsage(req.admin._id, "hotels");
    } catch (usageError) {
      // If usage update fails, delete the created hotel and throw error
      await Hotel.findByIdAndDelete(hotel._id);
      throw usageError;
    }
  }

  res
    .status(201)
    .json(new APIResponse(201, hotel, "Hotel created successfully"));
});

// Get all hotels with optional filtering (admin-specific)
export const getAllHotels = asyncHandler(async (req, res) => {
  const {
    city,
    state,
    status, // Remove default value to show all hotels
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Base query: only show hotels created by the current admin
  // Exception: Super admin can see all hotels
  const query = {};

  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  // Only filter by status if explicitly provided
  if (status) {
    query.status = status;
  }
  // If no status filter provided, show all hotels (active, inactive, maintenance)

  if (city) {
    query["mainLocation.city"] = new RegExp(city, "i");
  }

  if (state) {
    query["mainLocation.state"] = new RegExp(state, "i");
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const hotels = await Hotel.find(query)
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .populate({
      path: "branches",
      match: { status: "active" },
      select: "name location contactInfo rating",
    })
    .populate("createdBy", "name email"); // Include admin info

  const totalHotels = await Hotel.countDocuments(query);

  const hotelsWithServiceStatus = addServiceStatusToHotels(hotels);

  res.status(200).json(
    new APIResponse(
      200,
      {
        hotels: hotelsWithServiceStatus,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalHotels / limit),
          totalHotels,
          hasNextPage: page < Math.ceil(totalHotels / limit),
          hasPrevPage: page > 1,
        },
      },
      "Hotels retrieved successfully"
    )
  );
});

// Get hotel by ID with its branches (admin-specific)
export const getHotelById = asyncHandler(async (req, res, next) => {
  const { hotelId } = req.params;

  // Base query with admin restriction
  const query = { hotelId };

  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  const hotel = await Hotel.findOne(query)
    .populate({
      path: "branches",
      match: { status: "active" },
      select: "name location contactInfo operatingHours capacity rating",
    })
    .populate("createdBy", "name email");

  if (!hotel) {
    return next(new APIError(404, "Hotel not found or access denied"));
  }

  res
    .status(200)
    .json(new APIResponse(200, hotel, "Hotel retrieved successfully"));
});

// Get hotel branches by location (admin-specific)
export const getHotelBranchesByLocation = asyncHandler(
  async (req, res, next) => {
    const { hotelId } = req.params;
    const {
      city,
      state,
      pincode,
      latitude,
      longitude,
      radius = 10,
    } = req.query;

    // First check if hotel exists and belongs to current admin
    const hotelQuery = { hotelId };

    if (req.admin.role !== "super_admin") {
      hotelQuery.createdBy = req.admin._id;
    }

    const hotel = await Hotel.findOne(hotelQuery);
    if (!hotel) {
      return next(new APIError(404, "Hotel not found or access denied"));
    }

    let query = {
      hotel: hotel._id,
      status: "active",
    };

    // Location-based filtering
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
      branches = await Branch.find(query)
        .populate("hotel", "name hotelId")
        .sort({ "rating.average": -1 });
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          hotel: {
            name: hotel.name,
            hotelId: hotel.hotelId,
          },
          branches,
          totalBranches: branches.length,
        },
        "Hotel branches retrieved successfully"
      )
    );
  }
);

// Update hotel (admin-specific)
export const updateHotel = asyncHandler(async (req, res, next) => {
  const { hotelId } = req.params;

  // Parse hotelData if sent as FormData
  const hotelData =
    typeof req.body.hotelData === "string"
      ? JSON.parse(req.body.hotelData)
      : req.body;

  const { error } = validateUpdateHotel(hotelData);
  if (error) {
    return next(new APIError(400, error.details[0].message));
  }

  // Handle image uploads if present
  let uploadedImages = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      try {
        const result = await uploadToCloudinary(file.path);
        uploadedImages.push({
          url: result.secure_url,
          alt: hotelData.name || "Hotel image",
        });

        // Clean up temporary file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (uploadError) {
        logger.error("Error uploading image:", uploadError);
        // Clean up temporary file even if upload fails
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    // If new images were uploaded, merge with existing DB images
    if (uploadedImages.length > 0) {
      // Fetch current images from database (not from request body)
      const currentHotel = await Hotel.findOne({ hotelId }).select("images");
      const dbImages = currentHotel?.images || [];
      // hotelData.images from body = images the client explicitly wants to keep
      // If client sends images array, use that as base; otherwise keep all DB images
      const baseImages =
        hotelData.images ||
        dbImages.map((img) => ({ url: img.url, alt: img.alt }));
      hotelData.images = [...baseImages, ...uploadedImages];
    }
  }

  // Base query with admin restriction
  const query = { hotelId };

  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  const hotel = await Hotel.findOneAndUpdate(query, hotelData, {
    new: true,
    runValidators: true,
  }).populate("createdBy", "name email");

  if (!hotel) {
    return next(new APIError(404, "Hotel not found or access denied"));
  }

  res
    .status(200)
    .json(new APIResponse(200, hotel, "Hotel updated successfully"));
});

// Delete hotel (hard delete - permanently removes from database) (admin-specific)
export const deleteHotel = asyncHandler(async (req, res, next) => {
  const { hotelId } = req.params;

  // Base query with admin restriction
  const query = { hotelId };

  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  const hotel = await Hotel.findOneAndDelete(query);

  if (!hotel) {
    return next(new APIError(404, "Hotel not found or access denied"));
  }

  // Also permanently delete all branches of this hotel
  await Branch.deleteMany({ hotel: hotel._id });

  // Decrease subscription usage counter for hotels (skip for super_admin)
  if (req.admin.role !== "super_admin") {
    try {
      await decreaseResourceUsage(req.admin._id, "hotels");
    } catch (usageError) {
      logger.error("Failed to decrease hotel usage counter:", usageError);
      // Log error but don't fail the deletion
    }
  }

  res
    .status(200)
    .json(new APIResponse(200, null, "Hotel permanently deleted successfully"));
});

// Soft delete function (if you want to keep both options) (admin-specific)
export const deactivateHotel = asyncHandler(async (req, res, next) => {
  const { hotelId } = req.params;

  // Base query with admin restriction
  const query = { hotelId };

  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  const hotel = await Hotel.findOneAndUpdate(
    query,
    { status: "inactive" },
    { new: true }
  );

  if (!hotel) {
    return next(new APIError(404, "Hotel not found or access denied"));
  }

  // Also deactivate all branches of this hotel
  const branchUpdateResult = await Branch.updateMany(
    { hotel: hotel._id },
    { status: "inactive" }
  );

  res.status(200).json(
    new APIResponse(
      200,
      {
        hotel: {
          hotelId: hotel.hotelId,
          name: hotel.name,
          status: hotel.status,
          serviceStatus: {
            available: false,
            message: "No services provided by hotel",
            statusCode: "INACTIVE",
            reason: "Hotel has been deactivated and is currently offline",
          },
        },
        branchesAffected: branchUpdateResult.modifiedCount,
      },
      "Hotel deactivated successfully. Services are no longer available for this hotel and its branches."
    )
  );
});

// Reactivate hotel function (admin-specific)
export const reactivateHotel = asyncHandler(async (req, res, next) => {
  const { hotelId } = req.params;

  // Base query with admin restriction
  const query = { hotelId };

  if (req.admin.role !== "super_admin") {
    query.createdBy = req.admin._id;
  }

  const hotel = await Hotel.findOneAndUpdate(
    query,
    { status: "active" },
    { new: true }
  );

  if (!hotel) {
    return next(new APIError(404, "Hotel not found or access denied"));
  }

  // Optionally reactivate all branches of this hotel
  const { reactivateBranches = true } = req.body;
  let branchUpdateResult = { modifiedCount: 0 };

  if (reactivateBranches) {
    branchUpdateResult = await Branch.updateMany(
      { hotel: hotel._id, status: "inactive" },
      { status: "active" }
    );
  }

  res.status(200).json(
    new APIResponse(
      200,
      {
        hotel: {
          hotelId: hotel.hotelId,
          name: hotel.name,
          status: hotel.status,
          serviceStatus: {
            available: true,
            message: "Services available",
            statusCode: "ACTIVE",
            reason: "Hotel has been reactivated and is now online",
          },
        },
        branchesReactivated: branchUpdateResult.modifiedCount,
      },
      "Hotel reactivated successfully. Services are now available for this hotel."
    )
  );
});

// Simple search hotels by city/state (for /hotels/search endpoint) (admin-specific)
export const searchHotels = async (req, res, next) => {
  try {
    const {
      city,
      state,
      name,
      page = 1,
      limit = 10,
      includeInactive = "true",
    } = req.query;

    if (!city && !state && !name) {
      return next(
        new APIError(
          400,
          "Please provide city, state, or name for hotel search"
        )
      );
    }

    let query = {};

    // Base query with admin restriction
    if (req.admin.role !== "super_admin") {
      query.createdBy = req.admin._id;
    }

    // Include both active and inactive hotels by default for search results
    if (includeInactive === "false") {
      query.status = "active";
    } else {
      query.status = { $in: ["active", "inactive", "maintenance"] };
    }

    // Search by hotel name
    if (name) {
      query.name = new RegExp(name, "i");
    }

    // Search by main location city
    if (city) {
      query["mainLocation.city"] = new RegExp(city, "i");
    }

    // Search by main location state
    if (state) {
      query["mainLocation.state"] = new RegExp(state, "i");
    }

    logger.info("🔍 Hotel search query:", JSON.stringify(query, null, 2));

    const skip = (page - 1) * limit;

    const hotels = await Hotel.find(query)
      .populate({
        path: "branches",
        select:
          "name branchId location contactInfo operatingHours rating status",
      })
      .populate("createdBy", "name email")
      .sort({
        status: 1, // Active hotels first
        "rating.average": -1,
        createdAt: -1,
      })
      .skip(skip)
      .limit(parseInt(limit));

    const totalHotels = await Hotel.countDocuments(query);

    // Add service status information to each hotel
    const hotelsWithServiceStatus = addServiceStatusToHotels(hotels);

    // Categorize hotels by status for better insights
    const statusBreakdown = categorizeHotelsByStatus(hotels);

    logger.info(`✅ Found ${hotels.length} hotels matching criteria`);

    res.status(200).json(
      new APIResponse(
        200,
        {
          hotels: hotelsWithServiceStatus,
          statusBreakdown,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalHotels / limit),
            totalHotels,
            hasNextPage: page < Math.ceil(totalHotels / limit),
            hasPrevPage: page > 1,
          },
        },
        `Found ${totalHotels} hotels matching your search criteria`
      )
    );
  } catch (error) {
    logger.error("❌ Hotel search error:", error);
    next(error);
  }
};

// Search hotels by location and get their active branches (admin-specific)
export const searchHotelsByLocation = asyncHandler(async (req, res, next) => {
  const {
    city,
    state,
    latitude,
    longitude,
    radius = 25,
    page = 1,
    limit = 10,
    includeInactive = "true",
  } = req.query;

  if (!city && !state && !(latitude && longitude)) {
    return next(
      new APIError(
        400,
        "Please provide either city/state or latitude/longitude for location search"
      )
    );
  }

  // Search for hotels by their main location (include inactive for visibility)
  const locationQuery = locationUtils.buildHotelLocationQuery({ city, state });
  let hotelQuery = { ...locationQuery };

  // Base query with admin restriction
  if (req.admin.role !== "super_admin") {
    hotelQuery.createdBy = req.admin._id;
  }

  if (includeInactive === "false") {
    hotelQuery.status = "active";
  } else {
    hotelQuery.status = { $in: ["active", "inactive", "maintenance"] };
  }

  let foundHotels;

  // If coordinates are provided, use geospatial search for hotels
  if (latitude && longitude) {
    foundHotels = await Hotel.find({
      ...hotelQuery,
      "mainLocation.coordinates": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseFloat(radius) * 1000,
        },
      },
    })
      .populate({
        path: "branches",
        select:
          "name branchId location contactInfo operatingHours rating status",
      })
      .populate("createdBy", "name email")
      .sort({
        status: 1, // Active hotels first
        "rating.average": -1,
      });
  } else {
    foundHotels = await Hotel.find(hotelQuery)
      .populate({
        path: "branches",
        select:
          "name branchId location contactInfo operatingHours rating status",
      })
      .populate("createdBy", "name email")
      .sort({
        status: 1, // Active hotels first
        "rating.average": -1,
      });
  }

  // Also search for branches in the location and get their hotels (but only those belonging to current admin)
  let branchQuery = {};

  // For branches, still show those from inactive hotels but mark them appropriately
  if (city) {
    branchQuery["location.city"] = new RegExp(city, "i");
  }

  if (state) {
    branchQuery["location.state"] = new RegExp(state, "i");
  }

  let branches;

  // If coordinates are provided, use geospatial search for branches
  if (latitude && longitude) {
    branches = await Branch.find({
      ...branchQuery,
      "location.coordinates": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseFloat(radius) * 1000,
        },
      },
    })
      .populate({
        path: "hotel",
        select: "name hotelId mainLocation contactInfo rating status createdBy",
        match:
          req.admin.role !== "super_admin" ? { createdBy: req.admin._id } : {},
      })
      .sort({ "rating.average": -1 });
  } else {
    branches = await Branch.find(branchQuery)
      .populate({
        path: "hotel",
        select: "name hotelId mainLocation contactInfo rating status createdBy",
        match:
          req.admin.role !== "super_admin" ? { createdBy: req.admin._id } : {},
      })
      .sort({ "rating.average": -1 });
  }

  // Filter out branches whose hotels don't belong to current admin
  branches = branches.filter((branch) => branch.hotel !== null);

  // Combine results - hotels found by main location and hotels found through branches
  const hotelsMap = new Map();

  // Add hotels found by main location
  foundHotels.forEach((hotel) => {
    if (!hotelsMap.has(hotel.hotelId)) {
      hotelsMap.set(hotel.hotelId, {
        hotel: {
          _id: hotel._id,
          name: hotel.name,
          hotelId: hotel.hotelId,
          mainLocation: hotel.mainLocation,
          contactInfo: hotel.contactInfo,
          rating: hotel.rating,
          starRating: hotel.starRating,
          amenities: hotel.amenities,
          status: hotel.status,
          createdBy: hotel.createdBy,
        },
        branches: hotel.branches || [],
      });
    }
  });

  // Add hotels found through branches
  branches.forEach((branch) => {
    if (branch.hotel) {
      // Ensure hotel exists
      const hotelId = branch.hotel.hotelId;
      if (!hotelsMap.has(hotelId)) {
        hotelsMap.set(hotelId, {
          hotel: branch.hotel,
          branches: [],
        });
      }

      // Add this branch to the hotel's branches
      const hotelData = hotelsMap.get(hotelId);
      const branchExists = hotelData.branches.some(
        (b) => b._id.toString() === branch._id.toString()
      );

      if (!branchExists) {
        hotelData.branches.push({
          _id: branch._id,
          name: branch.name,
          branchId: branch.branchId,
          location: branch.location,
          contactInfo: branch.contactInfo,
          operatingHours: branch.operatingHours,
          rating: branch.rating,
          status: branch.status,
        });
      }
    }
  });

  const resultHotels = Array.from(hotelsMap.values());

  // Add service status to hotels
  const hotelsWithServiceStatus = resultHotels.map((hotelData) => ({
    ...hotelData,
    hotel: addServiceStatusToHotels([hotelData.hotel])[0],
    branches: hotelData.branches.map((branch) => ({
      ...branch,
      serviceStatus: {
        available:
          branch.status === "active" && hotelData.hotel.status === "active",
        message:
          branch.status === "active" && hotelData.hotel.status === "active"
            ? "Services available"
            : "No services provided by this branch",
        statusCode:
          branch.status === "active" && hotelData.hotel.status === "active"
            ? "ACTIVE"
            : "INACTIVE",
      },
    })),
  }));

  // Sort results to show active hotels first
  hotelsWithServiceStatus.sort((a, b) => {
    if (a.hotel.status === "active" && b.hotel.status !== "active") return -1;
    if (a.hotel.status !== "active" && b.hotel.status === "active") return 1;
    return b.hotel.rating.average - a.hotel.rating.average;
  });

  // Categorize for insights
  const statusBreakdown = categorizeHotelsByStatus(
    resultHotels.map((h) => h.hotel)
  );

  // Pagination
  const skip = (page - 1) * limit;
  const paginatedHotels = hotelsWithServiceStatus.slice(
    skip,
    skip + parseInt(limit)
  );

  res.status(200).json(
    new APIResponse(
      200,
      {
        hotels: paginatedHotels,
        statusBreakdown,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(hotelsWithServiceStatus.length / limit),
          totalHotels: hotelsWithServiceStatus.length,
          hasNextPage: page < Math.ceil(hotelsWithServiceStatus.length / limit),
          hasPrevPage: page > 1,
        },
      },
      "Hotels found in the specified location"
    )
  );
});
