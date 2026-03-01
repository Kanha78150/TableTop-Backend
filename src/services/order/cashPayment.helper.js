/**
 * Cash-payment post-processing helpers shared by admin, manager & staff controllers.
 *
 * Handles the review-invitation email and socket notification that are
 * copy-pasted across all three confirmCashPayment handlers.
 */

import { Order } from "../../models/Order.model.js";
import { User } from "../../models/User.model.js";
import { logger } from "../../utils/logger.js";
import { getIO, isIOInitialized } from "../../utils/socketService.js";
import { sendReviewInvitationEmail } from "../../utils/emailService.js";

/**
 * Send review invitation email after cash-payment confirmation
 * (only if order is already completed and email not sent yet).
 *
 * @param {Object} updatedOrder – The order document returned by orderService.confirmCashPayment
 * @param {string} orderId – The order's _id (string)
 */
export async function sendReviewEmailIfReady(updatedOrder, orderId) {
  if (updatedOrder.status !== "completed" || updatedOrder.reviewInviteSentAt) {
    return;
  }

  try {
    const user = await User.findById(
      updatedOrder.user._id || updatedOrder.user
    );
    if (!user?.email) return;

    const orderWithDetails = await Order.findById(updatedOrder._id)
      .populate("hotel", "name")
      .populate("branch", "name");

    await sendReviewInvitationEmail(orderWithDetails, user);

    // Mark email as sent (fire-and-forget)
    Order.findByIdAndUpdate(orderId, { reviewInviteSentAt: new Date() }).catch(
      (err) => logger.error("Failed to update reviewInviteSentAt:", err)
    );

    logger.info(
      `Review invitation email sent after cash payment confirmation for order ${orderId}`
    );
  } catch (emailError) {
    logger.error(
      `Failed to send review invitation email for order ${orderId}:`,
      emailError
    );
  }
}

/**
 * Emit socket notification after cash-payment confirmation.
 *
 * @param {Object} updatedOrder – The order document
 * @param {string} confirmedBy – "admin" | "manager" | "staff"
 */
export function emitPaymentConfirmed(updatedOrder, confirmedBy) {
  try {
    if (!isIOInitialized()) return;

    const io = getIO();
    const userId = updatedOrder.user._id || updatedOrder.user;
    io.to(`user_${userId}`).emit("payment:confirmed", {
      orderId: updatedOrder._id,
      paymentStatus: "paid",
      paymentMethod: "cash",
      confirmedBy,
      message: "Your cash payment has been confirmed",
    });
  } catch (socketError) {
    logger.error("Socket notification error:", socketError);
  }
}

export default { sendReviewEmailIfReady, emitPaymentConfirmed };
