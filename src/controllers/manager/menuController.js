import { FoodCategory } from "../../models/FoodCategory.model.js";
import { FoodItem } from "../../models/FoodItem.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import mongoose from "mongoose";

// READ-ONLY OPERATIONS FOR MANAGERS
// Managers can only view food categories and items, not create/update/delete them

// Get all food categories for manager's branch
export const getFoodCategories = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = "displayOrder",
      sortOrder = "asc",
    } = req.query;

    const query = {
      branch: req.manager.branch._id, // Manager can only see their branch categories
    };

    if (search) {
      query.name = new RegExp(search, "i");
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const categories = await FoodCategory.find(query)
      .populate("branch", "name branchId location")
      .populate("hotel", "name")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalCategories = await FoodCategory.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          categories,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCategories / limit),
            totalCategories,
            hasNextPage: page < Math.ceil(totalCategories / limit),
            hasPrevPage: page > 1,
          },
        },
        "Categories retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

// Get all food items for manager's branch
export const getMenuItems = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      categoryId,
      isAvailable,
      foodType,
      sortBy = "displayOrder",
      sortOrder = "asc",
    } = req.query;

    const query = {
      branch: req.manager.branch._id, // Manager can only see their branch items
    };

    if (search && search.trim()) {
      query.$or = [
        { name: new RegExp(search.trim(), "i") },
        { description: new RegExp(search.trim(), "i") },
      ];
    }

    if (categoryId && categoryId.trim()) {
      // Convert categoryId to ObjectId if it's a valid MongoDB ID
      if (mongoose.Types.ObjectId.isValid(categoryId)) {
        query.category = new mongoose.Types.ObjectId(categoryId);
      } else {
        // If not valid ObjectId, return empty result
        return res.status(200).json(
          new APIResponse(
            200,
            {
              menuItems: [],
              pagination: {
                currentPage: parseInt(page),
                totalPages: 0,
                totalItems: 0,
                hasNextPage: false,
                hasPrevPage: false,
              },
            },
            "Invalid category ID format"
          )
        );
      }
    }

    if (isAvailable !== undefined && isAvailable !== null && isAvailable !== "") {
      // Handle both boolean and string values
      query.isAvailable = isAvailable === true || isAvailable === "true";
    }

    if (foodType && foodType.trim()) {
      // Case-insensitive match for foodType
      query.foodType = new RegExp(`^${foodType.trim()}$`, "i");
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const menuItems = await FoodItem.find(query)
      .populate("category", "name type")
      .populate("branch", "name branchId location")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalItems = await FoodItem.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          menuItems,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalItems / limit),
            totalItems,
            hasNextPage: page < Math.ceil(totalItems / limit),
            hasPrevPage: page > 1,
          },
        },
        "Menu items retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

// Update menu item availability (only thing managers can modify)
export const updateMenuItemAvailability = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { isAvailable, quantityAvailable } = req.body;

    const menuItem = await FoodItem.findOne({
      _id: itemId,
      branch: req.manager.branch._id, // Ensure item belongs to manager's branch
    });

    if (!menuItem) {
      return next(new APIError(404, "Menu item not found in your branch"));
    }

    const updates = { isAvailable };
    if (quantityAvailable !== undefined) {
      updates.quantityAvailable = quantityAvailable;
    }

    const updatedItem = await FoodItem.findByIdAndUpdate(itemId, updates, {
      new: true,
      runValidators: true,
    })
      .populate("category", "name type")
      .populate("branch", "name branchId location");

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { menuItem: updatedItem },
          "Menu item availability updated successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

// Bulk update menu item availability
export const updateBulkMenuItemAvailability = async (req, res, next) => {
  try {
    const { itemIds, isAvailable } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return next(new APIError(400, "Item IDs array is required"));
    }

    // Only update items in manager's branch
    const result = await FoodItem.updateMany(
      {
        _id: { $in: itemIds },
        branch: req.manager.branch._id,
      },
      { isAvailable },
      { runValidators: true }
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { modifiedCount: result.modifiedCount },
          `${result.modifiedCount} menu items updated successfully`
        )
      );
  } catch (error) {
    next(error);
  }
};

// Get single menu item details
export const getMenuItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    const menuItem = await FoodItem.findOne({
      _id: itemId,
      branch: req.manager.branch._id,
    })
      .populate("category", "name type description")
      .populate("branch", "name branchId location")
      .populate("hotel", "name");

    if (!menuItem) {
      return next(new APIError(404, "Menu item not found in your branch"));
    }

    res
      .status(200)
      .json(
        new APIResponse(200, { menuItem }, "Menu item retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};

// Get category details
export const getFoodCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const category = await FoodCategory.findOne({
      _id: categoryId,
      branch: req.manager.branch._id,
    })
      .populate("branch", "name branchId location")
      .populate("hotel", "name");

    if (!category) {
      return next(new APIError(404, "Category not found in your branch"));
    }

    // Get item count for this category
    const itemCount = await FoodItem.countDocuments({
      category: categoryId,
      branch: req.manager.branch._id,
    });

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { category: { ...category.toObject(), itemCount } },
          "Category retrieved successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

// DEPRECATED FUNCTIONS - These should not be used by managers anymore
// Keeping them for backward compatibility but they will return errors

export const addMenuItem = async (req, res, next) => {
  return next(
    new APIError(
      403,
      "Managers cannot create menu items. Please contact an administrator."
    )
  );
};

export const updateMenuItem = async (req, res, next) => {
  return next(
    new APIError(
      403,
      "Managers cannot update menu items. Please contact an administrator."
    )
  );
};

export const deleteMenuItem = async (req, res, next) => {
  return next(
    new APIError(
      403,
      "Managers cannot delete menu items. Please contact an administrator."
    )
  );
};

export const addFoodCategory = async (req, res, next) => {
  return next(
    new APIError(
      403,
      "Managers cannot create food categories. Please contact an administrator."
    )
  );
};

export const updateFoodCategory = async (req, res, next) => {
  return next(
    new APIError(
      403,
      "Managers cannot update food categories. Please contact an administrator."
    )
  );
};

export const deleteFoodCategory = async (req, res, next) => {
  return next(
    new APIError(
      403,
      "Managers cannot delete food categories. Please contact an administrator."
    )
  );
};
