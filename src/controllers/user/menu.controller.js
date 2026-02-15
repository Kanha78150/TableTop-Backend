import userMenuService from "../../services/userMenu.service.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import Joi from "joi";

class UserMenuController {
  /**
   * Get all food categories for users
   */
  async getCategories(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = "displayOrder",
        sortOrder = "asc",
        hotel,
        branch,
        search,
        type,
      } = req.query;

      // Validate query parameters
      const querySchema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(50).default(20),
        sortBy: Joi.string()
          .valid("name", "displayOrder", "createdAt")
          .default("displayOrder"),
        sortOrder: Joi.string().valid("asc", "desc").default("asc"),
        hotel: Joi.string().optional(),
        branch: Joi.string().optional(),
        search: Joi.string().optional(),
        type: Joi.string().valid("veg", "non-veg", "both").optional(),
      });

      const { error, value } = querySchema.validate({
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder,
        hotel,
        branch,
        search,
        type,
      });

      if (error) {
        return next(new APIError(error.details[0].message, 400));
      }

      const { page: validPage, limit: validLimit, ...otherParams } = value;
      const filters = {};
      const pagination = {
        page: validPage,
        limit: validLimit,
        sortBy,
        sortOrder,
      };

      // Add filters
      if (hotel) filters.hotel = hotel;
      if (branch) filters.branch = branch;
      if (search) filters.search = search;
      if (type) filters.type = type;

      const result = await userMenuService.getCategories(filters, pagination);

      return res
        .status(200)
        .json(
          new APIResponse(200, result, "Food categories fetched successfully")
        );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get category by ID
   */
  async getCategoryById(req, res, next) {
    try {
      const { categoryId } = req.params;

      if (!categoryId) {
        return next(new APIError(400, "Category ID is required"));
      }

      const category = await userMenuService.getCategoryById(categoryId);

      return res
        .status(200)
        .json(new APIResponse(200, category, "Category fetched successfully"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all food items for users
   */
  async getFoodItems(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = "displayOrder",
        sortOrder = "asc",
        hotel,
        branch,
        category,
        foodType,
        search,
        minPrice,
        maxPrice,
        isRecommended,
        isBestSeller,
        spiceLevel,
      } = req.query;

      // Validate query parameters
      const querySchema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(50).default(20),
        sortBy: Joi.string()
          .valid("name", "price", "displayOrder", "averageRating", "createdAt")
          .default("displayOrder"),
        sortOrder: Joi.string().valid("asc", "desc").default("asc"),
        hotel: Joi.string().optional(),
        branch: Joi.string().optional(),
        category: Joi.string().optional(),
        foodType: Joi.string()
          .valid("veg", "non-veg", "vegan", "jain")
          .optional(),
        search: Joi.string().optional(),
        minPrice: Joi.number().min(0).optional(),
        maxPrice: Joi.number().min(0).optional(),
        isRecommended: Joi.boolean().optional(),
        isBestSeller: Joi.boolean().optional(),
        spiceLevel: Joi.string()
          .valid("mild", "medium", "hot", "extra-hot", "none")
          .optional(),
      });

      const { error, value } = querySchema.validate({
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder,
        hotel,
        branch,
        category,
        foodType,
        search,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        isRecommended:
          isRecommended !== undefined ? isRecommended === "true" : undefined,
        isBestSeller:
          isBestSeller !== undefined ? isBestSeller === "true" : undefined,
        spiceLevel,
      });

      if (error) {
        return next(new APIError(error.details[0].message, 400));
      }

      const {
        page: validPage,
        limit: validLimit,
        minPrice: min,
        maxPrice: max,
        ...otherParams
      } = value;
      const filters = {};
      const pagination = {
        page: validPage,
        limit: validLimit,
        sortBy,
        sortOrder,
      };

      // Add filters
      Object.keys(otherParams).forEach((key) => {
        if (otherParams[key] !== undefined) {
          filters[key] = otherParams[key];
        }
      });

      // Add price range filter
      if (min !== undefined || max !== undefined) {
        filters.priceRange = {};
        if (min !== undefined) filters.priceRange.min = min;
        if (max !== undefined) filters.priceRange.max = max;
      }

      const result = await userMenuService.getFoodItems(filters, pagination);

      return res
        .status(200)
        .json(new APIResponse(200, result, "Food items fetched successfully"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get food item by ID
   */
  async getFoodItemById(req, res, next) {
    try {
      const { itemId } = req.params;

      if (!itemId) {
        return next(new APIError(400, "Item ID is required"));
      }

      const item = await userMenuService.getFoodItemById(itemId);

      return res
        .status(200)
        .json(new APIResponse(200, item, "Food item fetched successfully"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get food items by category
   */
  async getItemsByCategory(req, res, next) {
    try {
      const { categoryId } = req.params;
      const {
        page = 1,
        limit = 20,
        sortBy = "displayOrder",
        sortOrder = "asc",
        foodType,
        search,
        minPrice,
        maxPrice,
        spiceLevel,
      } = req.query;

      if (!categoryId) {
        return next(new APIError(400, "Category ID is required"));
      }

      // Validate query parameters
      const querySchema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(50).default(20),
        sortBy: Joi.string()
          .valid("name", "price", "displayOrder", "averageRating")
          .default("displayOrder"),
        sortOrder: Joi.string().valid("asc", "desc").default("asc"),
        foodType: Joi.string()
          .valid("veg", "non-veg", "vegan", "jain")
          .optional(),
        search: Joi.string().optional(),
        minPrice: Joi.number().min(0).optional(),
        maxPrice: Joi.number().min(0).optional(),
        spiceLevel: Joi.string()
          .valid("mild", "medium", "hot", "extra-hot", "none")
          .optional(),
      });

      const { error, value } = querySchema.validate({
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder,
        foodType,
        search,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        spiceLevel,
      });

      if (error) {
        return next(new APIError(error.details[0].message, 400));
      }

      const {
        page: validPage,
        limit: validLimit,
        minPrice: min,
        maxPrice: max,
        ...otherParams
      } = value;
      const filters = {};
      const pagination = {
        page: validPage,
        limit: validLimit,
        sortBy,
        sortOrder,
      };

      // Add filters
      Object.keys(otherParams).forEach((key) => {
        if (otherParams[key] !== undefined) {
          filters[key] = otherParams[key];
        }
      });

      // Add price range filter
      if (min !== undefined || max !== undefined) {
        filters.priceRange = {};
        if (min !== undefined) filters.priceRange.min = min;
        if (max !== undefined) filters.priceRange.max = max;
      }

      const result = await userMenuService.getItemsByCategory(
        categoryId,
        filters,
        pagination
      );

      return res
        .status(200)
        .json(
          new APIResponse(200, result, "Category items fetched successfully")
        );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get featured/recommended items
   */
  async getFeaturedItems(req, res, next) {
    try {
      const { limit = 10, hotel, branch, foodType } = req.query;

      const filters = {};
      const pagination = {
        page: 1,
        limit: parseInt(limit),
        sortBy: "averageRating",
        sortOrder: "desc",
      };

      if (hotel) filters.hotel = hotel;
      if (branch) filters.branch = branch;
      if (foodType) filters.foodType = foodType;

      const result = await userMenuService.getFeaturedItems(
        filters,
        pagination
      );

      return res
        .status(200)
        .json(
          new APIResponse(200, result, "Featured items fetched successfully")
        );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search menu items and categories
   */
  async searchMenu(req, res, next) {
    try {
      const {
        q: searchTerm,
        page = 1,
        limit = 20,
        hotel,
        branch,
        foodType,
      } = req.query;

      if (!searchTerm || searchTerm.trim().length === 0) {
        return next(new APIError(400, "Search term is required"));
      }

      const filters = {};
      const pagination = { page: parseInt(page), limit: parseInt(limit) };

      if (hotel) filters.hotel = hotel;
      if (branch) filters.branch = branch;
      if (foodType) filters.foodType = foodType;

      const result = await userMenuService.searchMenuItems(
        searchTerm,
        filters,
        pagination
      );

      return res
        .status(200)
        .json(
          new APIResponse(200, result, "Search results fetched successfully")
        );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get menu for a specific location (hotel/branch)
   * Used for users browsing menu after QR scan
   */
  async getMenuForLocation(req, res, next) {
    try {
      const { hotelId, branchId } = req.params;
      const {
        categoryFilter,
        category, // Support both 'category' and 'categoryFilter'
        foodType,
        minPrice,
        maxPrice,
        isRecommended,
        isBestSeller,
        spiceLevel,
        search,
        sortBy = "displayOrder",
        sortOrder = "asc",
      } = req.query;

      // Validate required parameters
      if (!hotelId) {
        return next(new APIError(400, "Hotel ID is required"));
      }

      // Validate query parameters
      const querySchema = Joi.object({
        categoryFilter: Joi.string().optional(),
        category: Joi.string().optional(), // Support both parameter names
        foodType: Joi.string()
          .valid("veg", "non-veg", "vegan", "jain")
          .optional(),
        minPrice: Joi.number().min(0).optional(),
        maxPrice: Joi.number().min(0).optional(),
        isRecommended: Joi.boolean().optional(),
        isBestSeller: Joi.boolean().optional(),
        spiceLevel: Joi.string()
          .valid("mild", "medium", "hot", "extra-hot", "none")
          .optional(),
        search: Joi.string().optional(),
        sortBy: Joi.string()
          .valid("name", "price", "displayOrder", "averageRating", "createdAt")
          .default("displayOrder"),
        sortOrder: Joi.string().valid("asc", "desc").default("asc"),
      });

      const { error, value } = querySchema.validate({
        categoryFilter,
        category,
        foodType,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        isRecommended:
          isRecommended !== undefined ? isRecommended === "true" : undefined,
        isBestSeller:
          isBestSeller !== undefined ? isBestSeller === "true" : undefined,
        spiceLevel,
        search,
        sortBy,
        sortOrder,
      });

      if (error) {
        return next(new APIError(error.details[0].message, 400));
      }

      const {
        minPrice: min,
        maxPrice: max,
        category: cat,
        categoryFilter: catFilter,
        ...otherParams
      } = value;
      const filters = {};

      // Add filters
      Object.keys(otherParams).forEach((key) => {
        if (otherParams[key] !== undefined) {
          filters[key] = otherParams[key];
        }
      });

      // Handle category filter (prefer 'category' over 'categoryFilter')
      if (cat) {
        filters.category = cat;
      } else if (catFilter) {
        filters.category = catFilter;
      }

      // Add price range filter
      if (min !== undefined || max !== undefined) {
        filters.priceRange = {};
        if (min !== undefined) filters.priceRange.min = min;
        if (max !== undefined) filters.priceRange.max = max;
      }

      const result = await userMenuService.getMenuForLocation(
        hotelId,
        branchId,
        filters
      );

      return res
        .status(200)
        .json(
          new APIResponse(200, result, "Location menu fetched successfully")
        );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get food categories for a specific scanned hotel/branch
   * Optimized for QR code scanning scenarios
   */
  async getCategoriesForScannedHotel(req, res, next) {
    try {
      const { hotelId, branchId } = req.params;
      const {
        foodType,
        search,
        sortBy = "displayOrder",
        sortOrder = "asc",
      } = req.query;

      // Validate required parameters
      if (!hotelId) {
        return next(new APIError(400, "Hotel ID is required"));
      }

      // Validate query parameters
      const querySchema = Joi.object({
        foodType: Joi.string()
          .valid("veg", "non-veg", "vegan", "jain")
          .optional(),
        search: Joi.string().optional(),
        sortBy: Joi.string()
          .valid("name", "displayOrder", "createdAt")
          .default("displayOrder"),
        sortOrder: Joi.string().valid("asc", "desc").default("asc"),
      });

      const { error, value } = querySchema.validate({
        foodType,
        search,
        sortBy,
        sortOrder,
      });

      if (error) {
        return next(new APIError(error.details[0].message, 400));
      }

      // Build filters for the service
      const filters = {
        hotel: hotelId,
        isActive: true,
      };

      if (branchId && branchId !== "null" && branchId !== "undefined") {
        filters.branch = branchId;
      }

      if (value.search) {
        filters.search = value.search;
      }

      // If foodType filter is provided, we need to get categories that have items of that food type
      if (value.foodType) {
        // Get categories that have food items of the specified type
        const categoriesWithItems =
          await userMenuService.getCategoriesWithFoodType(
            hotelId,
            branchId,
            value.foodType,
            {
              search: value.search,
              sortBy: value.sortBy,
              sortOrder: value.sortOrder,
            }
          );

        return res
          .status(200)
          .json(
            new APIResponse(
              200,
              categoriesWithItems,
              "Hotel categories fetched successfully"
            )
          );
      }

      // Get all categories for the hotel/branch
      const pagination = {
        page: 1,
        limit: 50, // Get more categories for scanned hotel view
        sortBy: value.sortBy,
        sortOrder: value.sortOrder,
      };

      const result = await userMenuService.getCategories(filters, pagination);

      // Add additional info for scanned hotel context
      const enhancedResult = {
        ...result,
        hotelId,
        branchId: branchId || null,
        scannedAt: new Date().toISOString(),
      };

      return res
        .status(200)
        .json(
          new APIResponse(
            200,
            enhancedResult,
            "Hotel categories fetched successfully"
          )
        );
    } catch (error) {
      next(error);
    }
  }
}

export default new UserMenuController();
