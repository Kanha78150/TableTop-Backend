import { Hotel } from "../../models/Hotel.model.js";
import {
  Branch,
  validateBranchLocationSearch,
} from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";

// Get all hotels for users
export const getHotels = async (req, res, next) => {
  try {
    const {
      city,
      state,
      page = 1,
      limit = 10,
      sortBy = "rating.average",
      sortOrder = "desc",
    } = req.query;

    const query = { status: "active" };

    if (city) {
      query["mainLocation.city"] = new RegExp(city, "i");
    }

    if (state) {
      query["mainLocation.state"] = new RegExp(state, "i");
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const hotels = await Hotel.find(query)
      .select(
        "name hotelId description mainLocation contactInfo images rating starRating amenities"
      )
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalHotels = await Hotel.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          hotels,
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
  } catch (error) {
    next(error);
  }
};

// Get hotel details with branches
export const getHotelDetails = async (req, res, next) => {
  try {
    const { hotelId } = req.params;

    const hotel = await Hotel.findOne({ hotelId, status: "active" })
      .select(
        "name hotelId description mainLocation contactInfo images rating starRating amenities establishedYear"
      )
      .populate({
        path: "branches",
        match: { status: "active" },
        select:
          "name branchId location contactInfo operatingHours capacity rating images amenities",
      });

    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    res
      .status(200)
      .json(
        new APIResponse(200, hotel, "Hotel details retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};

// Get hotel branches by location (for users)
export const getHotelBranchesByLocation = async (req, res, next) => {
  try {
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
    } = req.query;

    // First check if hotel exists and is active
    const hotel = await Hotel.findOne({ hotelId, status: "active" });
    if (!hotel) {
      return next(new APIError(404, "Hotel not found or inactive"));
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
          "name branchId location contactInfo operatingHours capacity rating images amenities"
        )
        .sort({ "rating.average": -1 })
        .limit(parseInt(limit));

      totalBranches = branches.length;
    } else {
      const skip = (page - 1) * limit;

      branches = await Branch.find(query)
        .select(
          "name branchId location contactInfo operatingHours capacity rating images amenities"
        )
        .sort({ "rating.average": -1 })
        .skip(skip)
        .limit(parseInt(limit));

      totalBranches = await Branch.countDocuments(query);
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          hotel: {
            name: hotel.name,
            hotelId: hotel.hotelId,
            description: hotel.description,
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

// Search hotels and branches by user location
export const searchNearbyHotels = async (req, res, next) => {
  try {
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
    } = req.query;

    if (!city && !state && !(latitude && longitude)) {
      return next(
        new APIError(
          400,
          "Please provide either city/state or latitude/longitude for location search"
        )
      );
    }

    let branchQuery = { status: "active" };

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
        .select("name branchId location contactInfo operatingHours rating")
        .populate({
          path: "hotel",
          match: { status: "active" },
          select:
            "name hotelId description mainLocation rating starRating images",
        })
        .sort({ "rating.average": -1 });
    } else {
      branches = await Branch.find(branchQuery)
        .select("name branchId location contactInfo operatingHours rating")
        .populate({
          path: "hotel",
          match: { status: "active" },
          select:
            "name hotelId description mainLocation rating starRating images",
        })
        .sort({ "rating.average": -1 });
    }

    // Filter out branches whose hotels are inactive
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
      });
    });

    const hotels = Array.from(hotelsMap.values());

    // Pagination
    const skip = (page - 1) * limit;
    const paginatedHotels = hotels.slice(skip, skip + parseInt(limit));

    res.status(200).json(
      new APIResponse(
        200,
        {
          hotels: paginatedHotels,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(hotels.length / limit),
            totalHotels: hotels.length,
            hasNextPage: page < Math.ceil(hotels.length / limit),
            hasPrevPage: page > 1,
          },
        },
        "Nearby hotels found successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

// Get branch details for users
export const getBranchDetails = async (req, res, next) => {
  try {
    const { branchId } = req.params;

    const branch = await Branch.findOne({ branchId, status: "active" })
      .select(
        "name branchId location contactInfo operatingHours capacity rating images amenities"
      )
      .populate({
        path: "hotel",
        match: { status: "active" },
        select: "name hotelId description mainLocation rating starRating",
      });

    if (!branch || !branch.hotel) {
      return next(new APIError(404, "Branch not found or inactive"));
    }

    res
      .status(200)
      .json(
        new APIResponse(200, branch, "Branch details retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};
