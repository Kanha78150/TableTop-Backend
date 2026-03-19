import { Cart } from "../../models/Cart.model.js";
import { Order } from "../../models/Order.model.js";
import { FoodItem } from "../../models/FoodItem.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { Table } from "../../models/Table.model.js";
import { User } from "../../models/User.model.js";
import { APIError } from "../../utils/APIError.js";
import coinService from "../reward.service.js";
import assignmentService from "../assignment/assignment.service.js";
import { createTransactionRecord } from "../payment/postProcess.service.js";
import { generateTransactionId } from "../../utils/idGenerator.js";
import { calculateCommission } from "../../utils/commissionCalculator.js";
import { getIO } from "../../utils/socketService.js";

/**
 * Place order from user's cart
 * @param {string} userId - User ID
 * @param {string} hotelId - Hotel ID
 * @param {string} branchId - Branch ID
 * @param {Object} orderDetails - Order details (tableId, paymentMethod, etc.)
 * @returns {Object} - Created order
 */
export const placeOrderFromCart = async (
  userId,
  hotelId,
  branchId,
  orderDetails
) => {
  try {
    const {
      tableId,
      paymentMethod,
      specialInstructions,
      estimatedDeliveryTime,
      coinsToUse = 0,
    } = orderDetails;

    // 1. Get user's checkout cart
    // Normalize branchId - convert empty string or null to null
    const normalizedBranchId = branchId && branchId !== "" ? branchId : null;

    const cart = await Cart.findOne({
      user: userId,
      hotel: hotelId,
      branch: normalizedBranchId,
      status: "checkout",
    }).populate({
      path: "items.foodItem",
      select:
        "name price discountPrice isAvailable preparationTime foodType category",
      populate: {
        path: "category",
        select: "name",
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new APIError(400, "Cart is empty or not found");
    }

    // 2. Validate cart items availability and prices
    const validationResult = await cart.validateItems();
    if (!validationResult.isValid) {
      throw new APIError(400, "Cart validation failed", {
        errors: validationResult.errors,
        message:
          "Some items in your cart are no longer available or have changed prices",
      });
    }

    // 3. Validate hotel and branch are active
    const hotel = await Hotel.findById(hotelId);
    if (!hotel || hotel.status !== "active") {
      throw new APIError(400, "Hotel is currently inactive");
    }

    let branch = null;
    if (
      branchId &&
      branchId !== "" &&
      branchId !== "null" &&
      branchId !== "undefined"
    ) {
      branch = await Branch.findById(branchId);
      if (!branch || branch.status !== "active") {
        throw new APIError(400, "Branch is currently inactive");
      }
    }

    // 4. Validate table if provided
    let table = null;
    if (tableId) {
      // Build table query - include branch only if provided
      const tableQuery = { _id: tableId, hotel: hotelId };
      if (branch) {
        tableQuery.branch = branchId;
      }

      table = await Table.findOne(tableQuery);
      if (!table) {
        throw new APIError(
          400,
          branch
            ? "Table not found in this branch"
            : "Table not found in this hotel"
        );
      }
      if (table.status !== "available" && table.status !== "occupied") {
        throw new APIError(400, "Table is not available for orders");
      }
    }

    // 5. Calculate order totals
    const orderCalculation = calculateOrderTotals(cart);

    // 6. Apply coins if specified
    let coinDiscount = 0;
    let coinTransaction = null;
    let finalTotal = orderCalculation.total;

    if (coinsToUse > 0) {
      const coinApplication = await coinService.applyCoinsToOrder(
        userId,
        coinsToUse,
        orderCalculation.total
      );
      coinDiscount = coinApplication.discount;
      finalTotal = orderCalculation.total - coinDiscount;

      // Validate final total is not negative
      if (finalTotal < 0) {
        throw new APIError(
          400,
          "Invalid coin usage: discount cannot exceed order total"
        );
      }
    }

    // 7. Calculate estimated preparation time
    const estimatedTime = calculateEstimatedTime(cart.items);

    // 7. Transform cart items to order items format
    const orderItems = cart.items.map((item) => ({
      foodItem: item.foodItem._id,
      quantity: item.quantity,
      price: item.price,
      totalPrice: item.totalPrice,
      customizations: item.customizations,
      foodItemName: item.foodItem.name, // For order history
      foodType: item.foodItem.foodType,
      category: item.foodItem.category?.name,
    }));

    // 8. Create order
    const orderData = {
      user: userId,
      hotel: hotelId,
      branch: branch ? branchId : null, // Only set branch if it exists
      table: tableId || null,
      tableNumber: table ? table.tableNumber : null,
      items: orderItems,
      subtotal: orderCalculation.subtotal,
      taxes: orderCalculation.taxes,
      totalPrice: finalTotal, // Use final total after coin discount
      originalPrice: orderCalculation.total, // Store original price
      coinDiscount: coinDiscount,
      coinsUsed: coinsToUse,
      payment: {
        paymentMethod: paymentMethod || "cash",
        paymentStatus: "pending", // All orders start as pending until payment is confirmed
      },
      status: "pending",
      estimatedTime,
      specialInstructions: specialInstructions || "",
      orderSource: "mobile_app",
    };

    const order = new Order(orderData);
    await order.save();

    // 9. Process coin transactions
    if (coinsToUse > 0) {
      // Deduct coins used for payment
      coinTransaction = await coinService.processCoinsUsage(
        userId,
        order._id,
        coinsToUse,
        orderCalculation.total
      );
    }

    // Award coins for the order (if eligible)
    const adminId = hotel.createdBy; // Get admin ID from hotel
    const coinReward = await coinService.awardCoinsForOrder(
      userId,
      order._id,
      orderCalculation.total,
      adminId
    );

    // 10. Update cart status to converted
    cart.status = "converted";
    await cart.save();

    // 11. Update table status if table was selected
    if (table) {
      await table.updateStatus("occupied", userId, order._id);
    }

    // 12. Populate order details for response
    const populatedOrder = await Order.findById(order._id)
      .populate("user", "name email phone coins")
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location address")
      .populate("table", "tableNumber capacity location")
      .populate({
        path: "items.foodItem",
        select: "name price image foodType preparationTime",
      });

    // 12.5. Automatically assign order to a waiter (only for cash orders)
    // For digital payments (razorpay, phonepe, etc.), assignment happens AFTER payment verification
    const isCashOrder =
      options.paymentMethod === "cash" ||
      order.payment?.paymentMethod === "cash";
    if (isCashOrder) {
      try {
        const assignmentResult = await assignmentService.assignOrder(
          order._id.toString()
        );

        // If assignment was successful, populate the assigned staff
        if (assignmentResult.success && assignmentResult.assignment.waiter) {
          await populatedOrder.populate({
            path: "staff",
            select: "name staffId role",
          });
        }
      } catch (assignmentError) {
        // Log assignment error but don't fail the order creation
        console.error(
          `[PLACE-ORDER] Assignment failed for order ${order._id}:`,
          assignmentError.message
        );
        // The order is still valid even if assignment fails - it can be manually assigned later
      }
    } else {
      console.log(
        `[PLACE-ORDER] Skipping staff assignment for order ${order._id} - waiting for payment verification (method: ${options.paymentMethod})`
      );
    }

    // Add coin transaction details to response
    populatedOrder._doc.coinDetails = {
      coinsUsed: coinsToUse,
      coinDiscount: coinDiscount,
      coinsEarned: coinReward.coinsEarned || 0,
      userCoinBalance: populatedOrder.user.coins,
    };

    return populatedOrder;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Failed to place order", error.message);
  }
};

/**
 * Get user's orders with filters
 * @param {string} userId - User ID
 * @param {Object} filters - Filter options (status, hotel, branch, limit, skip)
 * @returns {Object} - Orders with pagination
 */
export const getUserOrders = async (userId, filters = {}) => {
  try {
    const {
      status,
      hotel,
      branch,
      limit = 10,
      skip = 0,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    // Build query
    const query = { user: userId };

    if (status && status !== "all") {
      // Handle both string and object (like $in operator)
      query.status = status;
    }

    if (hotel) {
      query.hotel = hotel;
    }

    if (branch) {
      query.branch = branch;
    }

    // Get orders with pagination
    const orders = await Order.find(query)
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location address")
      .populate("table", "tableNumber")
      .populate({
        path: "items.foodItem",
        select: "name image foodType",
      })
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(query);

    return {
      orders,
      pagination: {
        total: totalOrders,
        limit: parseInt(limit),
        skip: parseInt(skip),
        pages: Math.ceil(totalOrders / limit),
        hasNext: skip + limit < totalOrders,
        hasPrev: skip > 0,
      },
    };
  } catch (error) {
    throw new APIError(500, "Failed to fetch orders", error.message);
  }
};

/**
 * Get order details by ID
 * @param {string} orderId - Order ID
 * @param {string} userId - User ID (for ownership verification)
 * @returns {Object} - Order details
 */
export const getOrderById = async (orderId, userId) => {
  try {
    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate("user", "name email phone")
      .populate("hotel", "name hotelId location contact")
      .populate("branch", "name branchId location address contact")
      .populate("table", "tableNumber capacity location")
      .populate("staff", "name empId role")
      .populate({
        path: "items.foodItem",
        select:
          "name description price image foodType preparationTime allergens",
        populate: {
          path: "category",
          select: "name",
        },
      });

    if (!order) {
      throw new APIError(404, "Order not found");
    }

    return order;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Failed to fetch order details", error.message);
  }
};

/**
 * Cancel order (if allowed)
 * @param {string} orderId - Order ID
 * @param {string} userId - User ID
 * @param {string} reason - Cancellation reason
 * @returns {Object} - Updated order
 */
export const cancelOrder = async (
  orderId,
  userId,
  reason = "User cancelled"
) => {
  try {
    const order = await Order.findOne({ _id: orderId, user: userId });

    if (!order) {
      throw new APIError(404, "Order not found");
    }
    if (!["pending", "confirmed", "preparing"].includes(order.status)) {
      throw new APIError(400, "Order cannot be cancelled at this stage");
    }

    // Handle coin refunds for cancelled order
    let coinRefundDetails = null;
    try {
      coinRefundDetails = await coinService.handleCoinRefund(userId, orderId);
    } catch (coinError) {
      console.warn("Coin refund processing failed:", coinError.message);
      // Continue with order cancellation even if coin refund fails
    }

    // Update order status
    order.status = "cancelled";
    order.cancellationReason = reason;
    order.cancelledAt = new Date();
    order.payment.paymentStatus =
      order.payment.paymentStatus === "paid" ? "refund_pending" : "cancelled";

    // Handle commission on cancellation
    if (order.payment.paymentStatus === "refund_pending") {
      // Payment was made — commission should be waived (refund scenario)
      order.payment.commissionStatus = "waived";
      order.payment.commissionAmount = 0;
      order.payment.commissionWaivedAt = new Date();
    } else if (order.payment.commissionStatus !== "not_applicable") {
      // Payment was never made — commission not applicable
      order.payment.commissionStatus = "not_applicable";
      order.payment.commissionAmount = 0;
    }

    await order.save();

    // Update table status if applicable
    if (order.table) {
      await Table.findByIdAndUpdate(order.table, {
        status: "available",
        currentOrder: null,
        currentCustomer: null,
      });
    }

    // Add coin refund details to the response
    if (coinRefundDetails) {
      order._doc.coinRefund = coinRefundDetails;
    }

    return order;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Failed to cancel order", error.message);
  }
};

/**
 * Reorder - add items from previous order to cart for review and modification
 * @param {string} orderId - Original order ID
 * @param {string} userId - User ID
 * @param {Object} orderDetails - Order details (tableId, specialInstructions)
 * @returns {Object} - Cart populated with reorder items for user review
 */
export const reorderFromPrevious = async (
  orderId,
  userId,
  orderDetails = {}
) => {
  try {
    const originalOrder = await Order.findOne({
      _id: orderId,
      user: userId,
    }).populate("items.foodItem", "isAvailable price discountPrice");

    if (!originalOrder) {
      throw new APIError(404, "Original order not found");
    }

    // Always use cart mode for reorder - allows review and modification
    return await reorderToCart(originalOrder, userId, orderDetails);
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Failed to reorder", error.message);
  }
};
/**
 * Add reorder items to cart for user review and modification
 * @param {Object} originalOrder - Original order object
 * @param {string} userId - User ID
 * @param {Object} orderDetails - Order details
 * @returns {Object} - Cart with reorder items
 */
const reorderToCart = async (originalOrder, userId, orderDetails) => {
  try {
    const { Cart } = await import("../models/Cart.model.js");

    // Find or create cart for the same hotel/branch
    let cart = await Cart.findOne({
      user: userId,
      hotel: originalOrder.hotel,
      branch: originalOrder.branch,
      status: "active",
    });

    if (!cart) {
      cart = new Cart({
        user: userId,
        hotel: originalOrder.hotel,
        branch: originalOrder.branch,
        status: "active",
        items: [],
      });
    }

    // Validate items and prepare cart items
    const availableItems = [];
    const unavailableItems = [];

    for (const item of originalOrder.items) {
      if (item.foodItem && item.foodItem.isAvailable) {
        const currentPrice = item.foodItem.discountPrice || item.foodItem.price;

        // Check if item already exists in cart
        const existingItemIndex = cart.items.findIndex(
          (cartItem) =>
            cartItem.foodItem.toString() === item.foodItem._id.toString()
        );

        if (existingItemIndex > -1) {
          // Update existing item quantity
          cart.items[existingItemIndex].quantity += item.quantity;
          cart.items[existingItemIndex].totalPrice =
            cart.items[existingItemIndex].quantity * currentPrice;
        } else {
          // Add new item to cart
          cart.items.push({
            foodItem: item.foodItem._id,
            quantity: item.quantity,
            price: currentPrice,
            totalPrice: currentPrice * item.quantity,
            customizations: item.customizations || {},
            addedFrom: "reorder",
          });
        }

        availableItems.push({
          name: item.foodItemName || item.foodItem.name,
          quantity: item.quantity,
          oldPrice: item.price,
          newPrice: currentPrice,
          priceChanged: item.price !== currentPrice,
        });
      } else {
        unavailableItems.push({
          name: item.foodItemName || "Unknown Item",
          reason: item.foodItem ? "Currently unavailable" : "No longer exists",
        });
      }
    }

    if (availableItems.length === 0) {
      throw new APIError(
        400,
        "None of the items from the original order are available"
      );
    }

    // Recalculate cart totals
    cart.subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    await cart.save();

    // Populate cart for response
    await cart.populate([
      {
        path: "items.foodItem",
        select: "name price discountPrice image category foodType",
      },
      {
        path: "hotel",
        select: "name location",
      },
      {
        path: "branch",
        select: "name address",
      },
    ]);

    return {
      cart,
      availableItems,
      unavailableItems,
      summary: {
        totalItemsAdded: availableItems.length,
        totalItemsUnavailable: unavailableItems.length,
        cartTotal: cart.subtotal,
        priceChanges: availableItems.filter((item) => item.priceChanged).length,
      },
      message:
        unavailableItems.length > 0
          ? `${availableItems.length} items added to cart for review. ${unavailableItems.length} items were unavailable.`
          : `All ${availableItems.length} items added to cart for review.`,
      nextSteps: {
        review: "GET /api/v1/user/cart",
        modify: "PUT /api/v1/user/cart/item/:itemId",
        checkout: "POST /api/v1/user/cart/checkout",
      },
    };
  } catch (error) {
    throw new APIError(
      500,
      "Failed to add reorder items to cart",
      error.message
    );
  }
};

/**
 * Calculate order totals including taxes and discounts
 * @param {Object} cart - Cart object with items
 * @returns {Object} - Order calculation breakdown
 */
const calculateOrderTotals = (cart) => {
  const subtotal = cart.subtotal;
  const taxCalculation = calculateTaxes(cart.items, subtotal, subtotal);
  const serviceCharge = calculateServiceCharge(subtotal);
  const total = subtotal + taxCalculation.total + serviceCharge;

  return {
    subtotal,
    taxes: taxCalculation.total,
    serviceCharge,
    total,
    breakdown: {
      itemsTotal: subtotal,
      cgst: taxCalculation.cgst,
      sgst: taxCalculation.sgst,
      serviceCharge,
      grandTotal: total,
    },
  };
};

/**
 * Calculate taxes (GST) based on per-item GST rates
 * @param {Array} items - Order items with gstRate
 * @param {number} baseAmount - Base amount after discounts
 * @param {number} subtotal - Original subtotal before discounts
 * @returns {Object} - Tax breakdown with total, CGST, SGST
 */
const calculateTaxes = (items, baseAmount, subtotal) => {
  // Calculate proportional base amount for each item (after discounts)
  const discountRatio = baseAmount / subtotal;

  let totalTaxes = 0;
  const itemTaxDetails = [];

  items.forEach((item) => {
    const itemBaseAmount = item.totalPrice * discountRatio;
    const itemGstAmount = (itemBaseAmount * item.gstRate) / 100;
    totalTaxes += itemGstAmount;

    itemTaxDetails.push({
      itemName: item.foodItemName || item.name,
      gstRate: item.gstRate,
      gstAmount: Math.round(itemGstAmount * 100) / 100,
    });
  });

  const totalGst = Math.round(totalTaxes * 100) / 100;

  return {
    total: totalGst,
    cgst: Math.round(totalGst * 0.5 * 100) / 100, // 50% as CGST
    sgst: Math.round(totalGst * 0.5 * 100) / 100, // 50% as SGST
    itemDetails: itemTaxDetails,
  };
};

/**
 * Calculate service charge
 * @param {number} amount - Amount to calculate service charge on
 * @returns {number} - Service charge amount
 */
const calculateServiceCharge = (amount) => {
  const SERVICE_CHARGE_RATE = 0.05; // 5% service charge
  return Math.round(amount * SERVICE_CHARGE_RATE * 100) / 100;
};

/**
 * Calculate estimated preparation time
 * @param {Array} items - Order items
 * @returns {number} - Estimated time in minutes
 */
const calculateEstimatedTime = (items) => {
  let maxPrepTime = 0;
  let totalComplexity = 0;

  items.forEach((item) => {
    const itemPrepTime = item.foodItem?.preparationTime || 15; // Default 15 minutes
    const itemComplexity = item.quantity * (item.customizations ? 1.2 : 1);

    maxPrepTime = Math.max(maxPrepTime, itemPrepTime);
    totalComplexity += itemComplexity;
  });

  // Base time is the longest preparation time + complexity factor
  const baseTime = maxPrepTime + Math.ceil(totalComplexity / 2);

  // Add buffer time (10-20% based on order size)
  const bufferMultiplier = 1 + items.length * 0.02; // 2% per item

  return Math.ceil(baseTime * bufferMultiplier);
};

/**
 * Place direct order with items (without cart)
 * @param {string} userId - User ID
 * @param {string} hotelId - Hotel ID
 * @param {string} branchId - Branch ID
 * @param {Object} orderDetails - Order details with items array
 * @returns {Object} - Created order
 */
export const placeDirectOrder = async (
  userId,
  hotelId,
  branchId,
  orderDetails
) => {
  try {
    const {
      items,
      tableId,
      paymentMethod = "cash",
      specialInstructions,
      customerNote,
      estimatedDeliveryTime,
    } = orderDetails;

    // 1. Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      throw new APIError(404, "User not found");
    }

    // 2. Validate hotel and branch
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      throw new APIError(404, "Hotel not found");
    }

    let branch = null;
    if (branchId) {
      branch = await Branch.findById(branchId);
      if (!branch) {
        throw new APIError(404, "Branch not found");
      }
    }

    // 3. Validate table if provided
    let table = null;
    if (tableId) {
      table = await Table.findById(tableId);
      if (!table) {
        throw new APIError(404, "Table not found");
      }
    }

    // 4. Validate and prepare food items
    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const foodItem = await FoodItem.findById(item.foodItemId)
        .populate("category", "name")
        .populate("hotel", "name");

      if (!foodItem) {
        throw new APIError(404, `Food item ${item.foodItemId} not found`);
      }

      if (!foodItem.isAvailable) {
        throw new APIError(400, `${foodItem.name} is currently unavailable`);
      }

      // Check if food item belongs to the hotel
      if (foodItem.hotel._id.toString() !== hotelId) {
        throw new APIError(400, `${foodItem.name} not available at this hotel`);
      }

      // Validate gstRate exists
      if (foodItem.gstRate === undefined || foodItem.gstRate === null) {
        throw new APIError(
          400,
          `GST rate not configured for item: ${foodItem.name}. Please contact admin.`
        );
      }

      const itemPrice = foodItem.discountPrice || foodItem.price;
      const itemTotal = itemPrice * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        foodItem: foodItem._id,
        name: foodItem.name,
        price: itemPrice,
        originalPrice: foodItem.price,
        quantity: item.quantity,
        total: itemTotal,
        totalPrice: itemTotal,
        customizations: item.customizations || [],
        specialInstructions: item.specialInstructions || "",
        preparationTime: foodItem.preparationTime,
        gstRate: foodItem.gstRate,
      });
    }

    // 5. Calculate pricing with per-item GST
    const taxCalculation = calculateTaxes(orderItems, subtotal, subtotal);
    const deliveryFee = table ? 0 : 50; // Free delivery for table orders
    const total = subtotal + taxCalculation.total + deliveryFee;

    // Add gstAmount to each order item
    orderItems.forEach((item, index) => {
      item.gstAmount = taxCalculation.itemDetails[index].gstAmount;
    });

    // 6. Calculate estimated preparation time
    const estimatedPrepTime = calculateEstimatedTime(orderItems);
    const estimatedDelivery =
      estimatedDeliveryTime || new Date(Date.now() + estimatedPrepTime * 60000);

    // 7. Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 4)
      .toUpperCase()}`;

    // 8. Create order
    const newOrder = new Order({
      orderNumber,
      user: userId,
      hotel: hotelId,
      branch: branchId,
      table: tableId,
      items: orderItems,
      pricing: {
        subtotal,
        tax: taxCalculation.total,
        deliveryFee,
        total,
      },
      paymentMethod,
      status: "pending",
      specialInstructions,
      customerNote,
      estimatedPreparationTime: estimatedPrepTime,
      estimatedDeliveryTime: estimatedDelivery,
      orderType: "direct", // Mark as direct order
      timeline: [
        {
          status: "pending",
          timestamp: new Date(),
          note: `Order placed ${
            table ? `from Table ${table.tableNumber}` : "for delivery"
          }`,
        },
      ],
    });

    await newOrder.save();

    // 9. Update table status if applicable
    if (
      table &&
      (table.status === "available" || table.status === "occupied")
    ) {
      await table.updateStatus("occupied", userId, newOrder._id);
    }

    // 10. Populate order details for response
    const populatedOrder = await Order.findById(newOrder._id)
      .populate("user", "name email phone")
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location")
      .populate("table", "tableNumber capacity location")
      .populate({
        path: "items.foodItem",
        select: "name image foodType preparationTime",
        populate: {
          path: "category",
          select: "name",
        },
      });

    return populatedOrder;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Failed to place direct order", error.message);
  }
};

/**
 * Add extra items to an existing served order (add-on / supplementary items)
 * @param {string} orderId - Order ID
 * @param {string} userId - User ID
 * @returns {Object} - { order, supplementaryPayment }
 */
export const addItemsToOrder = async (orderId, userId) => {
  try {
    // 1. Fetch and validate order
    const order = await Order.findById(orderId).populate("hotel", "branch");
    if (!order) {
      throw new APIError(404, "Order not found");
    }
    if (order.user.toString() !== userId.toString()) {
      throw new APIError(403, "You are not authorized to modify this order");
    }
    if (order.status !== "served") {
      throw new APIError(
        400,
        `Cannot add items when order status is "${order.status}". Items can only be added after food is served.`
      );
    }
    if (order.pendingAddOnPayment) {
      throw new APIError(
        400,
        "A previous add-on payment is still pending. Please complete the payment before adding more items."
      );
    }

    // 2. Fetch user's active cart for the same hotel/branch
    const normalizedBranchId =
      order.branch && order.branch.toString() !== "" ? order.branch : null;

    const cart = await Cart.findOne({
      user: userId,
      hotel: order.hotel._id,
      branch: normalizedBranchId,
      status: "active",
    }).populate({
      path: "items.foodItem",
      select:
        "name price discountPrice effectivePrice isAvailable preparationTime foodType category gstRate",
      populate: {
        path: "category",
        select: "name",
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new APIError(
        400,
        "No active cart found. Please add items to your cart first."
      );
    }

    // 3. Validate cart items
    const validationResult = await cart.validateItems();
    if (!validationResult.isValid) {
      throw new APIError(400, "Cart validation failed", {
        errors: validationResult.errors,
      });
    }

    // 4. Map cart items to order items with new batch number
    const newBatch = order.currentBatch + 1;
    let addOnSubtotal = 0;

    const newItems = cart.items.map((item) => {
      const itemPrice = item.foodItem.effectivePrice || item.foodItem.price;
      const itemTotal = itemPrice * item.quantity;
      addOnSubtotal += itemTotal;

      if (
        item.foodItem.gstRate === undefined ||
        item.foodItem.gstRate === null
      ) {
        throw new APIError(
          400,
          `GST rate not configured for item: ${item.foodItem.name}. Please contact admin.`
        );
      }

      return {
        foodItem: item.foodItem._id,
        foodItemName: item.foodItem.name,
        quantity: item.quantity,
        price: itemPrice,
        totalPrice: itemTotal,
        customizations: item.customizations,
        foodType: item.foodItem.foodType || "veg",
        gstRate: item.foodItem.gstRate,
        gstAmount: 0, // Will be calculated below
        batch: newBatch,
      };
    });

    // 5. Recalculate order totals with all items (existing + new)
    const existingSubtotal = order.subtotal;
    const newSubtotal = existingSubtotal + addOnSubtotal;

    // Recalculate taxes with per-item GST for ALL items
    const allItems = [...order.items.toObject(), ...newItems];
    // Discount ratio: apply existing discounts proportionally to original items only
    // New items have no coin/offer discount applied
    const existingDiscountTotal =
      (order.coinDiscount || 0) + (order.offerDiscount || 0);
    const existingBaseAmount = Math.max(
      0,
      existingSubtotal - existingDiscountTotal
    );

    let totalTaxes = 0;
    for (const item of allItems) {
      let itemBaseAmount;
      if (item.batch && item.batch > 1) {
        // New add-on items: full price (no discount)
        itemBaseAmount = item.totalPrice;
      } else {
        // Original items: apply existing discount ratio
        const discountRatio =
          existingSubtotal > 0 ? existingBaseAmount / existingSubtotal : 1;
        itemBaseAmount = item.totalPrice * discountRatio;
      }
      const itemGstAmount = (itemBaseAmount * item.gstRate) / 100;
      totalTaxes += itemGstAmount;

      // Update gstAmount for new items
      if (item.batch && item.batch > 1) {
        item.gstAmount = Math.round(itemGstAmount * 100) / 100;
      }
    }

    const newTaxes = Math.max(0, Math.round(totalTaxes * 100) / 100);
    const newServiceCharge = 0; // Matching existing logic
    const newTotalPrice = Math.max(
      0,
      existingBaseAmount + addOnSubtotal + newTaxes + newServiceCharge
    );

    // 6. Recalculate commission on the new combined total (single commission)
    const hotel = await Hotel.findById(order.hotel._id).select(
      "commissionConfig"
    );
    const commissionResult = calculateCommission(hotel, newTotalPrice);

    // 7. Determine if this is a digital or cash order
    const isCashOrder = order.payment?.paymentMethod === "cash";
    const isDigitalOrder = ["razorpay", "phonepe", "paytm"].includes(
      order.payment?.paymentMethod
    );

    // 8. Update order
    order.items.push(...newItems);
    order.subtotal = newSubtotal;
    order.taxes = newTaxes;
    order.serviceCharge = newServiceCharge;
    order.totalPrice = newTotalPrice;
    order.currentBatch = newBatch;
    order.previousStatus = order.status;
    order.status = "confirmed";
    order.hasAddOns = true;

    // Update commission (single calculation on combined total)
    order.payment.commissionAmount = commissionResult.amount;
    order.payment.commissionRate = commissionResult.rate;
    if (commissionResult.applicable) {
      // Keep existing commission status (pending or due) — don't regress "due" back to "pending"
      if (order.payment.commissionStatus === "not_applicable") {
        order.payment.commissionStatus = "pending";
      }
    }

    // Update reward coins based on new total
    order.rewardCoins = Math.max(0, Math.floor(newTotalPrice * 0.1));

    // Add status history entry
    order.statusHistory.push({
      status: "confirmed",
      timestamp: new Date(),
      notes: `Add-on items added (batch ${newBatch})`,
    });

    let supplementaryPayment = { required: false };

    if (isDigitalOrder) {
      // Digital: create supplementary payment entry
      const addOnTaxes = newItems.reduce(
        (sum, item) => sum + item.gstAmount,
        0
      );
      const addOnTotal = Math.max(
        0,
        addOnSubtotal + addOnTaxes + newServiceCharge
      );

      order.pendingAddOnPayment = true;
      order.supplementaryPayments.push({
        batch: newBatch,
        amount: Math.round(addOnTotal * 100) / 100,
        provider: order.payment.provider,
        paymentStatus: "pending",
        commissionAmount: 0,
        commissionRate: 0,
        commissionStatus: "not_applicable",
        createdAt: new Date(),
      });

      supplementaryPayment = {
        required: true,
        amount: Math.round(addOnTotal * 100) / 100,
        batch: newBatch,
        provider: order.payment.provider,
      };
    }

    // 9. Mark cart as converted
    cart.status = "converted";
    cart.checkoutOrderId = order._id;
    await cart.save();

    // 10. Save order
    await order.save();

    // 11. Socket notification for cash orders (immediate)
    // For digital orders, notification is sent after supplementary payment is verified
    if (isCashOrder && order.staff) {
      try {
        const io = getIO();
        const notificationData = {
          orderId: order._id,
          orderNumber: order.orderNumber,
          newItems: newItems.map((i) => ({
            foodItemName: i.foodItemName,
            quantity: i.quantity,
            price: i.price,
            totalPrice: i.totalPrice,
          })),
          batch: newBatch,
          updatedTotal: order.totalPrice,
          paymentMethod: order.payment?.paymentMethod || "cash",
          tableNumber: order.table?.tableNumber || null,
          message: "Customer has added extra items to their order",
        };
        io.to(`staff_${order.staff}`).emit(
          "order:items-added",
          notificationData
        );
        if (order.branch) {
          io.to(`branch_${order.branch}`).emit(
            "order:items-added",
            notificationData
          );
        }
      } catch (socketError) {
        // Don't fail the operation if socket notification fails
        console.error("Socket notification error:", socketError.message);
      }
    }

    // 12. Populate order for response
    await order.populate([
      { path: "user", select: "name email phone" },
      { path: "hotel", select: "name hotelId" },
      { path: "branch", select: "name branchId" },
      { path: "table", select: "tableNumber" },
      { path: "staff", select: "name staffId" },
      {
        path: "items.foodItem",
        select: "name price image category foodType",
      },
    ]);

    return { order, supplementaryPayment };
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Failed to add items to order", error.message);
  }
};

/**
 * Confirm cash payment for an order (mark as paid)
 * @param {string} orderId - Order ID
 * @param {string} confirmedBy - User ID of the person confirming
 * @param {string} confirmedByRole - Role of the confirmer (staff, manager, admin)
 * @returns {Object} - Updated order
 */
export const confirmCashPayment = async (
  orderId,
  confirmedBy,
  confirmedByRole
) => {
  try {
    const order = await Order.findById(orderId);

    if (!order) {
      throw new APIError(404, "Order not found");
    }

    // Only cash payments can be manually confirmed
    if (order.payment?.paymentMethod !== "cash") {
      throw new APIError(
        400,
        "Only cash payments can be manually confirmed. Online payments are confirmed automatically."
      );
    }

    // Check if already paid
    if (order.payment?.paymentStatus === "paid") {
      throw new APIError(400, "This order's payment is already marked as paid");
    }

    // Only pending payments can be confirmed
    if (order.payment?.paymentStatus !== "pending") {
      throw new APIError(
        400,
        `Cannot confirm payment with status "${order.payment?.paymentStatus}". Only pending payments can be confirmed.`
      );
    }

    // Update payment status and transition commission to "due" if applicable
    const updateFields = {
      "payment.paymentStatus": "paid",
      "payment.paidAt": new Date(),
      "payment.provider": "cash",
      "payment.transactionId": generateTransactionId(),
      "payment.cashConfirmedBy": confirmedBy,
      "payment.cashConfirmedByRole": confirmedByRole,
      "payment.cashConfirmedAt": new Date(),
      updatedAt: new Date(),
    };

    // Transition commission from pending to due (same as online payment verification)
    if (order.payment?.commissionStatus === "pending") {
      updateFields["payment.commissionStatus"] = "due";
    }

    const updatedOrder = await Order.findByIdAndUpdate(orderId, updateFields, {
      new: true,
    })
      .populate("user", "name phone email")
      .populate("hotel", "name hotelId")
      .populate("branch", "name branchId")
      .populate("table", "tableNumber")
      .populate("staff", "name staffId");

    // Create Transaction record for cash payment (same as online payments)
    await createTransactionRecord(updatedOrder);

    return updatedOrder;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Failed to confirm cash payment", error.message);
  }
};

export default {
  placeOrderFromCart,
  getUserOrders,
  getOrderById,
  cancelOrder,
  reorderFromPrevious,
  addItemsToOrder,
  confirmCashPayment,
};
