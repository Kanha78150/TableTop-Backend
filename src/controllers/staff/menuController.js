// src/controllers/staff/menuController.js - Staff Menu Controller
import mongoose from "mongoose";
import { FoodCategory } from "../../models/FoodCategory.model.js";
import { FoodItem } from "../../models/FoodItem.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import Joi from "joi";

/**
 * Get all food categories for staff's branch
 * GET /api/v1/staff/menu/categories
 * @access Staff
 */
export const getFoodCategories = async (req, res, next) => {
  try {
    const staffId = req.user._id;
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = "displayOrder",
      sortOrder = "asc",
      type,
    } = req.query;

    // Validate query parameters
    const querySchema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      search: Joi.string().optional(),
      sortBy: Joi.string()
        .valid("name", "displayOrder", "createdAt")
        .default("displayOrder"),
      sortOrder: Joi.string().valid("asc", "desc").default("asc"),
      type: Joi.string().valid("veg", "non-veg", "both").optional(),
    });

    const { error } = querySchema.validate(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Check if staff has hotel assignment
    if (!req.user.hotel) {
      return next(new APIError(400, "Staff user does not have a hotel assigned"));
    }

    // Extract the hotel ID (handle both populated and non-populated cases)
    const hotelId = req.user.hotel._id || req.user.hotel;
    const branchId = req.user.branch ? (req.user.branch._id || req.user.branch) : null;

    // Build query - staff can only see categories from their assigned branch/hotel
    const query = {
      hotel: hotelId,
    };

    // Only filter by branch if staff has a specific branch assigned
    if (branchId) {
      query.branch = branchId;
    }

    if (search) {
      query.name = new RegExp(search, "i");
    }

    if (type) {
      query.type = type;
    }

    // Calculate pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Build sort criteria
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Get categories
    const [categories, totalCount] = await Promise.all([
      FoodCategory.find(query)
        .populate("branch", "name branchId location")
        .populate("hotel", "name hotelId")
        .sort(sort)
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      FoodCategory.countDocuments(query),
    ]);

    // Get item counts for each category
    const categoriesWithItemCount = await Promise.all(
      categories.map(async (category) => {
        const itemCount = await FoodItem.countDocuments({
          category: category._id,
        });
        return {
          ...category,
          itemCount,
        };
      })
    );

    const totalPages = Math.ceil(totalCount / limitNumber);

    res.status(200).json(
      new APIResponse(
        200,
        {
          categories: categoriesWithItemCount,
          pagination: {
            total: totalCount,
            page: pageNumber,
            pages: totalPages,
            limit: limitNumber,
            hasMore: pageNumber < totalPages,
          },
        },
        "Food categories retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting food categories for staff:", error);
    next(error);
  }
};

/**
 * Get specific food category details
 * GET /api/v1/staff/menu/categories/:categoryId
 * @access Staff
 */
export const getCategoryById = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      return next(new APIError(400, "Category ID is required"));
    }

    // Check if staff has hotel assignment
    if (!req.user.hotel) {
      return next(new APIError(400, "Staff user does not have a hotel assigned"));
    }

    // Extract the hotel ID (handle both populated and non-populated cases)
    const hotelId = req.user.hotel._id || req.user.hotel;
    const branchId = req.user.branch ? (req.user.branch._id || req.user.branch) : null;

    // Build query - staff can only see categories from their assigned branch/hotel
    const query = {
      _id: categoryId,
      hotel: hotelId,
    };

    // Only filter by branch if staff has a specific branch assigned
    if (branchId) {
      query.branch = branchId;
    }

    const category = await FoodCategory.findOne(query)
      .populate("branch", "name branchId location")
      .populate("hotel", "name hotelId");

    if (!category) {
      return next(
        new APIError(404, "Category not found or not accessible to you")
      );
    }

    // Get item count for this category
    const itemCount = await FoodItem.countDocuments({
      category: categoryId,
    });

    res.status(200).json(
      new APIResponse(
        200,
        {
          category: {
            ...category.toObject(),
            itemCount,
          },
        },
        "Category retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting category details for staff:", error);
    next(error);
  }
};

/**
 * Get all food items for staff's branch
 * GET /api/v1/staff/menu/items
 * @access Staff
 */
export const getFoodItems = async (req, res, next) => {
  try {
    const staffId = req.user._id;
    const {
      page = 1,
      limit = 20,
      search,
      categoryId,
      isAvailable,
      foodType,
      sortBy = "displayOrder",
      sortOrder = "asc",
      spiceLevel,
      minPrice,
      maxPrice,
    } = req.query;

    // Validate query parameters
    const querySchema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      search: Joi.string().optional(),
      categoryId: Joi.string().optional(),
      isAvailable: Joi.boolean().optional(),
      foodType: Joi.string().valid("veg", "non-veg", "vegan").optional(),
      sortBy: Joi.string()
        .valid("name", "price", "displayOrder", "createdAt")
        .default("displayOrder"),
      sortOrder: Joi.string().valid("asc", "desc").default("asc"),
      spiceLevel: Joi.string().valid("mild", "medium", "hot", "extra-hot").optional(),
      minPrice: Joi.number().min(0).optional(),
      maxPrice: Joi.number().min(0).optional(),
    });

    const { error } = querySchema.validate(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Check if staff has hotel assignment
    if (!req.user.hotel) {
      return next(new APIError(400, "Staff user does not have a hotel assigned"));
    }

    // Extract the hotel ID (handle both populated and non-populated cases)
    const hotelId = req.user.hotel._id || req.user.hotel;
    const branchId = req.user.branch ? (req.user.branch._id || req.user.branch) : null;

    // Build query - staff can only see items from their assigned branch/hotel
    const query = {
      hotel: hotelId,
    };

    if (branchId) {
      query.branch = branchId;
    }

    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
      ];
    }

    if (categoryId) {
      // Handle Mixed type category field - match ObjectId and string formats
      if (mongoose.Types.ObjectId.isValid(categoryId)) {
        if (!query.$or) {
          query.$or = [];
        }
        const categoryCondition = {
          $or: [
            { category: new mongoose.Types.ObjectId(categoryId) },
            { category: categoryId },
            { category: categoryId.toString() }
          ]
        };
        // If there's already an $or (from search), we need to combine differently
        if (query.$or.length > 0) {
          // Move existing $or conditions into $and with new category condition
          const existingOr = query.$or;
          delete query.$or;
          query.$and = [
            { $or: existingOr },
            categoryCondition
          ];
        } else {
          query.$or = categoryCondition.$or;
        }
      } else {
        query.category = categoryId;
      }
    }

    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === "true" || isAvailable === true;
    }

    if (foodType) {
      query.foodType = foodType;
    }

    if (spiceLevel) {
      query.spiceLevel = spiceLevel;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined) {
        query.price.$gte = parseFloat(minPrice);
      }
      if (maxPrice !== undefined) {
        query.price.$lte = parseFloat(maxPrice);
      }
    }

    // Calculate pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Build sort criteria
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Get food items
    const [foodItems, totalCount] = await Promise.all([
      FoodItem.find(query)
        .populate("category", "name type")
        .populate("branch", "name branchId location")
        .populate("hotel", "name hotelId")
        .sort(sort)
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      FoodItem.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limitNumber);

    res.status(200).json(
      new APIResponse(
        200,
        {
          foodItems,
          pagination: {
            total: totalCount,
            page: pageNumber,
            pages: totalPages,
            limit: limitNumber,
            hasMore: pageNumber < totalPages,
          },
        },
        "Food items retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting food items for staff:", error);
    next(error);
  }
};

/**
 * Get specific food item details
 * GET /api/v1/staff/menu/items/:itemId
 * @access Staff
 */
export const getFoodItemById = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    if (!itemId) {
      return next(new APIError(400, "Item ID is required"));
    }

    // Check if staff has hotel assignment
    if (!req.user.hotel) {
      return next(new APIError(400, "Staff user does not have a hotel assigned"));
    }

    // Extract the hotel ID (handle both populated and non-populated cases)
    const hotelId = req.user.hotel._id || req.user.hotel;
    const branchId = req.user.branch ? (req.user.branch._id || req.user.branch) : null;

    // Build query - staff can only see items from their assigned branch/hotel
    const query = {
      _id: itemId,
      hotel: hotelId,
    };

    if (branchId) {
      query.branch = branchId;
    }

    const foodItem = await FoodItem.findOne(query)
      .populate("category", "name type description")
      .populate("branch", "name branchId location")
      .populate("hotel", "name hotelId");

    if (!foodItem) {
      return next(
        new APIError(404, "Food item not found or not accessible to you")
      );
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          foodItem,
        },
        "Food item retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting food item details for staff:", error);
    next(error);
  }
};

/**
 * Get food items by category
 * GET /api/v1/staff/menu/categories/:categoryId/items
 * @access Staff
 */
export const getItemsByCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const {
      page = 1,
      limit = 20,
      sortBy = "displayOrder",
      sortOrder = "asc",
      isAvailable,
    } = req.query;

    if (!categoryId) {
      return next(new APIError(400, "Category ID is required"));
    }

    // Check if staff has hotel assignment
    if (!req.user.hotel) {
      return next(new APIError(400, "Staff user does not have a hotel assigned"));
    }

    // Extract the hotel ID (handle both populated and non-populated cases)
    const hotelId = req.user.hotel._id || req.user.hotel;
    const branchId = req.user.branch ? (req.user.branch._id || req.user.branch) : null;

    // First verify the category exists and staff has access to it
    const categoryQuery = {
      _id: categoryId,
      hotel: hotelId,
    };

    // Only filter by branch if staff has a specific branch assigned
    if (branchId) {
      categoryQuery.branch = branchId;
    }

    const category = await FoodCategory.findOne(categoryQuery);

    if (!category) {
      return next(
        new APIError(404, "Category not found or not accessible to you")
      );
    }

    // Build query for food items
    // Since we already verified the category belongs to the staff's hotel/branch,
    // we only need to filter by category
    // Try matching both ObjectId and string formats since category field is Mixed type
    let query;
    
    // Check if categoryId is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(categoryId)) {
      query = {
        $or: [
          { category: new mongoose.Types.ObjectId(categoryId) },
          { category: categoryId },
          { category: categoryId.toString() }
        ]
      };
    } else {
      query = { category: categoryId };
    }

    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === "true" || isAvailable === true;
    }

    // Calculate pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Build sort criteria
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Get food items
    const [foodItems, totalCount] = await Promise.all([
      FoodItem.find(query)
        .populate("category", "name type")
        .populate("branch", "name branchId location")
        .sort(sort)
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      FoodItem.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limitNumber);

    res.status(200).json(
      new APIResponse(
        200,
        {
          category: {
            _id: category._id,
            name: category.name,
            description: category.description,
            type: category.type,
          },
          foodItems,
          pagination: {
            total: totalCount,
            page: pageNumber,
            pages: totalPages,
            limit: limitNumber,
            hasMore: pageNumber < totalPages,
          },
        },
        "Category items retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting items by category for staff:", error);
    next(error);
  }
};

/**
 * Search menu items
 * GET /api/v1/staff/menu/search
 * @access Staff
 */
export const searchMenuItems = async (req, res, next) => {
  try {
    const {
      query: searchQuery,
      page = 1,
      limit = 20,
      foodType,
      categoryId,
    } = req.query;

    if (!searchQuery || searchQuery.trim() === "") {
      return next(new APIError(400, "Search query is required"));
    }

    // Check if staff has hotel assignment
    if (!req.user.hotel) {
      return next(new APIError(400, "Staff user does not have a hotel assigned"));
    }

    // Extract the hotel ID (handle both populated and non-populated cases)
    const hotelId = req.user.hotel._id || req.user.hotel;
    const branchId = req.user.branch ? (req.user.branch._id || req.user.branch) : null;

    // Build base query for staff's branch/hotel
    const query = {
      hotel: hotelId,
      $or: [
        { name: new RegExp(searchQuery, "i") },
        { description: new RegExp(searchQuery, "i") },
      ],
    };

    if (branchId) {
      query.branch = branchId;
    }

    if (foodType) {
      query.foodType = foodType;
    }

    if (categoryId) {
      query.category = categoryId;
    }

    // Calculate pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Get food items
    const [foodItems, totalCount] = await Promise.all([
      FoodItem.find(query)
        .populate("category", "name type")
        .populate("branch", "name branchId")
        .sort({ displayOrder: 1, name: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      FoodItem.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limitNumber);

    res.status(200).json(
      new APIResponse(
        200,
        {
          searchQuery,
          foodItems,
          pagination: {
            total: totalCount,
            page: pageNumber,
            pages: totalPages,
            limit: limitNumber,
            hasMore: pageNumber < totalPages,
          },
        },
        "Search results retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error searching menu items for staff:", error);
    next(error);
  }
};

export default {
  getFoodCategories,
  getCategoryById,
  getFoodItems,
  getFoodItemById,
  getItemsByCategory,
  searchMenuItems,
};
