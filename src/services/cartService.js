import { Cart } from "../models/Cart.model.js";
import { FoodItem } from "../models/FoodItem.model.js";
import { Hotel } from "../models/Hotel.model.js";
import { Branch } from "../models/Branch.model.js";
import { CoinTransaction } from "../models/CoinTransaction.model.js";
import { APIError } from "../utils/APIError.js";
import { APIResponse } from "../utils/APIResponse.js";
import { logger } from "../utils/logger.js";
import { coinService } from "./rewardService.js";
import assignmentService from "./assignmentService.js";

class CartService {
  /**
   * Add item to cart or update quantity if item already exists
   */
  async addToCart(
    userId,
    {
      foodItem: foodItemId,
      quantity,
      hotel: hotelId,
      branch: branchId,
      customizations = {},
    }
  ) {
    try {
      // Validate food item exists and is available
      const foodItem = await FoodItem.findById(foodItemId)
        .populate("hotel", "name status")
        .populate("branch", "name status")
        .populate("category", "name");

      if (!foodItem) {
        throw new APIError(404, "Food item not found");
      }

      if (!foodItem.isAvailable) {
        throw new APIError(400, "Food item is currently unavailable");
      }

      // Check if hotel is active
      if (!foodItem.hotel?.status || foodItem.hotel.status !== "active") {
        throw new APIError(400, "Hotel is currently inactive");
      }

      // Check branch status only if branch is provided and food item has a branch
      if (branchId && branchId !== "" && branchId !== null) {
        if (!foodItem.branch?.status || foodItem.branch.status !== "active") {
          throw new APIError(400, "Branch is currently inactive");
        }
      }

      // Verify hotel and branch match the food item
      if (foodItem.hotel._id.toString() !== hotelId) {
        throw new APIError(
          400,
          "Food item does not belong to the specified hotel"
        );
      }

      // Check branch match only if branch is provided
      if (branchId && branchId !== "" && branchId !== null) {
        if (foodItem.branch && foodItem.branch._id.toString() !== branchId) {
          throw new APIError(
            400,
            "Food item does not belong to the specified branch"
          );
        }
      }

      // Check quantity availability for limited items
      if (foodItem.isLimitedQuantity && foodItem.quantityAvailable !== null) {
        if (quantity > foodItem.quantityAvailable) {
          throw new APIError(
            400,
            `Only ${foodItem.quantityAvailable} items available`
          );
        }
      }

      // Get effective price (with discount if available)
      const price = foodItem.discountPrice || foodItem.price;

      // Find or create cart for user
      let cart = await Cart.findOrCreateCart(userId, hotelId, branchId);

      // Check if adding this quantity would exceed the limit for existing items
      const existingItem = cart.items.find(
        (item) =>
          item.foodItem.toString() === foodItemId.toString() &&
          JSON.stringify(item.customizations) === JSON.stringify(customizations)
      );

      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity;
        if (newQuantity > 20) {
          throw new APIError(400, "Maximum 20 items allowed per food item");
        }

        // Check availability for the new total quantity
        if (foodItem.isLimitedQuantity && foodItem.quantityAvailable !== null) {
          if (newQuantity > foodItem.quantityAvailable) {
            throw new APIError(
              400,
              `Only ${foodItem.quantityAvailable} items available`
            );
          }
        }
      }

      // Add item to cart
      cart.addItem(foodItemId, quantity, price, customizations);
      await cart.save();

      // Populate cart for response
      await cart.populate([
        {
          path: "items.foodItem",
          select:
            "name price discountPrice image isAvailable quantityAvailable foodType spiceLevel category",
          populate: {
            path: "category",
            select: "name",
          },
        },
        {
          path: "hotel",
          select: "name",
        },
        {
          path: "branch",
          select: "name address",
        },
      ]);

      return new APIResponse(200, cart, "Item added to cart successfully");
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to add item to cart", [error.message]);
    }
  }

  /**
   * Get user's cart with all items
   * @param {String} userId - User ID
   * @param {String} hotelId - Hotel ID
   * @param {String} branchId - Branch ID
   * @param {Object} options - Additional options
   * @param {Boolean} options.includeCheckout - Include carts in checkout status (default: false)
   */
  async getCart(userId, hotelId, branchId, options = {}) {
    try {
      // Normalize branchId - convert empty string or null to null
      const normalizedBranchId = branchId && branchId !== "" ? branchId : null;

      // Build query - allow fetching checkout carts if requested
      const query = {
        user: userId,
        hotel: hotelId,
        branch: normalizedBranchId,
      };

      // Only filter by status if not including checkout carts
      if (!options.includeCheckout) {
        query.status = "active";
      } else {
        // Include both active and checkout carts
        query.status = { $in: ["active", "checkout"] };
      }

      const cart = await Cart.findOne(query).populate([
        {
          path: "items.foodItem",
          select:
            "name price discountPrice image isAvailable quantityAvailable foodType spiceLevel preparationTime category",
          populate: {
            path: "category",
            select: "name",
          },
        },
        {
          path: "hotel",
          select: "name",
        },
        {
          path: "branch",
          select: "name address phone",
        },
      ]);

      if (!cart || cart.items.length === 0) {
        return new APIResponse(
          200,
          {
            items: [],
            subtotal: 0,
            totalItems: 0,
            hotel: null,
            branch: null,
            isValidated: true,
            validationErrors: [],
            status: "empty",
          },
          "Cart is empty"
        );
      }

      // Add additional info for checkout carts
      const responseData = {
        ...cart.toObject(),
        isLocked: cart.status === "checkout",
        canModify: cart.status === "active",
      };

      const message =
        cart.status === "checkout"
          ? "Cart is in checkout. Complete payment or cancel to modify."
          : "Cart retrieved successfully";

      return new APIResponse(200, responseData, message);
    } catch (error) {
      throw new APIError(500, "Failed to retrieve cart", [error.message]);
    }
  }

  /**
   * Update item quantity in cart
   */
  async updateItemQuantity(userId, itemId, quantity, hotelId, branchId) {
    try {
      const cart = await Cart.findOne({
        user: userId,
        hotel: hotelId,
        branch: branchId,
        status: "active",
      });

      if (!cart) {
        throw new APIError(404, "Cart not found");
      }

      const cartItem = cart.items.id(itemId);
      if (!cartItem) {
        throw new APIError(404, "Item not found in cart");
      }

      // If quantity is 0, remove the item
      if (quantity === 0) {
        cart.removeItem(itemId);
      } else {
        // Validate food item availability for the new quantity
        const foodItem = await FoodItem.findById(cartItem.foodItem);
        if (!foodItem) {
          throw new APIError(404, "Food item no longer exists");
        }

        if (!foodItem.isAvailable) {
          throw new APIError(400, "Food item is currently unavailable");
        }

        if (foodItem.isLimitedQuantity && foodItem.quantityAvailable !== null) {
          if (quantity > foodItem.quantityAvailable) {
            throw new APIError(
              400,
              `Only ${foodItem.quantityAvailable} items available`
            );
          }
        }

        cart.updateItemQuantity(itemId, quantity);
      }

      await cart.save();

      // Populate cart for response
      await cart.populate([
        {
          path: "items.foodItem",
          select:
            "name price discountPrice image isAvailable quantityAvailable foodType spiceLevel category",
          populate: {
            path: "category",
            select: "name",
          },
        },
        {
          path: "hotel",
          select: "name",
        },
        {
          path: "branch",
          select: "name address",
        },
      ]);

      return new APIResponse(200, cart, "Cart updated successfully");
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to update cart item", [error.message]);
    }
  }

  /**
   * Remove item from cart
   */
  async removeItem(userId, itemId, hotelId, branchId) {
    try {
      const cart = await Cart.findOne({
        user: userId,
        hotel: hotelId,
        branch: branchId,
        status: "active",
      });

      if (!cart) {
        throw new APIError(404, "Cart not found");
      }

      if (!cart.items.id(itemId)) {
        throw new APIError(404, "Item not found in cart");
      }

      cart.removeItem(itemId);
      await cart.save();

      // Populate cart for response
      await cart.populate([
        {
          path: "items.foodItem",
          select:
            "name price discountPrice image isAvailable quantityAvailable foodType spiceLevel category",
          populate: {
            path: "category",
            select: "name",
          },
        },
        {
          path: "hotel",
          select: "name",
        },
        {
          path: "branch",
          select: "name address",
        },
      ]);

      return new APIResponse(200, cart, "Item removed from cart successfully");
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to remove item from cart", [
        error.message,
      ]);
    }
  }

  /**
   * Clear entire cart
   */
  async clearCart(userId, hotelId, branchId) {
    try {
      const cart = await Cart.findOne({
        user: userId,
        hotel: hotelId,
        branch: branchId,
        status: "active",
      });

      if (!cart) {
        return new APIResponse(
          200,
          {
            items: [],
            subtotal: 0,
            totalItems: 0,
            message: "Cart is already empty",
          },
          "Cart cleared successfully"
        );
      }

      cart.clearCart();
      await cart.save();

      return new APIResponse(
        200,
        {
          items: [],
          subtotal: 0,
          totalItems: 0,
          hotel: cart.hotel,
          branch: cart.branch,
        },
        "Cart cleared successfully"
      );
    } catch (error) {
      throw new APIError(500, "Failed to clear cart", [error.message]);
    }
  }

  /**
   * Validate cart items (availability, pricing, etc.)
   */
  async validateCart(userId, hotelId, branchId) {
    try {
      const cart = await Cart.findOne({
        user: userId,
        hotel: hotelId,
        branch: branchId,
        status: "active",
      });

      if (!cart) {
        throw new APIError(404, "Cart not found");
      }

      const validation = await cart.validateItems();

      if (validation.isValid) {
        await cart.save(); // Update validation status
        return new APIResponse(
          200,
          {
            isValid: true,
            cart: cart,
            message: "Cart is valid",
          },
          "Cart validation successful"
        );
      } else {
        await cart.save(); // Save validation errors
        return new APIResponse(
          200,
          {
            isValid: false,
            errors: validation.errors,
            cart: cart,
            message: "Cart has validation issues",
          },
          "Cart validation completed with issues"
        );
      }
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to validate cart", [error.message]);
    }
  }

  /**
   * Get cart summary (totals, item count, etc.)
   */
  async getCartSummary(userId, hotelId, branchId) {
    try {
      const cart = await Cart.findOne({
        user: userId,
        hotel: hotelId,
        branch: branchId,
        status: "active",
      }).select("subtotal totalItems items.quantity");

      if (!cart) {
        return new APIResponse(
          200,
          {
            subtotal: 0,
            totalItems: 0,
            itemCount: 0,
            isEmpty: true,
          },
          "Cart summary retrieved"
        );
      }

      return new APIResponse(
        200,
        {
          subtotal: cart.subtotal,
          totalItems: cart.totalItems,
          itemCount: cart.items.length,
          isEmpty: cart.items.length === 0,
        },
        "Cart summary retrieved successfully"
      );
    } catch (error) {
      throw new APIError(500, "Failed to get cart summary", [error.message]);
    }
  }

  /**
   * Update item customizations
   */
  async updateItemCustomizations(
    userId,
    itemId,
    customizations,
    hotelId,
    branchId
  ) {
    try {
      const cart = await Cart.findOne({
        user: userId,
        hotel: hotelId,
        branch: branchId,
        status: "active",
      });

      if (!cart) {
        throw new APIError(404, "Cart not found");
      }

      const cartItem = cart.items.id(itemId);
      if (!cartItem) {
        throw new APIError(404, "Item not found in cart");
      }

      // Update customizations
      cartItem.customizations = {
        ...cartItem.customizations,
        ...customizations,
      };

      // Recalculate total price with add-ons
      let totalPrice = cartItem.quantity * cartItem.price;
      if (customizations.addOns?.length) {
        const addOnPrice = customizations.addOns.reduce(
          (total, addOn) => total + addOn.price,
          0
        );
        totalPrice += addOnPrice * cartItem.quantity;
      }

      cartItem.totalPrice = totalPrice;
      cart.isValidated = false;

      await cart.save();

      // Populate cart for response
      await cart.populate([
        {
          path: "items.foodItem",
          select:
            "name price discountPrice image isAvailable quantityAvailable foodType spiceLevel category",
          populate: {
            path: "category",
            select: "name",
          },
        },
        {
          path: "hotel",
          select: "name",
        },
        {
          path: "branch",
          select: "name address",
        },
      ]);

      return new APIResponse(
        200,
        cart,
        "Item customizations updated successfully"
      );
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to update item customizations", [
        error.message,
      ]);
    }
  }

  /**
   * Get all user carts (across different hotels/branches)
   */
  async getAllUserCarts(userId) {
    try {
      const carts = await Cart.find({
        user: userId,
        status: "active",
        totalItems: { $gt: 0 }, // Only non-empty carts
      })
        .populate([
          {
            path: "hotel",
            select: "name image",
          },
          {
            path: "branch",
            select: "name address",
          },
        ])
        .select("hotel branch subtotal totalItems updatedAt");

      return new APIResponse(200, carts, "User carts retrieved successfully");
    } catch (error) {
      throw new APIError(500, "Failed to retrieve user carts", [error.message]);
    }
  }

  /**
   * Transfer cart to checkout (change status)
   */
  async transferToCheckout(userId, hotelId, branchId) {
    try {
      // Normalize branchId - convert empty string or null to null
      const normalizedBranchId = branchId && branchId !== "" ? branchId : null;

      // Try to find cart with exact branch match first
      let cart = await Cart.findOne({
        user: userId,
        hotel: hotelId,
        branch: normalizedBranchId,
        status: "active",
      });

      // If no cart found with specific branch, try to find cart with null branch for the same hotel
      if (!cart && normalizedBranchId !== null) {
        cart = await Cart.findOne({
          user: userId,
          hotel: hotelId,
          branch: null,
          status: "active",
        });

        // If found a cart with null branch, update it to use the provided branch
        if (cart) {
          cart.branch = normalizedBranchId;
          await cart.save();
        }
      }

      if (!cart) {
        throw new APIError(404, "Cart not found");
      }

      if (cart.items.length === 0) {
        throw new APIError(400, "Cannot checkout empty cart");
      }

      // Validate cart items before checkout
      const validation = await cart.validateItems();
      if (!validation.isValid) {
        throw new APIError(
          400,
          "Cart has validation issues. Please review your items.",
          validation.errors
        );
      }

      cart.status = "checkout";
      await cart.save();

      await cart.populate([
        {
          path: "items.foodItem",
          select:
            "name price discountPrice image isAvailable quantityAvailable foodType spiceLevel preparationTime category",
          populate: {
            path: "category",
            select: "name",
          },
        },
        {
          path: "hotel",
          select: "name address phone",
        },
        {
          path: "branch",
          select: "name address phone",
        },
      ]);

      return new APIResponse(
        200,
        cart,
        "Cart transferred to checkout successfully"
      );
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to transfer cart to checkout", [
        error.message,
      ]);
    }
  }

  /**
   * Enhanced checkout - Create order immediately with all details
   */
  async enhancedCheckout(userId, orderDetails) {
    try {
      const {
        hotelId,
        branchId,
        tableId,
        paymentMethod,
        customerNote,
        specialInstructions,
        coinsToUse: requestedCoins = 0,
        offerCode,
        estimatedDeliveryTime,
      } = orderDetails;

      // Import necessary models
      const { Order } = await import("../models/Order.model.js");
      const { User } = await import("../models/User.model.js");
      const { Table } = await import("../models/Table.model.js");
      const { Offer } = await import("../models/Offer.model.js");

      // Normalize branchId
      const normalizedBranchId = branchId && branchId !== "" ? branchId : null;

      // 1. Atomically find and update cart to prevent concurrent checkouts
      const cart = await Cart.findOneAndUpdate(
        {
          user: userId,
          hotel: hotelId,
          branch: normalizedBranchId,
          status: "active", // Only allow checkout if cart is still active
        },
        {
          status: "processing", // Immediately change status to prevent concurrent checkouts
          $set: { processingStartedAt: new Date() },
        },
        {
          new: true, // Return updated document
          runValidators: true,
        }
      ).populate([
        {
          path: "items.foodItem",
          select:
            "name price discountPrice effectivePrice image preparationTime category gstRate",
        },
        {
          path: "hotel",
          select: "name address phone",
        },
        {
          path: "branch",
          select: "name address phone",
        },
      ]);

      if (!cart || cart.items.length === 0) {
        throw new APIError(
          404,
          "Active cart not found, empty, or already being processed"
        );
      }

      // 2. Validate cart items
      const validation = await cart.validateItems();
      if (!validation.isValid) {
        throw new APIError(
          400,
          "Cart has validation issues",
          validation.errors
        );
      }

      // 3. Get user details for coin validation
      const user = await User.findById(userId).select("coins");
      if (!user) {
        throw new APIError(404, "User not found");
      }

      // 4. Validate coins usage with admin limits
      let coinAdjustmentMessage = null;
      let coinsToUse = requestedCoins; // Create mutable variable

      if (requestedCoins > 0) {
        // First check if user has enough coins
        if (requestedCoins > user.coins) {
          throw new APIError(
            400,
            `Insufficient coins available. You have ${user.coins} coins but trying to use ${requestedCoins} coins.`
          );
        }

        // Get admin's coin settings to check percentage limits
        const hotel = await Hotel.findById(hotelId).select("createdBy");
        if (!hotel) {
          throw new APIError(404, "Hotel not found");
        }

        const coinSettings = await coinService.getCoinSettings(hotel.createdBy);
        if (coinSettings) {
          const maxAllowedCoins = Math.floor(
            (user.coins * coinSettings.maxCoinUsagePercent) / 100
          );

          if (requestedCoins > maxAllowedCoins) {
            // User requested more than admin allows, adjust to maximum allowed
            coinsToUse = maxAllowedCoins;
            coinAdjustmentMessage = `You requested to use ${requestedCoins} coins, but admin limits coin usage to ${coinSettings.maxCoinUsagePercent}% of your balance. Using maximum allowed ${maxAllowedCoins} coins instead.`;
          }
        }
      }

      // 5. Get table details
      const table = await Table.findById(tableId).select(
        "tableNumber capacity status"
      );
      if (!table) {
        throw new APIError(404, "Table not found");
      }

      // 6. Calculate order totals
      let subtotal = 0;
      const orderItems = cart.items.map((item) => {
        const itemPrice = item.foodItem.effectivePrice || item.foodItem.price;
        const itemTotal = itemPrice * item.quantity;
        subtotal += itemTotal;

        // Validate gstRate exists
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
        };
      });

      // 7. Apply offer if provided
      let offerDiscount = 0;
      let appliedOffer = null;
      if (offerCode) {
        const now = new Date();

        // Build flexible query based on offer scope
        const baseQuery = {
          code: offerCode,
          isActive: true,
          startDate: { $lte: now },
          expiryDate: { $gte: now },
        };

        // Build $or conditions for different offer scopes
        const orConditions = [
          // Universal offers (applicable to all hotels/branches)
          { applicableFor: "all" },
          // Hotel-specific offers
          {
            applicableFor: "hotel",
            hotelId: hotelId,
          },
        ];

        // If branchId is provided, also check for branch-specific offers
        if (normalizedBranchId) {
          orConditions.push({
            applicableFor: "branch",
            hotelId: hotelId,
            branchId: normalizedBranchId,
          });
        } else {
          // No branchId provided - allow any branch offers under this hotel
          orConditions.push({
            applicableFor: "branch",
            hotelId: hotelId,
          });
        }

        const offer = await Offer.findOne({
          ...baseQuery,
          $or: orConditions,
        });

        if (!offer) {
          throw new APIError(400, "Invalid or expired offer code");
        }

        // Check minimum order value
        if (subtotal < (offer.minOrderValue || 0)) {
          throw new APIError(
            400,
            `Minimum order value of ₹${offer.minOrderValue} required for this offer`
          );
        }

        // Calculate discount
        if (offer.discountType === "percent") {
          offerDiscount = Math.min(
            (subtotal * offer.discountValue) / 100,
            offer.maxDiscountAmount || subtotal
          );
        } else {
          offerDiscount = Math.min(offer.discountValue, subtotal);
        }

        appliedOffer = {
          offerId: offer._id,
          code: offer.code,
          title: offer.title,
          discountAmount: offerDiscount,
        };
      }

      // 8. Calculate coin discount with proper validation
      let coinDiscount = 0;
      let actualCoinsUsed = 0;
      if (coinsToUse > 0) {
        try {
          const coinApplication = await coinService.applyCoinsToOrder(
            userId,
            coinsToUse,
            subtotal - offerDiscount, // Order value after offer discount
            hotelId,
            true // Skip validation as we've already done it above
          );

          // Use the actual coins used for discount calculation (1 coin = ₹1)
          actualCoinsUsed = coinApplication.coinsUsed;
          coinDiscount = actualCoinsUsed; // Since 1 coin = ₹1, discount equals coins used
        } catch (error) {
          // If coin service validation fails, fall back to simple calculation
          // This ensures order doesn't fail completely
          coinDiscount = Math.min(coinsToUse, subtotal - offerDiscount);
        }
      }

      // 9. Calculate final amounts with per-item GST
      const baseAmount = Math.max(0, subtotal - offerDiscount - coinDiscount);

      // Calculate proportional base amount for each item (after discounts)
      const discountRatio = baseAmount / subtotal; // Ratio of amount after discounts to original subtotal

      // Calculate GST for each item and track details
      let totalTaxes = 0;
      const itemTaxDetails = orderItems.map((item) => {
        const itemBaseAmount = item.totalPrice * discountRatio; // Apply discount proportion
        const itemGstAmount = (itemBaseAmount * item.gstRate) / 100;
        totalTaxes += itemGstAmount;

        return {
          itemName: item.foodItemName,
          baseAmount: itemBaseAmount,
          gstRate: item.gstRate,
          gstAmount: itemGstAmount,
        };
      });

      const taxes = Math.max(0, Math.round(totalTaxes * 100) / 100); // Round to 2 decimals
      const serviceCharge = 0; // No service charge for now
      const finalTotal = Math.max(0, baseAmount + taxes + serviceCharge); // Ensure final total is not negative

      // Update order items with GST amounts
      orderItems.forEach((item, index) => {
        item.gstAmount =
          Math.round(itemTaxDetails[index].gstAmount * 100) / 100;
      });

      // 10. Calculate estimated time
      const estimatedTime =
        Math.max(
          ...orderItems.map((item) => item.foodItem.preparationTime || 15)
        ) + 5; // Add 5 minutes buffer

      // 11. Create order
      const orderData = {
        user: userId,
        hotel: hotelId,
        branch: normalizedBranchId,
        table: tableId,
        tableNumber: table.tableNumber,
        items: orderItems,
        subtotal,
        taxes: Math.max(0, taxes), // Ensure taxes is not negative
        serviceCharge,
        totalPrice: Math.max(0, finalTotal), // Ensure total price is not negative
        originalPrice: subtotal,
        offerDiscount,
        appliedOffer,
        coinDiscount,
        coinsUsed: actualCoinsUsed, // Actual number of coins used
        payment: {
          paymentMethod,
          paymentStatus: "pending", // Always start as pending
        },
        status: "pending",
        estimatedTime,
        specialInstructions: specialInstructions || "",
        customerNote: customerNote || "",
        orderSource: "mobile_app",
        rewardCoins: Math.max(0, Math.floor(finalTotal * 0.1)), // 10% cashback in coins, minimum 0
        rewardPointsUsed: 0,
      };

      const order = new Order(orderData);
      await order.save();

      // 12. Populate order details for response
      await order.populate([
        {
          path: "user",
          select: "name email phone coins",
        },
        {
          path: "hotel",
          select: "name hotelId",
        },
        {
          path: "branch",
          select: "name branchId location",
        },
        {
          path: "table",
          select: "tableNumber capacity identifier qrScanData",
        },
      ]);

      // 12.5. Staff assignment will happen AFTER payment confirmation
      // No longer assigning staff during checkout - prevents assigning staff to unpaid orders

      // 13. Handle cart based on payment method
      if (paymentMethod === "cash") {
        // For cash orders: Complete order immediately, clear cart, deduct coins
        cart.items = [];
        cart.status = "completed";
        cart.completedAt = new Date();
        cart.checkoutOrderId = order._id;
        await cart.save();

        // Deduct coins immediately for cash orders since no gateway processing
        if (actualCoinsUsed > 0) {
          // Create coin usage transaction record
          await CoinTransaction.createTransaction({
            userId,
            type: "used",
            amount: -actualCoinsUsed,
            orderId: order._id,
            description: `Coins used for order payment (₹${coinDiscount} discount)`,
            metadata: {
              orderValue: subtotal - offerDiscount,
              discount: coinDiscount,
              coinValue: 1,
            },
          });

          // Update user's coin balance
          await User.findByIdAndUpdate(userId, {
            $inc: { coins: -actualCoinsUsed },
          });
        }

        // Add reward coins immediately for cash orders
        if (order.rewardCoins > 0) {
          await User.findByIdAndUpdate(userId, {
            $inc: { coins: order.rewardCoins },
          });
        }

        // Update user's coin balance in response
        const updatedUser = await User.findById(userId).select("coins");
        order.user.coins = updatedUser.coins;
      } else {
        // For digital payments: Keep cart locked until payment success
        cart.status = "checkout";
        cart.checkoutOrderId = order._id;
        await cart.save();
      }

      // 14. Return order with detailed pricing breakdown
      const responseData = {
        order,
        checkout: {
          cartId: cart._id,
          paymentRequired: paymentMethod !== "cash",
          orderConfirmed: paymentMethod === "cash",
          message:
            paymentMethod === "cash"
              ? "Order confirmed! Payment on delivery. Your cart has been cleared."
              : "Order created successfully. Please complete payment to confirm.",
        },
      };

      // Add coin adjustment message if coins were adjusted
      if (coinAdjustmentMessage) {
        responseData.coinAdjustment = {
          message: coinAdjustmentMessage,
          adjustedCoinsUsed: coinsToUse,
        };
      }

      return new APIResponse(
        201,
        {
          ...responseData,
          pricingBreakdown: {
            step1_itemsSubtotal: {
              description: "Total price of all items",
              amount: subtotal,
              currency: "₹",
            },
            step2_afterOfferDiscount: {
              description: "After applying offer discount",
              offerApplied: appliedOffer,
              discountAmount: offerDiscount,
              amountAfterOffer: subtotal - offerDiscount,
              currency: "₹",
            },
            step3_afterCoinDiscount: {
              description: "After applying coin discount (1 coin = ₹1)",
              coinsAvailable: order.user.coins, // Show user's current coin balance
              coinsUsed: actualCoinsUsed, // Number of coins actually used
              coinDiscountAmount: coinDiscount, // Discount amount in rupees (should equal coinsUsed since 1 coin = ₹1)
              amountAfterCoins: Math.max(
                0,
                subtotal - offerDiscount - coinDiscount
              ),
              currency: "₹",
            },
            step4_taxesAndCharges: {
              description: "Taxes and service charges",
              baseAmount: Math.max(0, subtotal - offerDiscount - coinDiscount),
              gstBreakdown: itemTaxDetails.map((item) => ({
                item: item.itemName,
                gstRate: `${item.gstRate}%`,
                gstAmount: Math.round(item.gstAmount * 100) / 100,
              })),
              totalGst: taxes,
              cgst: Math.round(taxes * 0.5 * 100) / 100, // 50% of total GST
              sgst: Math.round(taxes * 0.5 * 100) / 100, // 50% of total GST
              serviceCharge: serviceCharge,
              totalTaxesAndCharges: taxes + serviceCharge,
              currency: "₹",
            },
            step5_finalTotal: {
              description: "Final amount to be paid",
              calculation: `₹${subtotal} - ₹${offerDiscount} - ₹${coinDiscount} + ₹${taxes.toFixed(
                2
              )} + ₹${serviceCharge}`,
              finalAmount: finalTotal,
              currency: "₹",
            },
            summary: {
              originalAmount: subtotal,
              totalSavings: offerDiscount + coinDiscount,
              offerSavings: offerDiscount,
              coinSavings: coinDiscount,
              taxesAndCharges: taxes + serviceCharge,
              amountToPay: finalTotal,
              currency: "₹",
            },
          },
        },
        paymentMethod === "cash"
          ? "Order confirmed! Payment on delivery."
          : "Order created successfully. Complete payment to confirm."
      );
    } catch (error) {
      // Reset cart status if checkout fails
      try {
        if (cart && cart._id) {
          await Cart.findByIdAndUpdate(cart._id, {
            status: "active",
            $unset: { processingStartedAt: 1 },
          });
        }
      } catch (resetError) {
        logger.error(
          "Failed to reset cart status after checkout error:",
          resetError
        );
      }

      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to process checkout", [error.message]);
    }
  }

  /**
   * Get cart by checkout order ID
   * @param {String} orderId - Order ID
   * @returns {Object} Cart object
   */
  async getCartByOrderId(orderId) {
    try {
      const cart = await Cart.findOne({
        checkoutOrderId: orderId,
        status: "checkout",
      }).populate([
        {
          path: "items.foodItem",
          select: "name price image category",
        },
        {
          path: "user",
          select: "name email phone",
        },
      ]);

      return cart;
    } catch (error) {
      logger.error("Error getting cart by order ID:", error);
      throw new APIError(500, "Failed to get cart");
    }
  }

  /**
   * Restore cart to active status (used when payment fails)
   * @param {String} orderId - Order ID
   * @returns {Object} API Response
   */
  async restoreCartAfterPaymentFailure(orderId) {
    try {
      const cart = await Cart.findOne({
        checkoutOrderId: orderId,
        status: "checkout",
      });

      if (!cart) {
        return new APIResponse(404, null, "Cart not found for the order");
      }

      // Restore cart to active status
      cart.status = "active";
      cart.checkoutOrderId = undefined;
      await cart.save();

      logger.info("Cart restored after payment failure", {
        cartId: cart._id,
        orderId: orderId,
        itemCount: cart.items.length,
      });

      return new APIResponse(
        200,
        { cart },
        "Cart restored successfully. You can modify your order and try again."
      );
    } catch (error) {
      logger.error("Error restoring cart after payment failure:", error);
      throw new APIError(500, "Failed to restore cart");
    }
  }
}

export default new CartService();
