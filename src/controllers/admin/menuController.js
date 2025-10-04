import { FoodCategory } from "../../models/FoodCategory.model.js";
import { FoodItem } from "../../models/FoodItem.model.js";
import { Offer } from "../../models/Offer.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import {
  resolveHotelId,
  resolveBranchId,
  resolveCategoryId,
} from "../../utils/idResolver.js";

// Food Category Management
export const getAllCategories = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      branchId,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.name = new RegExp(search, "i");
    }

    if (branchId) {
      query.branch = branchId;
    }

    // Filter by admin who created the categories (admin isolation)
    query.createdBy = req.admin._id;

    // Filter by assigned branches if admin has limited access
    if (req.admin.role === "branch_admin") {
      query.branch = { $in: req.admin.assignedBranches };
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const categories = await FoodCategory.find(query)
      .populate("branch", "name branchId location")
      .populate("hotel", "name hotelId location")
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

export const createCategory = async (req, res, next) => {
  try {
    const {
      name,
      description,
      hotelId,
      branchId,
      isActive = true,
      ...otherFields
    } = req.body;

    // Validate required fields
    if (!hotelId) {
      return next(new APIError(400, "Hotel ID is required"));
    }

    if (!branchId) {
      return next(new APIError(400, "Branch ID is required"));
    }

    // Resolve the hotel and branch IDs to ObjectIds for database queries
    let resolvedHotelId, resolvedBranchId;

    try {
      // Resolve hotel ID
      if (typeof hotelId === "string" && !hotelId.match(/^[0-9a-fA-F]{24}$/)) {
        resolvedHotelId = await resolveHotelId(hotelId);
        if (!resolvedHotelId) {
          return next(new APIError(400, `Hotel not found with ID: ${hotelId}`));
        }
      } else {
        resolvedHotelId = hotelId;
      }

      // Resolve branch ID
      if (
        typeof branchId === "string" &&
        !branchId.match(/^[0-9a-fA-F]{24}$/)
      ) {
        resolvedBranchId = await resolveBranchId(branchId, resolvedHotelId);
        if (!resolvedBranchId) {
          return next(
            new APIError(400, `Branch not found with ID: ${branchId}`)
          );
        }
      } else {
        resolvedBranchId = branchId;
      }
    } catch (error) {
      return next(new APIError(400, `Error resolving IDs: ${error.message}`));
    }

    // Check if admin has access to this branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(branchId)
    ) {
      return next(new APIError(403, "You don't have access to this branch"));
    }

    // Check if category with same name exists in this branch using resolved branch ID
    const existingCategory = await FoodCategory.findOne({
      name,
      branch: resolvedBranchId,
    });
    if (existingCategory) {
      return next(
        new APIError(
          400,
          "Category with this name already exists in this branch"
        )
      );
    }

    console.log("About to create FoodCategory with data:");
    const categoryData = {
      name,
      description,
      hotel: hotelId, // Map hotelId to hotel field
      branch: branchId, // Map branchId to branch field
      isActive,
      createdBy: req.admin._id, // Set the creating admin
      ...otherFields,
    };

    const category = new FoodCategory(categoryData);

    await category.save();

    const populatedCategory = await FoodCategory.findById(category._id)
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location");

    res
      .status(201)
      .json(
        new APIResponse(
          201,
          { category: populatedCategory },
          "Category created successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

export const getCategoryById = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const category = await FoodCategory.findOne({
      _id: categoryId,
      createdBy: req.admin._id,
    })
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location");

    if (!category) {
      return next(new APIError(404, "Category not found"));
    }

    // Check if admin has access to this category's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(category.branch._id)
    ) {
      return next(new APIError(403, "You don't have access to this category"));
    }

    res
      .status(200)
      .json(
        new APIResponse(200, { category }, "Category retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const updates = req.body;

    const category = await FoodCategory.findOne({
      _id: categoryId,
      createdBy: req.admin._id,
    }).populate("branch");
    if (!category) {
      return next(new APIError(404, "Category not found"));
    }

    // Check if admin has access to this category's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(category.branch._id)
    ) {
      return next(new APIError(403, "You don't have access to this category"));
    }

    const updatedCategory = await FoodCategory.findByIdAndUpdate(
      categoryId,
      updates,
      { new: true, runValidators: true }
    ).populate("branch", "name branchId location");

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { category: updatedCategory },
          "Category updated successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const category = await FoodCategory.findOne({
      _id: categoryId,
      createdBy: req.admin._id,
    }).populate("branch");
    if (!category) {
      return next(new APIError(404, "Category not found"));
    }

    // Check if admin has access to this category's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(category.branch._id)
    ) {
      return next(new APIError(403, "You don't have access to this category"));
    }

    // Check if category has food items
    const itemCount = await FoodItem.countDocuments({ category: categoryId });
    if (itemCount > 0) {
      return next(
        new APIError(400, "Cannot delete category with existing food items")
      );
    }

    await FoodCategory.findByIdAndDelete(categoryId);

    res
      .status(200)
      .json(new APIResponse(200, null, "Category deleted successfully"));
  } catch (error) {
    next(error);
  }
};

// Food Item Management
export const getAllFoodItems = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      branchId,
      categoryId,
      isAvailable,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
      ];
    }

    if (branchId) {
      query.branch = branchId;
    }

    if (categoryId) {
      query.category = categoryId;
    }

    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === "true";
    }

    // Filter by admin who created the food items (admin isolation)
    query.createdBy = req.admin._id;

    // Filter by assigned branches if admin has limited access
    if (req.admin.role === "branch_admin") {
      query.branch = { $in: req.admin.assignedBranches };
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const foodItems = await FoodItem.find(query)
      .populate("branch", "name branchId location")
      .populate("category", "name")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalFoodItems = await FoodItem.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          foodItems,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalFoodItems / limit),
            totalFoodItems,
            hasNextPage: page < Math.ceil(totalFoodItems / limit),
            hasPrevPage: page > 1,
          },
        },
        "Food items retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

export const createFoodItem = async (req, res, next) => {
  try {
    const {
      name,
      description,
      price,
      foodType,
      categoryId,
      hotelId,
      branchId,
      isAvailable = true,
      preparationTime,
      ingredients,
      allergens,
      nutritionalInfo,
      images,
      ...otherFields
    } = req.body;

    // Validate required fields
    if (!hotelId) {
      return next(new APIError(400, "Hotel ID is required"));
    }

    if (!branchId) {
      return next(new APIError(400, "Branch ID is required"));
    }

    if (!categoryId) {
      return next(new APIError(400, "Category ID is required"));
    }

    // Check if admin has access to this branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(branchId)
    ) {
      return next(new APIError(403, "You don't have access to this branch"));
    }

    // Check if food item with same name exists in this branch
    // Resolve branch ID for database query
    let resolvedBranchId;
    if (typeof branchId === "string" && !branchId.match(/^[0-9a-fA-F]{24}$/)) {
      try {
        const resolvedHotelId =
          typeof hotelId === "string" && !hotelId.match(/^[0-9a-fA-F]{24}$/)
            ? await resolveHotelId(hotelId)
            : hotelId;
        resolvedBranchId = await resolveBranchId(branchId, resolvedHotelId);
        if (!resolvedBranchId) {
          return next(
            new APIError(400, `Branch not found with ID: ${branchId}`)
          );
        }
      } catch (error) {
        return next(
          new APIError(400, `Error resolving branch ID: ${error.message}`)
        );
      }
    } else {
      resolvedBranchId = branchId;
    }

    const existingItem = await FoodItem.findOne({
      name,
      branch: resolvedBranchId,
    });
    if (existingItem) {
      return next(
        new APIError(
          400,
          "Food item with this name already exists in this branch"
        )
      );
    }

    const foodItem = new FoodItem({
      name,
      description,
      price,
      foodType,
      category: categoryId,
      hotel: hotelId,
      branch: branchId,
      isAvailable,
      preparationTime,
      ingredients,
      allergens,
      nutritionalInfo,
      images,
      createdBy: req.admin._id,
      lastModifiedBy: req.admin._id,
      ...otherFields,
    });

    await foodItem.save();

    const populatedFoodItem = await FoodItem.findById(foodItem._id)
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location")
      .populate("category", "name");

    res
      .status(201)
      .json(
        new APIResponse(
          201,
          { foodItem: populatedFoodItem },
          "Food item created successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

export const getFoodItemById = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    const foodItem = await FoodItem.findOne({
      _id: itemId,
      createdBy: req.admin._id,
    })
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location")
      .populate("category", "name");

    if (!foodItem) {
      return next(new APIError(404, "Food item not found"));
    }

    // Check if admin has access to this food item's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(foodItem.branch._id)
    ) {
      return next(new APIError(403, "You don't have access to this food item"));
    }

    res
      .status(200)
      .json(
        new APIResponse(200, { foodItem }, "Food item retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};

export const updateFoodItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const updates = req.body;

    const foodItem = await FoodItem.findOne({
      _id: itemId,
      createdBy: req.admin._id,
    }).populate("branch");
    if (!foodItem) {
      return next(new APIError(404, "Food item not found"));
    }

    // Check if admin has access to this food item's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(foodItem.branch._id)
    ) {
      return next(new APIError(403, "You don't have access to this food item"));
    }

    // Check pricing permission for price updates
    if (
      updates.price !== undefined &&
      !req.admin.hasPermission("managePricing")
    ) {
      return next(
        new APIError(403, "You don't have permission to update pricing")
      );
    }

    // Set lastModifiedBy field
    updates.lastModifiedBy = req.admin._id;

    const updatedFoodItem = await FoodItem.findByIdAndUpdate(itemId, updates, {
      new: true,
      runValidators: true,
    })
      .populate("branch", "name branchId location")
      .populate("category", "name");

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { foodItem: updatedFoodItem },
          "Food item updated successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

export const deleteFoodItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    const foodItem = await FoodItem.findOne({
      _id: itemId,
      createdBy: req.admin._id,
    }).populate("branch");
    if (!foodItem) {
      return next(new APIError(404, "Food item not found"));
    }

    // Check if admin has access to this food item's branch
    if (
      req.admin.role === "branch_admin" &&
      !req.admin.canAccessBranch(foodItem.branch._id)
    ) {
      return next(new APIError(403, "You don't have access to this food item"));
    }

    await FoodItem.findByIdAndDelete(itemId);

    res
      .status(200)
      .json(new APIResponse(200, null, "Food item deleted successfully"));
  } catch (error) {
    next(error);
  }
};

// Bulk update food item availability
export const updateFoodItemAvailability = async (req, res, next) => {
  try {
    const { itemIds, isAvailable } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return next(new APIError(400, "Item IDs array is required"));
    }

    // Filter items based on admin's ownership and branch access
    let query = {
      _id: { $in: itemIds },
      createdBy: req.admin._id,
    };
    if (req.admin.role === "branch_admin") {
      query.branch = { $in: req.admin.assignedBranches };
    }

    const result = await FoodItem.updateMany(
      query,
      { isAvailable },
      { runValidators: true }
    );

    res.status(200).json(
      new APIResponse(
        200,
        {
          modifiedCount: result.modifiedCount,
        },
        `${result.modifiedCount} food items updated successfully`
      )
    );
  } catch (error) {
    next(error);
  }
};

// Offers Management
export const getAllOffers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      branchId,
      isActive,
      type,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
        { couponCode: new RegExp(search, "i") },
      ];
    }

    if (branchId) {
      query.applicableBranches = branchId;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    if (type) {
      query.type = type;
    }

    // Filter by admin who created the offers (admin isolation)
    query.createdBy = req.admin._id;

    // Filter by assigned branches if admin has limited access
    if (req.admin.role === "branch_admin") {
      query.applicableBranches = { $in: req.admin.assignedBranches };
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const offers = await Offer.find(query)
      .populate("applicableBranches", "name branchId location")
      .populate("applicableItems", "name price")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalOffers = await Offer.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          offers,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalOffers / limit),
            totalOffers,
            hasNextPage: page < Math.ceil(totalOffers / limit),
            hasPrevPage: page > 1,
          },
        },
        "Offers retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

export const createOffer = async (req, res, next) => {
  try {
    const {
      title,
      description,
      type,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      couponCode,
      validFrom,
      validUntil,
      usageLimit,
      applicableBranches,
      applicableItems,
      isActive = true,
    } = req.body;

    // Check if admin has access to all specified branches
    if (req.admin.role === "branch_admin") {
      const hasAccess = applicableBranches.every((branchId) =>
        req.admin.canAccessBranch(branchId)
      );
      if (!hasAccess) {
        return next(
          new APIError(
            403,
            "You don't have access to one or more specified branches"
          )
        );
      }
    }

    // Check if coupon code already exists (if provided)
    if (couponCode) {
      const existingOffer = await Offer.findOne({ couponCode });
      if (existingOffer) {
        return next(new APIError(400, "Coupon code already exists"));
      }
    }

    const offer = new Offer({
      title,
      description,
      type,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      couponCode,
      validFrom,
      validUntil,
      usageLimit,
      applicableBranches,
      applicableItems,
      isActive,
      createdBy: req.admin._id,
    });

    await offer.save();

    const populatedOffer = await Offer.findById(offer._id)
      .populate("applicableBranches", "name branchId location")
      .populate("applicableItems", "name price");

    res
      .status(201)
      .json(
        new APIResponse(
          201,
          { offer: populatedOffer },
          "Offer created successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

export const updateOffer = async (req, res, next) => {
  try {
    const { offerId } = req.params;
    const updates = req.body;

    const offer = await Offer.findOne({
      _id: offerId,
      createdBy: req.admin._id,
    });
    if (!offer) {
      return next(new APIError(404, "Offer not found"));
    }

    // Check if admin has access to this offer's branches
    if (req.admin.role === "branch_admin") {
      const hasAccess = offer.applicableBranches.some((branchId) =>
        req.admin.canAccessBranch(branchId)
      );
      if (!hasAccess) {
        return next(new APIError(403, "You don't have access to this offer"));
      }
    }

    // Set updatedBy field
    updates.updatedBy = req.admin._id;

    const updatedOffer = await Offer.findByIdAndUpdate(offerId, updates, {
      new: true,
      runValidators: true,
    })
      .populate("applicableBranches", "name branchId location")
      .populate("applicableItems", "name price");

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { offer: updatedOffer },
          "Offer updated successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

export const deleteOffer = async (req, res, next) => {
  try {
    const { offerId } = req.params;

    const offer = await Offer.findOne({
      _id: offerId,
      createdBy: req.admin._id,
    });
    if (!offer) {
      return next(new APIError(404, "Offer not found"));
    }

    // Check if admin has access to this offer's branches
    if (req.admin.role === "branch_admin") {
      const hasAccess = offer.applicableBranches.some((branchId) =>
        req.admin.canAccessBranch(branchId)
      );
      if (!hasAccess) {
        return next(new APIError(403, "You don't have access to this offer"));
      }
    }

    await Offer.findByIdAndDelete(offerId);

    res
      .status(200)
      .json(new APIResponse(200, null, "Offer deleted successfully"));
  } catch (error) {
    next(error);
  }
};
