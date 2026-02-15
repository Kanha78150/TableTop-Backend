import { Hotel } from "../models/Hotel.model.js";
import { Branch } from "../models/Branch.model.js";
import { APIError } from "../utils/APIError.js";

// Hotel services
export const hotelService = {
  // Find hotels by location
  findHotelsByLocation: async (locationQuery, options = {}) => {
    const {
      page = 1,
      limit = 10,
      sortBy = "rating.average",
      sortOrder = "desc",
    } = options;

    const query = { status: "active", ...locationQuery };
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const hotels = await Hotel.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate({
        path: "branches",
        match: { status: "active" },
        select: "name branchId location rating",
      });

    const total = await Hotel.countDocuments(query);

    return {
      hotels,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  },

  // Get hotel with all its branches
  getHotelWithBranches: async (hotelId, branchFilters = {}) => {
    const hotel = await Hotel.findOne({ hotelId, status: "active" });
    if (!hotel) {
      throw new APIError(404, "Hotel not found");
    }

    const branchQuery = {
      hotel: hotel._id,
      status: "active",
      ...branchFilters,
    };

    const branches = await Branch.find(branchQuery).sort({
      "rating.average": -1,
    });

    return {
      ...hotel.toObject(),
      branches,
    };
  },

  // Check if hotel exists and is active
  validateHotelExists: async (hotelId) => {
    const hotel = await Hotel.findOne({ hotelId, status: "active" });
    if (!hotel) {
      throw new APIError(404, "Hotel not found or inactive");
    }
    return hotel;
  },
};

// Branch services
export const branchService = {
  // Find branches by location with geospatial search
  findBranchesByLocation: async (locationQuery, options = {}) => {
    const {
      page = 1,
      limit = 10,
      sortBy = "rating.average",
      sortOrder = "desc",
      latitude,
      longitude,
      radius = 25,
    } = options;

    const query = { status: "active", ...locationQuery };
    let branches;

    if (latitude && longitude) {
      // Geospatial search
      branches = await Branch.find({
        ...query,
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
        .populate("hotel", "name hotelId description rating")
        .sort({ "rating.average": -1 })
        .limit(parseInt(limit));
    } else {
      // Regular search with pagination
      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      branches = await Branch.find(query)
        .populate("hotel", "name hotelId description rating")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));
    }

    const total = await Branch.countDocuments(query);

    return {
      branches,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  },

  // Get branches for a specific hotel
  getHotelBranches: async (hotelId, filters = {}, options = {}) => {
    const hotel = await hotelService.validateHotelExists(hotelId);

    const query = {
      hotel: hotel._id,
      status: "active",
      ...filters,
    };

    const { page = 1, limit = 10, latitude, longitude, radius = 25 } = options;

    let branches;

    if (latitude && longitude) {
      branches = await Branch.find({
        ...query,
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
        .sort({ "rating.average": -1 })
        .limit(parseInt(limit));
    } else {
      const skip = (page - 1) * limit;
      branches = await Branch.find(query)
        .sort({ "rating.average": -1 })
        .skip(skip)
        .limit(parseInt(limit));
    }

    const total = await Branch.countDocuments(query);

    return {
      hotel: {
        name: hotel.name,
        hotelId: hotel.hotelId,
        description: hotel.description,
      },
      branches,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  },

  // Group branches by hotels for location search
  groupBranchesByHotels: async (locationQuery, options = {}) => {
    const { branches } = await branchService.findBranchesByLocation(
      locationQuery,
      { ...options, limit: 100 } // Get more branches for grouping
    );

    // Group by hotel
    const hotelsMap = new Map();

    branches.forEach((branch) => {
      if (branch.hotel) {
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
        });
      }
    });

    const hotels = Array.from(hotelsMap.values());

    // Apply pagination to grouped results
    const { page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;
    const paginatedHotels = hotels.slice(skip, skip + parseInt(limit));

    return {
      hotels: paginatedHotels,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(hotels.length / limit),
        total: hotels.length,
        hasNextPage: page < Math.ceil(hotels.length / limit),
        hasPrevPage: page > 1,
      },
    };
  },

  // Validate branch exists and is active
  validateBranchExists: async (branchId) => {
    const branch = await Branch.findOne({
      branchId,
      status: "active",
    }).populate("hotel", "name hotelId status");

    if (!branch || !branch.hotel || branch.hotel.status !== "active") {
      throw new APIError(404, "Branch not found or inactive");
    }

    return branch;
  },
};

// Utility functions for location-based queries
export const locationUtils = {
  // Build location query from request parameters
  buildLocationQuery: (params) => {
    const { city, state, pincode } = params;
    const query = {};

    if (city) {
      query["location.city"] = new RegExp(city, "i");
    }

    if (state) {
      query["location.state"] = new RegExp(state, "i");
    }

    if (pincode) {
      query["location.pincode"] = pincode;
    }

    return query;
  },

  // Build hotel location query
  buildHotelLocationQuery: (params) => {
    const { city, state } = params;
    const query = {};

    if (city) {
      query["mainLocation.city"] = new RegExp(city, "i");
    }

    if (state) {
      query["mainLocation.state"] = new RegExp(state, "i");
    }

    return query;
  },

  // Validate coordinates
  validateCoordinates: (latitude, longitude) => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      throw new APIError(400, "Invalid coordinates provided");
    }

    if (lat < -90 || lat > 90) {
      throw new APIError(400, "Latitude must be between -90 and 90");
    }

    if (lng < -180 || lng > 180) {
      throw new APIError(400, "Longitude must be between -180 and 180");
    }

    return { lat, lng };
  },
};
