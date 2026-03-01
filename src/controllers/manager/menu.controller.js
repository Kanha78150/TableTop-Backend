import { FoodCategory } from "../../models/FoodCategory.model.js";
import { FoodItem } from "../../models/FoodItem.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import mongoose from "mongoose";
import { validateFoodItemData } from "../../validators/foodItem.validators.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";


// READ-ONLY OPERATIONS FOR MANAGERS
// Managers can only view food categories and items, not create/update/delete them

// Get all food categories for manager's branch
export const getFoodCategories = asyncHandler(async (req, res) => {
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
  });

// Get all food items for manager's branch
export const getMenuItems = asyncHandler(async (req, res) => {
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

  if (
    isAvailable !== undefined &&
    isAvailable !== null &&
    isAvailable !== ""
  ) {
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
  });

// Update menu item availability (only thing managers can modify)
export const updateMenuItemAvailability = asyncHandler(async (req, res, next) => {
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
  });

// Bulk update menu item availability
export const updateBulkMenuItemAvailability = asyncHandler(async (req, res, next) => {
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
  });

// Get single menu item details
export const getMenuItem = asyncHandler(async (req, res, next) => {
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
  });

// Get category details
export const getFoodCategory = asyncHandler(async (req, res, next) => {
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
  });

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

/**
 * Bulk update GST rates for food items by category (Manager version)
 * @route PUT /api/v1/manager/menu/bulk-update-gst
 * @access Manager
 */
export const bulkUpdateGstRate = asyncHandler(async (req, res, next) => {
  const { categoryId, gstRate, hotelId } = req.body;

  // Build query to find matching food items in manager's branch
  const query = {
    category: categoryId,
    branch: req.manager.branch._id, // Manager can only update their branch items
  };

  if (hotelId) {
    query.hotel = hotelId;
  }

  // Find all food items matching the criteria
  const foodItems = await FoodItem.find(query);

  if (foodItems.length === 0) {
    return next(
      new APIError(
        404,
        "No food items found matching the specified criteria in your branch"
      )
    );
  }

  // Track update statistics
  let updatedCount = 0;
  let skippedCount = 0;
  const updatedItems = [];

  // Update each food item
  for (const item of foodItems) {
    // Skip if GST rate is already the same
    if (item.gstRate === gstRate) {
      skippedCount++;
      continue;
    }

    // Update GST rate
    const oldGstRate = item.gstRate;
    item.gstRate = gstRate;
    item.lastModifiedBy = req.manager._id;

    await item.save();
    updatedCount++;
    updatedItems.push({
      id: item._id,
      name: item.name,
      oldGstRate: oldGstRate,
      newGstRate: gstRate,
    });
  }

  // Get category name for response
  const category = await FoodCategory.findById(categoryId).select("name");

  res.status(200).json(
    new APIResponse(
      200,
      {
        summary: {
          totalItemsFound: foodItems.length,
          itemsUpdated: updatedCount,
          itemsSkipped: skippedCount,
          categoryName: category?.name || "Unknown",
          newGstRate: gstRate,
          branchName: req.manager.branch.name,
        },
        updatedItems: updatedItems.slice(0, 20), // Return first 20 updated items
      },
      `Successfully updated GST rate to ${gstRate}% for ${updatedCount} food items`
    )
  );
  });
