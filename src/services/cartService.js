import { Cart } from "../models/Cart.model.js";
import { FoodItem } from "../models/FoodItem.model.js";
import { Hotel } from "../models/Hotel.model.js";
import { Branch } from "../models/Branch.model.js";
import { APIError } from "../utils/APIError.js";
import { APIResponse } from "../utils/APIResponse.js";

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
        // Add debug information
        console.log("Hotel validation failed:", {
          hotelExists: !!foodItem.hotel,
          hotelStatus: foodItem.hotel?.status,
          hotelName: foodItem.hotel?.name,
        });
        throw new APIError(400, "Hotel is currently inactive");
      }

      // Check branch status only if branch is provided and food item has a branch
      if (branchId && branchId !== "" && branchId !== null) {
        if (!foodItem.branch?.status || foodItem.branch.status !== "active") {
          // Add debug information
          console.log("Branch validation failed:", {
            branchExists: !!foodItem.branch,
            branchStatus: foodItem.branch?.status,
            branchName: foodItem.branch?.name,
          });
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
   */
  async getCart(userId, hotelId, branchId) {
    try {
      // Normalize branchId - convert empty string or null to null
      const normalizedBranchId = branchId && branchId !== "" ? branchId : null;

      const cart = await Cart.findOne({
        user: userId,
        hotel: hotelId,
        branch: normalizedBranchId,
        status: "active",
      }).populate([
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
          },
          "Cart is empty"
        );
      }

      return new APIResponse(200, cart, "Cart retrieved successfully");
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
        coinsToUse = 0,
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

      // 1. Get user's active cart
      const cart = await Cart.findOne({
        user: userId,
        hotel: hotelId,
        branch: normalizedBranchId,
        status: "active",
      }).populate([
        {
          path: "items.foodItem",
          select:
            "name price discountPrice effectivePrice image preparationTime category",
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
        throw new APIError(404, "Active cart not found or empty");
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

      // 4. Validate coins usage
      if (coinsToUse > 0 && coinsToUse > user.coins) {
        throw new APIError(400, "Insufficient coins available");
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

        return {
          foodItem: item.foodItem._id,
          foodItemName: item.foodItem.name,
          quantity: item.quantity,
          price: itemPrice,
          totalPrice: itemTotal,
          customizations: item.customizations,
          foodType: item.foodItem.foodType || "veg",
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

      // 8. Calculate coin discount (1 coin = 1 rupee)
      const coinDiscount = Math.min(coinsToUse, subtotal - offerDiscount);

      // 9. Calculate final amounts
      const taxes = (subtotal - offerDiscount - coinDiscount) * 0.18; // 18% GST
      const serviceCharge = 0; // No service charge for now
      const finalTotal =
        subtotal - offerDiscount - coinDiscount + taxes + serviceCharge;

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
        taxes,
        serviceCharge,
        totalPrice: finalTotal,
        originalPrice: subtotal,
        offerDiscount,
        appliedOffer,
        coinDiscount,
        coinsUsed: coinDiscount, // Actual coins used
        payment: {
          paymentMethod,
          paymentStatus: "pending", // Always start as pending
        },
        status: "pending",
        estimatedTime,
        specialInstructions: specialInstructions || "",
        customerNote: customerNote || "",
        orderSource: "mobile_app",
        rewardCoins: Math.floor(finalTotal * 0.1), // 10% cashback in coins
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

      // 13. Handle cart based on payment method
      if (paymentMethod === "cash") {
        // For cash orders: Complete order immediately, clear cart, deduct coins
        cart.items = [];
        cart.status = "completed";
        cart.completedAt = new Date();
        cart.checkoutOrderId = order._id;
        await cart.save();

        // Deduct coins immediately for cash orders since no gateway processing
        if (coinDiscount > 0) {
          await User.findByIdAndUpdate(userId, {
            $inc: { coins: -coinDiscount },
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
      return new APIResponse(
        201,
        {
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
              coinsAvailable: order.user.coins + coinDiscount, // Show coins before usage
              coinsUsed: coinDiscount,
              coinDiscountAmount: coinDiscount,
              amountAfterCoins: subtotal - offerDiscount - coinDiscount,
              currency: "₹",
            },
            step4_taxesAndCharges: {
              description: "Taxes and service charges",
              baseAmount: subtotal - offerDiscount - coinDiscount,
              gstRate: "18%",
              gstAmount: taxes,
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
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to process checkout", [error.message]);
    }
  }
}

export default new CartService();
