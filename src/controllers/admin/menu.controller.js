import { FoodCategory } from "../../models/FoodCategory.model.js";
import { FoodItem } from "../../models/FoodItem.model.js";
import { Offer } from "../../models/Offer.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";
import fs from "fs";
import mongoose from "mongoose";
import {
  resolveHotelId,
  resolveBranchId,
  resolveCategoryId,
} from "../../utils/idResolver.js";
import { validateFoodItemData } from "../../validators/foodItem.validators.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";


// Food Category Management
export const getAllCategories = asyncHandler(async (req, res) => {
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
  });

export const createCategory = asyncHandler(async (req, res, next) => {
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

  // Handle image upload
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.path);
      categoryData.image = result.secure_url;
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (uploadError) {
      console.error("Error uploading category image:", uploadError);
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  }

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
  });

export const getCategoryById = asyncHandler(async (req, res, next) => {
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
  });

export const updateCategory = asyncHandler(async (req, res, next) => {
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

  // Handle image upload
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.path);
      updates.image = result.secure_url;
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (uploadError) {
      console.error("Error uploading category image:", uploadError);
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
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
  });

export const deleteCategory = asyncHandler(async (req, res, next) => {
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
  });

// Food Item Management
export const getAllFoodItems = asyncHandler(async (req, res) => {
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
  });

export const createFoodItem = asyncHandler(async (req, res, next) => {
  // Validate food item data including GST rate
  const validatedData = validateFoodItemData(req.body, false);

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
    gstRate,
    ...otherFields
  } = validatedData;

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

  if (gstRate === undefined || gstRate === null) {
    return next(new APIError(400, "GST rate is required"));
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
    gstRate,
    createdBy: req.admin._id,
    lastModifiedBy: req.admin._id,
    ...otherFields,
  });

  // Handle image upload
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.path);
      foodItem.image = result.secure_url;
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (uploadError) {
      console.error("Error uploading food item image:", uploadError);
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  }

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
  });

export const getFoodItemById = asyncHandler(async (req, res, next) => {
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
  });

export const updateFoodItem = asyncHandler(async (req, res, next) => {
  const { itemId } = req.params;

  // Validate update data including GST rate if provided
  const validatedData = validateFoodItemData(req.body, true);
  const updates = validatedData;

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

  // Validate discount price logic
  if (updates.discountPrice !== undefined && updates.discountPrice > 0) {
    const currentPrice =
      updates.price !== undefined ? updates.price : foodItem.price;
    if (updates.discountPrice >= currentPrice) {
      return next(
        new APIError(400, "Discount price must be less than Original price")
      );
    }
  }

  updates.lastModifiedBy = req.admin._id;

  // Handle image upload
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.path);
      updates.image = result.secure_url;
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (uploadError) {
      console.error("Error uploading food item image:", uploadError);
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  }

  // Update the food item fields
  Object.keys(updates).forEach((key) => {
    foodItem[key] = updates[key];
  });

  // Save with validation
  await foodItem.save();

  // Populate the updated document
  const updatedFoodItem = await FoodItem.findById(itemId)
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
  });

export const deleteFoodItem = asyncHandler(async (req, res, next) => {
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
  });

// Update single food item availability
export const updateSingleFoodItemAvailability = asyncHandler(async (req, res, next) => {
  const { itemId } = req.params;
  const { isAvailable, quantityAvailable } = req.body;

  // Validate that isAvailable is provided
  if (isAvailable === undefined) {
    return next(new APIError(400, "isAvailable field is required"));
  }

  // Build query based on admin's ownership
  let query = {
    _id: itemId,
    createdBy: req.admin._id,
  };

  // Branch admin can only update items in their assigned branches
  if (req.admin.role === "branch_admin") {
    query.branch = { $in: req.admin.assignedBranches };
  }

  const menuItem = await FoodItem.findOne(query);

  if (!menuItem) {
    return next(
      new APIError(
        404,
        "Menu item not found or you don't have permission to update it"
      )
    );
  }

  // Build update object
  const updates = { isAvailable };
  if (quantityAvailable !== undefined) {
    updates.quantityAvailable = quantityAvailable;
  }

  const updatedItem = await FoodItem.findByIdAndUpdate(itemId, updates, {
    new: true,
    runValidators: true,
  })
    .populate("category", "name type")
    .populate("branch", "name branchId location")
    .populate("hotel", "name");

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

// Bulk update food item availability
export const updateFoodItemAvailability = asyncHandler(async (req, res, next) => {
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
  });

// Offers Management
export const getAllOffers = asyncHandler(async (req, res) => {
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
  });

export const createOffer = asyncHandler(async (req, res, next) => {
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
  });

export const updateOffer = asyncHandler(async (req, res, next) => {
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
  });

export const deleteOffer = asyncHandler(async (req, res, next) => {
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
  });

/**
 * Bulk update GST rates for food items by category
 * @route PUT /api/v1/admin/menu/bulk-update-gst
 * @access Admin/Manager
 */
export const bulkUpdateGstRate = asyncHandler(async (req, res, next) => {
  const { categoryId, gstRate, hotelId, branchId } = req.body;

  // Convert categoryId to ObjectId for proper MongoDB querying
  let resolvedCategoryId;
  if (mongoose.Types.ObjectId.isValid(categoryId)) {
    resolvedCategoryId = new mongoose.Types.ObjectId(categoryId);
  } else {
    // Try to resolve using custom ID format
    try {
      resolvedCategoryId = await resolveCategoryId(categoryId);
      if (!resolvedCategoryId) {
        return next(
          new APIError(400, `Category not found with ID: ${categoryId}`)
        );
      }
      resolvedCategoryId = new mongoose.Types.ObjectId(resolvedCategoryId);
    } catch (error) {
      return next(
        new APIError(400, `Error resolving category ID: ${error.message}`)
      );
    }
  }

  // Build query to find matching food items
  const query = {
    category: resolvedCategoryId,
  };

  if (hotelId) {
    // Convert hotelId to ObjectId if it's a valid ObjectId string
    if (mongoose.Types.ObjectId.isValid(hotelId)) {
      query.hotel = new mongoose.Types.ObjectId(hotelId);
    } else {
      query.hotel = hotelId;
    }
  }

  if (branchId) {
    // Convert branchId to ObjectId if it's a valid ObjectId string
    if (mongoose.Types.ObjectId.isValid(branchId)) {
      query.branch = new mongoose.Types.ObjectId(branchId);
    } else {
      query.branch = branchId;
    }
  }

  // Log query for debugging
  // console.log("Bulk GST Update Query:", JSON.stringify(query));

  // Find all food items matching the criteria
  const foodItems = await FoodItem.find(query);

  // console.log(`Found ${foodItems.length} food items matching criteria`);

  if (foodItems.length === 0) {
    // Debug: Check if items exist in this category at all
    const itemsInCategory = await FoodItem.find({
      category: resolvedCategoryId,
    });
    // console.log(
    //   `Total items in category ${resolvedCategoryId}:`,
    //   itemsInCategory.length
    // );

    if (itemsInCategory.length > 0) {
      console.log("Sample item from category:", {
        name: itemsInCategory[0].name,
        hotel: itemsInCategory[0].hotel,
        branch: itemsInCategory[0].branch,
      });
    }

    return next(
      new APIError(
        404,
        `No food items found matching the specified criteria. Found ${itemsInCategory.length} items in category but none matching hotel/branch filters. Try without hotelId/branchId filters.`
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
    item.lastModifiedBy = req.admin._id;

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
        },
        updatedItems: updatedItems.slice(0, 20), // Return first 20 updated items
      },
      `Successfully updated GST rate to ${gstRate}% for ${updatedCount} food items`
    )
  );
  });
