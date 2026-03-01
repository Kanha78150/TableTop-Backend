import { Order } from "../../models/Order.model.js";
import { Cart } from "../../models/Cart.model.js";
import { CoinTransaction } from "../../models/CoinTransaction.model.js";
import { Transaction } from "../../models/Transaction.model.js";
import { logger } from "../../utils/logger.js";

/**
 * Clear cart and process coins after successful payment
 * @param {Object} order - The order object
 */
export async function clearCartAfterPayment(order) {
  try {
    logger.info(
      "Processing cart clearing and coin transactions after payment",
      {
        orderId: order._id,
        userId: order.user._id || order.user,
        coinsUsed: order.coinsUsed || 0,
        rewardCoins: order.rewardCoins || 0,
      }
    );

    const userId = order.user._id || order.user;

    // 1. Find and clear the cart
    const cart = await Cart.findOne({
      user: userId,
      checkoutOrderId: order._id,
      status: "checkout",
    });

    if (cart) {
      cart.items = [];
      cart.status = "completed";
      cart.completedAt = new Date();
      await cart.save();
      logger.info("Cart cleared successfully after payment", {
        cartId: cart._id,
        orderId: order._id,
        userId,
      });
    } else {
      logger.warn("Cart not found for order after payment", {
        orderId: order._id,
        userId,
      });
    }

    // 2. Deduct coins if used (only if not already deducted)
    if (order.coinsUsed > 0) {
      const existingCoinTransaction = await CoinTransaction.findOne({
        userId,
        orderId: order._id,
        type: "used",
      });

      if (!existingCoinTransaction) {
        await CoinTransaction.createTransaction({
          userId,
          type: "used",
          amount: -order.coinsUsed,
          orderId: order._id,
          description: `Coins used for Order #${order._id}`,
          metadata: {
            orderTotal: order.totalPrice,
            coinDiscount: order.coinDiscount,
            coinValue: 1,
          },
        });
        logger.info("Coins deducted successfully after payment", {
          userId,
          orderId: order._id,
          coinsDeducted: order.coinsUsed,
        });
      } else {
        logger.info("Coins already deducted for order", {
          orderId: order._id,
          userId,
        });
      }
    }

    // 3. Add reward coins (only if not already added)
    if (order.rewardCoins > 0) {
      const existingRewardTransaction = await CoinTransaction.findOne({
        userId,
        orderId: order._id,
        type: "earned",
      });

      if (!existingRewardTransaction) {
        await CoinTransaction.createTransaction({
          userId,
          type: "earned",
          amount: order.rewardCoins,
          orderId: order._id,
          description: `Reward coins for Order #${order._id}`,
          metadata: {
            orderTotal: order.totalPrice,
            rewardRate: 0.01,
          },
        });
        logger.info("Reward coins added successfully after payment", {
          userId,
          orderId: order._id,
          rewardCoins: order.rewardCoins,
        });
      } else {
        logger.info("Reward coins already added for order", {
          orderId: order._id,
          userId,
        });
      }
    }

    logger.info("Cart clearing and coin processing completed successfully", {
      orderId: order._id,
      userId,
    });
  } catch (error) {
    logger.error("Error in clearCartAfterPayment", {
      orderId: order._id,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Restore cart to active status when payment fails or is cancelled
 * @param {String} orderId - The order ID
 */
export async function restoreCartAfterPaymentFailure(orderId) {
  try {
    logger.info("Restoring cart after payment failure", { orderId });

    const order = await Order.findById(orderId);
    if (!order) {
      logger.warn("Order not found for cart restoration", { orderId });
      return;
    }

    const userId = order.user._id || order.user;

    const cart = await Cart.findOne({
      user: userId,
      checkoutOrderId: orderId,
      status: "checkout",
    });

    if (cart) {
      cart.status = "active";
      cart.checkoutOrderId = undefined;
      await cart.save();
      logger.info("Cart restored successfully after payment failure", {
        cartId: cart._id,
        orderId,
        userId,
        itemCount: cart.items.length,
      });
    } else {
      logger.warn("Cart not found for restoration after payment failure", {
        orderId,
        userId,
      });
    }
  } catch (error) {
    logger.error("Error in restoreCartAfterPaymentFailure", {
      orderId,
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Create Transaction record for any payment outcome (success, failed, cancelled)
 * @param {Object} order - The order object
 * @returns {Object} Created transaction
 */
export async function createTransactionRecord(order) {
  try {
    const existingTransaction = await Transaction.findOne({
      order: order._id,
    });

    if (existingTransaction) {
      const orderPaymentStatus = order.payment?.paymentStatus;
      if (
        existingTransaction.status === "pending" &&
        (orderPaymentStatus === "paid" ||
          orderPaymentStatus === "failed" ||
          orderPaymentStatus === "refunded")
      ) {
        const newStatus =
          orderPaymentStatus === "paid" ? "success" : orderPaymentStatus;
        existingTransaction.status = newStatus;
        await existingTransaction.save();
        logger.info("Transaction record updated", {
          orderId: order._id,
          oldStatus: "pending",
          newStatus,
        });
      }
      return existingTransaction;
    }

    const statusMap = {
      paid: "success",
      failed: "failed",
      refunded: "refunded",
      cancelled: "failed",
      pending: "pending",
    };
    const transactionStatus =
      statusMap[order.payment?.paymentStatus] || "pending";

    const transaction = await Transaction.create({
      user: order.user,
      order: order._id,
      hotel: order.hotel,
      branch: order.branch,
      amount: order.totalPrice,
      paymentMethod: order.payment?.paymentMethod || "cash",
      provider:
        order.payment?.provider ||
        (order.payment?.paymentMethod === "cash" ? "cash" : "razorpay"),
      status: transactionStatus,
      transactionId: order.payment?.transactionId || order.payment?.paymentId,
    });

    logger.info("Transaction record created successfully", {
      orderId: order._id,
      transactionId: transaction._id,
      amount: transaction.amount,
    });

    return transaction;
  } catch (error) {
    logger.error("Error creating transaction record", {
      orderId: order._id,
      error: error.message,
      stack: error.stack,
    });
    return null;
  }
}
