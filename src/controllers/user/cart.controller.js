import cartService from "../../services/cart.service.js";
import { APIError } from "../../utils/APIError.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { cartValidationSchemas } from "../../models/Cart.model.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";
/**
 * @desc    Add item to cart
 * @route   POST /api/user/cart/add
 * @access  Private (User)
 */
export const addToCart = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user._id) {
    throw new APIError(401, "User authentication required");
  }

  // Validate request body
  const { error, value } = cartValidationSchemas.addItem.validate(req.body);
  if (error) {
    throw new APIError(
      400,
      "Validation failed",
      error.details.map((d) => d.message)
    );
  }

  const userId = req.user._id;
  const result = await cartService.addToCart(userId, value);

  res.status(result.statusCode).json(result);
});

/**
 * @desc    Get user's cart
 * @route   GET /api/user/cart/:hotelId/:branchId?includeCheckout=true
 * @access  Private (User)
 */
export const getCart = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user._id) {
    throw new APIError(401, "User authentication required");
  }

  const { hotelId, branchId } = req.params;
  const { includeCheckout } = req.query;
  const userId = req.user._id;

  if (!hotelId) {
    throw new APIError(400, "Hotel ID is required");
  }

  // branchId is optional - can be null/undefined for hotels without branches
  const options = {
    includeCheckout: includeCheckout === "true", // Convert string to boolean
  };

  const result = await cartService.getCart(
    userId,
    hotelId,
    branchId || null,
    options
  );

  res.status(result.statusCode).json(result);
});

/**
 * @desc    Update item quantity in cart
 * @route   PUT /api/user/cart/item/:itemId
 * @access  Private (User)
 */
export const updateItemQuantity = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const { quantity, hotelId, branchId } = req.body;
  const userId = req.user._id;

  // Validate request
  const { error } = cartValidationSchemas.updateQuantity.validate({ quantity });
  if (error) {
    throw new APIError(
      400,
      "Validation failed",
      error.details.map((d) => d.message)
    );
  }

  if (!hotelId || !branchId) {
    throw new APIError(400, "Hotel ID and Branch ID are required");
  }

  const result = await cartService.updateItemQuantity(
    userId,
    itemId,
    quantity,
    hotelId,
    branchId
  );

  res.status(result.statusCode).json(result);
});

/**
 * @desc    Remove item from cart
 * @route   DELETE /api/user/cart/item/:itemId
 * @access  Private (User)
 */
export const removeCartItem = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const { hotelId, branchId } = req.body;
  const userId = req.user._id;

  if (!hotelId || !branchId) {
    throw new APIError(400, "Hotel ID and Branch ID are required");
  }

  const result = await cartService.removeItem(
    userId,
    itemId,
    hotelId,
    branchId
  );

  res.status(result.statusCode).json(result);
});

/**
 * @desc    Clear entire cart
 * @route   DELETE /api/user/cart/clear
 * @access  Private (User)
 */
export const clearCart = asyncHandler(async (req, res) => {
  const { hotelId, branchId } = req.body;
  const userId = req.user._id;

  if (!hotelId || !branchId) {
    throw new APIError(400, "Hotel ID and Branch ID are required");
  }

  const result = await cartService.clearCart(userId, hotelId, branchId);

  res.status(result.statusCode).json(result);
});

/**
 * @desc    Validate cart items
 * @route   POST /api/user/cart/validate
 * @access  Private (User)
 */
export const validateCart = asyncHandler(async (req, res) => {
  const { hotelId, branchId } = req.body;
  const userId = req.user._id;

  if (!hotelId || !branchId) {
    throw new APIError(400, "Hotel ID and Branch ID are required");
  }

  const result = await cartService.validateCart(userId, hotelId, branchId);

  res.status(result.statusCode).json(result);
});

/**
 * @desc    Get cart summary
 * @route   GET /api/user/cart/summary/:hotelId/:branchId
 * @access  Private (User)
 */
export const getCartSummary = asyncHandler(async (req, res) => {
  const { hotelId, branchId } = req.params;
  const userId = req.user._id;

  if (!hotelId) {
    throw new APIError(400, "Hotel ID is required");
  }

  // branchId is optional - can be null/undefined for hotels without branches
  const result = await cartService.getCartSummary(
    userId,
    hotelId,
    branchId || null
  );

  res.status(result.statusCode).json(result);
});

/**
 * @desc    Update item customizations
 * @route   PUT /api/user/cart/item/:itemId/customizations
 * @access  Private (User)
 */
export const updateItemCustomizations = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const { customizations, hotelId, branchId } = req.body;
  const userId = req.user._id;

  // Validate customizations
  const { error } = cartValidationSchemas.updateCustomizations.validate({
    customizations,
  });
  if (error) {
    throw new APIError(
      400,
      "Validation failed",
      error.details.map((d) => d.message)
    );
  }

  if (!hotelId || !branchId) {
    throw new APIError(400, "Hotel ID and Branch ID are required");
  }

  const result = await cartService.updateItemCustomizations(
    userId,
    itemId,
    customizations,
    hotelId,
    branchId
  );

  res.status(result.statusCode).json(result);
});

/**
 * @desc    Get all user carts (across hotels/branches)
 * @route   GET /api/user/cart/all
 * @access  Private (User)
 */
export const getAllUserCarts = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const result = await cartService.getAllUserCarts(userId);

  res.status(result.statusCode).json(result);
});

/**
 * @desc    Enhanced checkout - Create order and prepare for payment
 * @route   POST /api/user/cart/checkout
 * @access  Private (User)
 */
export const transferToCheckout = asyncHandler(async (req, res) => {
  const {
    hotelId,
    branchId,
    tableId,
    paymentMethod,
    customerNote,
    specialInstructions,
    coinsToUse = 0,
    offerCode,
    estimatedDeliveryTime,
  } = req.body;

  const userId = req.user._id;

  // Validation
  if (!hotelId) {
    throw new APIError(400, "Hotel ID is required");
  }

  if (!tableId) {
    throw new APIError(400, "Table ID is required");
  }

  if (!paymentMethod) {
    throw new APIError(400, "Payment method is required");
  }

  const validPaymentMethods = ["cash", "card", "upi", "wallet", "razorpay"];
  if (!validPaymentMethods.includes(paymentMethod)) {
    throw new APIError(
      400,
      `Payment method must be one of: ${validPaymentMethods.join(", ")}`
    );
  }

  const result = await cartService.enhancedCheckout(userId, {
    hotelId,
    branchId,
    tableId,
    paymentMethod,
    customerNote,
    specialInstructions,
    coinsToUse,
    offerCode,
    estimatedDeliveryTime,
  });

  res.status(result.statusCode).json(result);
});

/**
 * @desc    Quick add to cart (for featured items, recommendations)
 * @route   POST /api/user/cart/quick-add
 * @access  Private (User)
 */
export const quickAddToCart = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user._id) {
    throw new APIError(401, "User authentication required");
  }

  const { foodItem, hotel, branch, quantity = 1 } = req.body;
  const userId = req.user._id;

  // Use default customizations for quick add
  const quickAddData = {
    foodItem,
    hotel,
    branch,
    quantity,
    customizations: {}, // No customizations for quick add
  };

  // Validate
  const { error, value } = cartValidationSchemas.addItem.validate(quickAddData);
  if (error) {
    throw new APIError(
      400,
      "Validation failed",
      error.details.map((d) => d.message)
    );
  }

  const result = await cartService.addToCart(userId, value);

  res.status(result.statusCode).json(result);
});

/**
 * @desc    Get cart item count (for badge/indicator)
 * @route   GET /api/user/cart/count/:hotelId/:branchId
 * @access  Private (User)
 */
export const getCartItemCount = asyncHandler(async (req, res) => {
  const { hotelId, branchId } = req.params;
  const userId = req.user._id;

  if (!hotelId) {
    throw new APIError(400, "Hotel ID is required");
  }

  // branchId is optional - can be null/undefined for hotels without branches
  const result = await cartService.getCartSummary(
    userId,
    hotelId,
    branchId || null
  );

  // Return just the count for UI badge
  res.status(200).json(
    new APIResponse(
      200,
      {
        itemCount: result.data.itemCount,
        totalItems: result.data.totalItems,
      },
      "Cart item count retrieved"
    )
  );
});

/**
 * @desc    Bulk update cart items
 * @route   PUT /api/user/cart/bulk-update
 * @access  Private (User)
 */
export const bulkUpdateCart = asyncHandler(async (req, res) => {
  const { updates, hotelId, branchId } = req.body;
  const userId = req.user._id;

  if (!hotelId || !branchId) {
    throw new APIError(400, "Hotel ID and Branch ID are required");
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    throw new APIError(400, "Updates array is required");
  }

  // Validate each update
  for (const update of updates) {
    if (!update.itemId || typeof update.quantity !== "number") {
      throw new APIError(400, "Each update must have itemId and quantity");
    }
    if (update.quantity < 0 || update.quantity > 20) {
      throw new APIError(400, "Quantity must be between 0 and 20");
    }
  }

  try {
    // Process each update
    let result;
    for (const update of updates) {
      result = await cartService.updateItemQuantity(
        userId,
        update.itemId,
        update.quantity,
        hotelId,
        branchId
      );
    }

    res.status(result.statusCode).json(result);
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Failed to bulk update cart items", [
      error.message,
    ]);
  }
});
