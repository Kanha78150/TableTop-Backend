import { Hotel } from "../../models/Hotel.model.js";
import {
  Branch,
  validateBranchLocationSearch,
} from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import {
  addServiceStatusToHotels,
  addServiceStatus,
  addBranchServiceStatus,
  categorizeHotelsByStatus,
} from "../../utils/hotelStatusHelper.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";

// Get all hotels for users
export const getHotels = asyncHandler(async (req, res) => {
  const {
    city,
    state,
    page = 1,
    limit = 10,
    sortBy = "rating.average",
    sortOrder = "desc",
    includeInactive = "true",
  } = req.query;

  let query = {};

  // Include inactive hotels in search results but show their status
  if (includeInactive === "false") {
    query.status = "active";
  } else {
    query.status = { $in: ["active", "inactive", "maintenance"] };
  }

  if (city) {
    query["mainLocation.city"] = new RegExp(city, "i");
  }

  if (state) {
    query["mainLocation.state"] = new RegExp(state, "i");
  }

  const skip = (page - 1) * limit;
  const sort = {
    status: 1, // Active hotels first
    [sortBy]: sortOrder === "desc" ? -1 : 1,
  };

  const hotels = await Hotel.find(query)
    .select(
      "name hotelId description mainLocation contactInfo images rating starRating amenities status"
    )
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const totalHotels = await Hotel.countDocuments(query);

  // Add service status information
  const hotelsWithServiceStatus = addServiceStatusToHotels(hotels);

  // Categorize hotels by status for better insights
  const statusBreakdown = categorizeHotelsByStatus(hotels);

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
      "Hotels retrieved successfully"
    )
  );
});

// Get hotel details with branches
export const getHotelDetails = asyncHandler(async (req, res, next) => {
  const { hotelId } = req.params;

  // Allow viewing details of inactive hotels too, but show status
  const hotel = await Hotel.findOne({ hotelId })
    .select(
      "name hotelId description mainLocation contactInfo images rating starRating amenities establishedYear status"
    )
    .populate({
      path: "branches",
      select:
        "name branchId location contactInfo operatingHours capacity rating images amenities status",
    });

  if (!hotel) {
    return next(new APIError(404, "Hotel not found"));
  }

  // Add service status information to hotel
  const hotelWithServiceStatus = addServiceStatus(hotel);

  // Add service status to branches
  const branchesWithServiceStatus = hotel.branches.map((branch) =>
    addBranchServiceStatus({
      ...branch.toObject(),
      hotel: { status: hotel.status },
    })
  );

  const response = {
    ...hotelWithServiceStatus,
    branches: branchesWithServiceStatus,
  };

  res
    .status(200)
    .json(
      new APIResponse(200, response, "Hotel details retrieved successfully")
    );
});

// Get hotel branches by location (for users)
export const getHotelBranchesByLocation = asyncHandler(
  async (req, res, next) => {
    const { hotelId } = req.params;
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
      radius = 25,
      page = 1,
      limit = 10,
      includeInactive = "true",
    } = req.query;

    // Show hotel even if inactive, but indicate service status
    const hotel = await Hotel.findOne({ hotelId });
    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    let query = {
      hotel: hotel._id,
    };

    // Include inactive branches but show their status
    if (includeInactive === "false") {
      query.status = "active";
    } else {
      query.status = { $in: ["active", "inactive", "maintenance"] };
    }

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
    let totalBranches;

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
        .select(
          "name branchId location contactInfo operatingHours capacity rating images amenities status"
        )
        .sort({
          status: 1, // Active branches first
          "rating.average": -1,
        })
        .limit(parseInt(limit));

      totalBranches = branches.length;
    } else {
      const skip = (page - 1) * limit;

      branches = await Branch.find(query)
        .select(
          "name branchId location contactInfo operatingHours capacity rating images amenities status"
        )
        .sort({
          status: 1, // Active branches first
          "rating.average": -1,
        })
        .skip(skip)
        .limit(parseInt(limit));

      totalBranches = await Branch.countDocuments(query);
    }

    // Add service status to hotel and branches
    const hotelWithServiceStatus = addServiceStatus(hotel);
    const branchesWithServiceStatus = branches.map((branch) =>
      addBranchServiceStatus({
        ...branch.toObject(),
        hotel: { status: hotel.status },
      })
    );

    res.status(200).json(
      new APIResponse(
        200,
        {
          hotel: {
            name: hotelWithServiceStatus.name,
            hotelId: hotelWithServiceStatus.hotelId,
            description: hotelWithServiceStatus.description,
            serviceStatus: hotelWithServiceStatus.serviceStatus,
          },
          branches: branchesWithServiceStatus,
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
  }
);

// Search hotels and branches by user location
export const searchNearbyHotels = asyncHandler(async (req, res, next) => {
  const { error } = validateBranchLocationSearch(req.query);
  if (error) {
    return next(new APIError(400, error.details[0].message));
  }

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

  let branchQuery = {};

  // Include inactive branches but show their status
  if (includeInactive === "false") {
    branchQuery.status = "active";
  } else {
    branchQuery.status = { $in: ["active", "inactive", "maintenance"] };
  }

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
      .select("name branchId location contactInfo operatingHours rating status")
      .populate({
        path: "hotel",
        select:
          "name hotelId description mainLocation rating starRating images status",
      })
      .sort({
        status: 1, // Active branches first
        "rating.average": -1,
      });
  } else {
    branches = await Branch.find(branchQuery)
      .select("name branchId location contactInfo operatingHours rating status")
      .populate({
        path: "hotel",
        select:
          "name hotelId description mainLocation rating starRating images status",
      })
      .sort({
        status: 1, // Active branches first
        "rating.average": -1,
      });
  }

  // Don't filter out branches whose hotels are inactive - show them with status
  branches = branches.filter((branch) => branch.hotel);

  // Group branches by hotel
  const hotelsMap = new Map();

  branches.forEach((branch) => {
    const hotelId = branch.hotel.hotelId;
    if (!hotelsMap.has(hotelId)) {
      hotelsMap.set(hotelId, {
        hotel: branch.hotel,
        branches: [],
      });
    }
    hotelsMap.get(hotelId).branches.push({
      _id: branch._id,
      name: branch.name,
      branchId: branch.branchId,
      location: branch.location,
      contactInfo: branch.contactInfo,
      operatingHours: branch.operatingHours,
      rating: branch.rating,
      status: branch.status,
    });
  });

  const hotels = Array.from(hotelsMap.values());

  // Add service status to hotels and branches
  const hotelsWithServiceStatus = hotels.map((hotelData) => ({
    hotel: addServiceStatus(hotelData.hotel),
    branches: hotelData.branches.map((branch) =>
      addBranchServiceStatus({
        ...branch,
        hotel: { status: hotelData.hotel.status },
      })
    ),
  }));

  // Sort hotels to show active ones first
  hotelsWithServiceStatus.sort((a, b) => {
    if (a.hotel.status === "active" && b.hotel.status !== "active") return -1;
    if (a.hotel.status !== "active" && b.hotel.status === "active") return 1;
    return b.hotel.rating.average - a.hotel.rating.average;
  });

  // Categorize for insights
  const statusBreakdown = categorizeHotelsByStatus(hotels.map((h) => h.hotel));

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
      "Nearby hotels found successfully"
    )
  );
});

// Get all branches (public – no authentication required)
export const getAllBranches = asyncHandler(async (req, res) => {
  const { city, state, status, page = 1, limit = 10 } = req.query;

  const filter = {};

  // Only show active branches by default
  filter.status = status || "active";

  if (city) filter["location.city"] = { $regex: city, $options: "i" };
  if (state) filter["location.state"] = { $regex: state, $options: "i" };

  const skip = (Number(page) - 1) * Number(limit);

  const [branches, totalBranches] = await Promise.all([
    Branch.find(filter)
      .select(
        "name branchId location contactInfo operatingHours capacity rating images amenities status"
      )
      .populate("hotel", "name hotelId logo")
      .sort({ "rating.average": -1, name: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Branch.countDocuments(filter),
  ]);

  return res.status(200).json(
    new APIResponse(
      200,
      {
        branches,
        totalBranches,
        page: Number(page),
        totalPages: Math.ceil(totalBranches / Number(limit)),
      },
      "Branches retrieved successfully"
    )
  );
});

// Get branch details for users
export const getBranchDetails = asyncHandler(async (req, res, next) => {
  const { branchId } = req.params;

  // Show branch details even if inactive, but indicate service status
  const branch = await Branch.findOne({ branchId })
    .select(
      "name branchId location contactInfo operatingHours capacity rating images amenities status"
    )
    .populate({
      path: "hotel",
      select: "name hotelId description mainLocation rating starRating status",
    });

  if (!branch || !branch.hotel) {
    return next(new APIError(404, "Branch not found"));
  }

  // Add service status information
  const branchWithServiceStatus = addBranchServiceStatus({
    ...branch.toObject(),
    hotel: branch.hotel,
  });

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        branchWithServiceStatus,
        "Branch details retrieved successfully"
      )
    );
});
