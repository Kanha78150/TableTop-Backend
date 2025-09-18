import {
  Hotel,
  validateHotel,
  validateUpdateHotel,
} from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";

// Create a new hotel
export const createHotel = async (req, res, next) => {
  try {
    const { error } = validateHotel(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    // Check if hotel with same email already exists
    const existingEmail = await Hotel.findOne({
      "contactInfo.email": req.body.contactInfo.email,
    });
    if (existingEmail) {
      return next(new APIError(400, "Hotel with this email already exists"));
    }

    const hotel = new Hotel(req.body);
    await hotel.save();

    res
      .status(201)
      .json(new APIResponse(201, hotel, "Hotel created successfully"));
  } catch (error) {
    next(error);
  }
};

// Get all hotels with optional filtering
export const getAllHotels = async (req, res, next) => {
  try {
    const {
      city,
      state,
      status = "active",
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { status };

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
      });

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

// Get hotel by ID with its branches
export const getHotelById = async (req, res, next) => {
  try {
    const { hotelId } = req.params;

    const hotel = await Hotel.findOne({ hotelId }).populate({
      path: "branches",
      match: { status: "active" },
      select: "name location contactInfo operatingHours capacity rating",
    });

    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    res
      .status(200)
      .json(new APIResponse(200, hotel, "Hotel retrieved successfully"));
  } catch (error) {
    next(error);
  }
};

// Get hotel branches by location
export const getHotelBranchesByLocation = async (req, res, next) => {
  try {
    const { hotelId } = req.params;
    const {
      city,
      state,
      pincode,
      latitude,
      longitude,
      radius = 10,
    } = req.query;

    // First check if hotel exists
    const hotel = await Hotel.findOne({ hotelId });
    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
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
  } catch (error) {
    next(error);
  }
};

// Update hotel
export const updateHotel = async (req, res, next) => {
  try {
    const { hotelId } = req.params;

    const { error } = validateUpdateHotel(req.body);
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    const hotel = await Hotel.findOneAndUpdate({ hotelId }, req.body, {
      new: true,
      runValidators: true,
    });

    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    res
      .status(200)
      .json(new APIResponse(200, hotel, "Hotel updated successfully"));
  } catch (error) {
    next(error);
  }
};

// Delete hotel (hard delete - permanently removes from database)
export const deleteHotel = async (req, res, next) => {
  try {
    const { hotelId } = req.params;

    const hotel = await Hotel.findOneAndDelete({ hotelId });

    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    // Also permanently delete all branches of this hotel
    await Branch.deleteMany({ hotel: hotel._id });

    res
      .status(200)
      .json(
        new APIResponse(200, null, "Hotel permanently deleted successfully")
      );
  } catch (error) {
    next(error);
  }
};

// Soft delete function (if you want to keep both options)
export const deactivateHotel = async (req, res, next) => {
  try {
    const { hotelId } = req.params;

    const hotel = await Hotel.findOneAndUpdate(
      { hotelId },
      { status: "inactive" },
      { new: true }
    );

    if (!hotel) {
      return next(new APIError(404, "Hotel not found"));
    }

    // Also deactivate all branches of this hotel
    await Branch.updateMany({ hotel: hotel._id }, { status: "inactive" });

    res
      .status(200)
      .json(new APIResponse(200, null, "Hotel deactivated successfully"));
  } catch (error) {
    next(error);
  }
};

// Simple search hotels by city/state (for /hotels/search endpoint)
export const searchHotels = async (req, res, next) => {
  try {
    const { city, state, name, page = 1, limit = 10 } = req.query;

    if (!city && !state && !name) {
      return next(
        new APIError(
          400,
          "Please provide city, state, or name for hotel search"
        )
      );
    }

    let query = { status: "active" };

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

    console.log("🔍 Hotel search query:", JSON.stringify(query, null, 2));

    const skip = (page - 1) * limit;

    const hotels = await Hotel.find(query)
      .populate({
        path: "branches",
        match: { status: "active" },
        select: "name branchId location contactInfo operatingHours rating",
      })
      .sort({ "rating.average": -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalHotels = await Hotel.countDocuments(query);

    console.log(`✅ Found ${hotels.length} hotels matching criteria`);

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
        `Found ${totalHotels} hotels matching your search criteria`
      )
    );
  } catch (error) {
    console.error("❌ Hotel search error:", error);
    next(error);
  }
};

// Search hotels by location and get their active branches
export const searchHotelsByLocation = async (req, res, next) => {
  try {
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

    // Search for hotels by their main location
    let hotelQuery = { status: "active" };

    if (city) {
      hotelQuery["mainLocation.city"] = new RegExp(city, "i");
    }

    if (state) {
      hotelQuery["mainLocation.state"] = new RegExp(state, "i");
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
          match: { status: "active" },
          select: "name branchId location contactInfo operatingHours rating",
        })
        .sort({ "rating.average": -1 });
    } else {
      foundHotels = await Hotel.find(hotelQuery)
        .populate({
          path: "branches",
          match: { status: "active" },
          select: "name branchId location contactInfo operatingHours rating",
        })
        .sort({ "rating.average": -1 });
    }

    // Also search for branches in the location and get their hotels
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
        .populate("hotel", "name hotelId mainLocation contactInfo rating")
        .sort({ "rating.average": -1 });
    } else {
      branches = await Branch.find(branchQuery)
        .populate("hotel", "name hotelId mainLocation contactInfo rating")
        .sort({ "rating.average": -1 });
    }

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
          },
          branches: hotel.branches || [],
        });
      }
    });

    // Add hotels found through branches
    branches.forEach((branch) => {
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
        });
      }
    });

    const resultHotels = Array.from(hotelsMap.values());

    // Pagination
    const skip = (page - 1) * limit;
    const paginatedHotels = resultHotels.slice(skip, skip + parseInt(limit));

    res.status(200).json(
      new APIResponse(
        200,
        {
          hotels: paginatedHotels,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(resultHotels.length / limit),
            totalHotels: resultHotels.length,
            hasNextPage: page < Math.ceil(resultHotels.length / limit),
            hasPrevPage: page > 1,
          },
        },
        "Hotels found in the specified location"
      )
    );
  } catch (error) {
    next(error);
  }
};
