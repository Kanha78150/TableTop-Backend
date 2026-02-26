// src/controllers/admin/order.controller.js - Admin Order Management Controller
import { Order } from "../../models/Order.model.js";
import { User } from "../../models/User.model.js";
import orderService from "../../services/order.service.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import { getIO, isIOInitialized } from "../../utils/socketService.js";
import { sendReviewInvitationEmail } from "../../utils/emailService.js";

/**
 * Confirm cash payment for an order
 * PUT /api/v1/admin/orders/:orderId/confirm-payment
 * @access Admin (can confirm payment for any order in their hotel)
 */
export const confirmCashPayment = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const adminId = req.admin._id;

    // Validate order ID
    if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid order ID"));
    }

    // Check if order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return next(new APIError(404, "Order not found"));
    }

    // Use the shared service to confirm payment
    const updatedOrder = await orderService.confirmCashPayment(
      orderId,
      adminId,
      "admin"
    );

    // Send review invitation email if order is already completed and email not sent yet
    if (
      updatedOrder.status === "completed" &&
      !updatedOrder.reviewInviteSentAt
    ) {
      try {
        const user = await User.findById(
          updatedOrder.user._id || updatedOrder.user
        );
        if (user && user.email) {
          const orderWithDetails = await Order.findById(updatedOrder._id)
            .populate("hotel", "name")
            .populate("branch", "name");

          await sendReviewInvitationEmail(orderWithDetails, user);

          Order.findByIdAndUpdate(orderId, {
            reviewInviteSentAt: new Date(),
          }).catch((err) =>
            logger.error("Failed to update reviewInviteSentAt:", err)
          );

          logger.info(
            `Review invitation email sent after cash payment confirmation for order ${orderId}`
          );
        }
      } catch (emailError) {
        logger.error(
          `Failed to send review invitation email for order ${orderId}:`,
          emailError
        );
      }
    }

    // Emit socket notification to user
    try {
      if (isIOInitialized()) {
        const io = getIO();
        const userId = updatedOrder.user._id || updatedOrder.user;
        io.to(`user_${userId}`).emit("payment:confirmed", {
          orderId: updatedOrder._id,
          paymentStatus: "paid",
          paymentMethod: "cash",
          confirmedBy: "admin",
          message: "Your cash payment has been confirmed",
        });
      }
    } catch (socketError) {
      logger.error("Socket notification error:", socketError);
    }

    logger.info(
      `Cash payment confirmed for order ${orderId} by admin ${adminId}`
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { order: updatedOrder },
          "Cash payment confirmed successfully"
        )
      );
  } catch (error) {
    logger.error("Error confirming cash payment:", error);
    next(error);
  }
};

export default {
  confirmCashPayment,
};
