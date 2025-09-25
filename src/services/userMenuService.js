import { FoodCategory } from "../../src/models/FoodCategory.model.js";
import { FoodItem } from "../../src/models/FoodItem.model.js";
import { APIError } from "../utils/APIError.js";
import mongoose from "mongoose";

class UserMenuService {
  /**
   * Get all food categories for users
   * @param {Object} filters - Filter criteria
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Categories with pagination info
   */
  async getCategories(filters = {}, pagination = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = "displayOrder",
        sortOrder = "asc",
      } = pagination;

      const { hotel, branch, isActive = true, search, type } = filters;

      // Build query - only show active categories for users
      const query = { isActive };

      if (hotel) {
        query.hotel = hotel;
      }

      if (branch) {
        query.branch = branch;
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      if (type) {
        query.type = type;
      }

      const skip = (page - 1) * limit;
      const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const [categories, totalCount] = await Promise.all([
        FoodCategory.find(query)
          .populate("hotel", "name hotelId")
          .populate("branch", "name branchId")
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .select(
            "name categoryId description type image tags displayOrder availableTimings slug"
          )
          .lean(),
        FoodCategory.countDocuments(query),
      ]);

      // Get item counts for each category
      const categoriesWithItemCount = await Promise.all(
        categories.map(async (category) => {
          const itemCount = await FoodItem.countDocuments({
            category: category._id,
            isAvailable: true,
          });
          return {
            ...category,
            itemCount,
          };
        })
      );

      return {
        categories: categoriesWithItemCount,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page < Math.ceil(totalCount / limit),
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      throw new APIError(`Failed to fetch categories: ${error.message}`, 500);
    }
  }

  /**
   * Get category by ID for users
   * @param {String} categoryId - Category ID
   * @returns {Promise<Object>} Category details
   */
  async getCategoryById(categoryId) {
    try {
      let category;

      // Try to find by MongoDB ObjectId first, then by categoryId
      if (mongoose.Types.ObjectId.isValid(categoryId)) {
        category = await FoodCategory.findOne({
          _id: categoryId,
          isActive: true,
        });
      }

      if (!category) {
        category = await FoodCategory.findOne({
          categoryId: categoryId,
          isActive: true,
        });
      }

      if (!category) {
        throw new APIError("Category not found", 404);
      }

      // Populate related data
      await category.populate([
        { path: "hotel", select: "name hotelId" },
        { path: "branch", select: "name branchId" },
      ]);

      // Get available items count
      const itemCount = await FoodItem.countDocuments({
        category: category._id,
        isAvailable: true,
      });

      return {
        ...category.toObject(),
        itemCount,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`Failed to fetch category: ${error.message}`, 500);
    }
  }

  /**
   * Get all food items for users
   * @param {Object} filters - Filter criteria
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Food items with pagination info
   */
  async getFoodItems(filters = {}, pagination = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = "displayOrder",
        sortOrder = "asc",
      } = pagination;

      const {
        hotel,
        branch,
        category,
        isAvailable = true,
        foodType,
        search,
        priceRange,
        isRecommended,
        isBestSeller,
        spiceLevel,
      } = filters;

      // Build query - only show available items for users
      const query = { isAvailable };

      if (hotel) {
        query.hotel = hotel;
      }

      if (branch) {
        query.branch = branch;
      }

      if (category) {
        query.category = category;
      }

      if (foodType) {
        query.foodType = foodType;
      }

      if (isRecommended !== undefined) {
        query.isRecommended = isRecommended;
      }

      if (isBestSeller !== undefined) {
        query.isBestSeller = isBestSeller;
      }

      if (spiceLevel) {
        query.spiceLevel = spiceLevel;
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { shortDescription: { $regex: search, $options: "i" } },
          { tags: { $in: [new RegExp(search, "i")] } },
        ];
      }

      // Price range filter
      if (priceRange) {
        const { min, max } = priceRange;
        if (min !== undefined) query.price = { ...query.price, $gte: min };
        if (max !== undefined) query.price = { ...query.price, $lte: max };
      }

      const skip = (page - 1) * limit;
      const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const [items, totalCount] = await Promise.all([
        FoodItem.find(query)
          .populate("category", "name categoryId type")
          .populate("hotel", "name hotelId")
          .populate("branch", "name branchId")
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .select(
            `
            name itemId description shortDescription price discountPrice 
            foodType spiceLevel isRecommended isBestSeller image images
            preparationTime servingSize ingredients allergens tags
            nutritionalInfo averageRating totalReviews availableTimings
            displayOrder dietaryInfo
          `
          )
          .lean(),
        FoodItem.countDocuments(query),
      ]);

      // Add effective price and discount percentage
      const itemsWithCalculations = items.map((item) => ({
        ...item,
        effectivePrice: item.discountPrice || item.price,
        discountPercentage: item.discountPrice
          ? Math.round(((item.price - item.discountPrice) / item.price) * 100)
          : 0,
        hasDiscount: !!item.discountPrice && item.discountPrice < item.price,
      }));

      return {
        items: itemsWithCalculations,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page < Math.ceil(totalCount / limit),
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      throw new APIError(`Failed to fetch food items: ${error.message}`, 500);
    }
  }

  /**
   * Get food item by ID for users
   * @param {String} itemId - Item ID
   * @returns {Promise<Object>} Food item details
   */
  async getFoodItemById(itemId) {
    try {
      let item;

      // Try to find by MongoDB ObjectId first, then by itemId
      if (mongoose.Types.ObjectId.isValid(itemId)) {
        item = await FoodItem.findOne({
          _id: itemId,
          isAvailable: true,
        });
      }

      if (!item) {
        item = await FoodItem.findOne({
          itemId: itemId,
          isAvailable: true,
        });
      }

      if (!item) {
        throw new APIError("Food item not found", 404);
      }

      // Populate related data
      await item.populate([
        { path: "category", select: "name categoryId type description" },
        { path: "hotel", select: "name hotelId" },
        { path: "branch", select: "name branchId" },
      ]);

      const itemData = item.toObject();

      // Add calculated fields
      return {
        ...itemData,
        effectivePrice: item.discountPrice || item.price,
        discountPercentage: item.discountPrice
          ? Math.round(((item.price - item.discountPrice) / item.price) * 100)
          : 0,
        hasDiscount: !!item.discountPrice && item.discountPrice < item.price,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`Failed to fetch food item: ${error.message}`, 500);
    }
  }

  /**
   * Get food items by category for users
   * @param {String} categoryId - Category ID
   * @param {Object} filters - Additional filters
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Food items in category
   */
  async getItemsByCategory(categoryId, filters = {}, pagination = {}) {
    try {
      // First verify category exists and is active
      const category = await this.getCategoryById(categoryId);

      // Get items for this category
      const itemFilters = {
        ...filters,
        category: category._id,
      };

      const result = await this.getFoodItems(itemFilters, pagination);

      return {
        category: {
          _id: category._id,
          name: category.name,
          categoryId: category.categoryId,
          description: category.description,
          type: category.type,
          image: category.image,
        },
        ...result,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(
        `Failed to fetch items by category: ${error.message}`,
        500
      );
    }
  }

  /**
   * Get featured/recommended items for users
   * @param {Object} filters - Filter criteria
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Featured items
   */
  async getFeaturedItems(filters = {}, pagination = { limit: 10 }) {
    try {
      const featuredFilters = {
        ...filters,
        $or: [{ isRecommended: true }, { isBestSeller: true }],
      };

      return await this.getFoodItems(featuredFilters, {
        ...pagination,
        sortBy: "averageRating",
        sortOrder: "desc",
      });
    } catch (error) {
      throw new APIError(
        `Failed to fetch featured items: ${error.message}`,
        500
      );
    }
  }

  /**
   * Search menu items for users
   * @param {String} searchTerm - Search term
   * @param {Object} filters - Additional filters
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Search results
   */
  async searchMenuItems(searchTerm, filters = {}, pagination = {}) {
    try {
      if (!searchTerm || searchTerm.trim().length === 0) {
        throw new APIError("Search term is required", 400);
      }

      const searchFilters = {
        ...filters,
        search: searchTerm.trim(),
      };

      // Also search in categories
      const [itemResults, categoryResults] = await Promise.all([
        this.getFoodItems(searchFilters, pagination),
        this.getCategories(searchFilters, pagination),
      ]);

      return {
        items: itemResults,
        categories: categoryResults,
        searchTerm: searchTerm.trim(),
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`Failed to search menu: ${error.message}`, 500);
    }
  }
}

export default new UserMenuService();
