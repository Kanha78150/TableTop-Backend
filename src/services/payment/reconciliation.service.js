import { Order } from "../../models/Order.model.js";
import { AdminSubscription } from "../../models/AdminSubscription.model.js";
import { paymentService } from "./payment.service.js";
import { paymentLogger } from "../../utils/paymentLogger.js";
import { logger } from "../../utils/logger.js";
import { APIError } from "../../utils/APIError.js";

/**
 * Payment Reconciliation Utility
 * Matches Razorpay transactions with database records
 * Identifies discrepancies and generates reconciliation reports
 */

class PaymentReconciliationService {
  /**
   * Reconcile payments for a given date range
   * @param {Object} options - Reconciliation options
   * @returns {Object} Reconciliation report
   */
  async reconcilePayments(options = {}) {
    try {
      const {
        startDate,
        endDate,
        type = "all", // 'order', 'subscription', 'all'
        autoFix = false,
      } = options;

      logger.info("Starting payment reconciliation", {
        startDate,
        endDate,
        type,
        autoFix,
      });

      const report = {
        dateRange: { start: startDate, end: endDate },
        type,
        totalRecords: 0,
        matched: 0,
        unmatched: 0,
        discrepancies: [],
        summary: {},
        generatedAt: new Date(),
      };

      // Reconcile based on type
      if (type === "order" || type === "all") {
        const orderReport = await this.reconcileOrders({
          startDate,
          endDate,
          autoFix,
        });
        this.mergeReports(report, orderReport, "orders");
      }

      if (type === "subscription" || type === "all") {
        const subscriptionReport = await this.reconcileSubscriptions({
          startDate,
          endDate,
          autoFix,
        });
        this.mergeReports(report, subscriptionReport, "subscriptions");
      }

      // Calculate overall statistics
      report.matchRate =
        report.totalRecords > 0
          ? ((report.matched / report.totalRecords) * 100).toFixed(2)
          : 0;

      // Log reconciliation
      paymentLogger.logReconciliation({
        dateRange: report.dateRange,
        totalOrders: report.totalRecords,
        matchedPayments: report.matched,
        unmatchedPayments: report.unmatched,
        discrepancies: report.discrepancies.length,
      });

      logger.info("Payment reconciliation completed", {
        totalRecords: report.totalRecords,
        matched: report.matched,
        unmatched: report.unmatched,
        matchRate: report.matchRate,
      });

      return report;
    } catch (error) {
      logger.error("Payment reconciliation failed", {
        error: error.message,
        stack: error.stack,
      });
      throw new APIError(500, "Payment reconciliation failed");
    }
  }

  /**
   * Reconcile order payments
   */
  async reconcileOrders(options) {
    try {
      const { startDate, endDate, autoFix } = options;

      // Build query
      const query = {
        "payment.provider": { $in: ["razorpay"] },
        "payment.paymentStatus": { $in: ["paid", "pending", "failed"] },
      };

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const orders = await Order.find(query).lean();

      logger.info(`Reconciling ${orders.length} order payments`);

      const report = {
        totalRecords: orders.length,
        matched: 0,
        unmatched: 0,
        discrepancies: [],
      };

      for (const order of orders) {
        try {
          const reconciliation = await this.reconcileOrderPayment(
            order,
            autoFix
          );

          if (reconciliation.matched) {
            report.matched++;
          } else {
            report.unmatched++;
            report.discrepancies.push(reconciliation);
          }
        } catch (error) {
          logger.error("Error reconciling order payment", {
            orderId: order._id,
            error: error.message,
          });

          report.unmatched++;
          report.discrepancies.push({
            type: "order",
            id: order._id,
            matched: false,
            issue: "reconciliation_error",
            error: error.message,
          });
        }
      }

      return report;
    } catch (error) {
      logger.error("Order reconciliation failed", { error: error.message });
      throw error;
    }
  }

  /**
   * Reconcile individual order payment
   */
  async reconcileOrderPayment(order, autoFix = false) {
    const reconciliation = {
      type: "order",
      id: order._id,
      orderId: order._id,
      transactionId: order.payment?.paymentId || order.payment?.transactionId,
      razorpayOrderId:
        order.payment?.gatewayOrderId || order.payment?.razorpayOrderId,
      razorpayPaymentId:
        order.payment?.paymentId || order.payment?.razorpayPaymentId,
      dbStatus: order.payment?.paymentStatus,
      dbAmount: order.totalPrice,
      matched: false,
      issues: [],
    };

    // Check if payment ID exists
    const paymentId =
      order.payment?.paymentId || order.payment?.razorpayPaymentId;
    if (!paymentId) {
      reconciliation.issues.push("missing_payment_id");

      // If order is marked as paid but no payment ID, it's suspicious
      if (order.payment?.paymentStatus === "paid") {
        reconciliation.issues.push("paid_without_payment_id");
      }

      return reconciliation;
    }

    try {
      // Fetch payment details from Razorpay
      const razorpayPayment =
        await paymentService.razorpay.payments.fetch(paymentId);

      reconciliation.razorpayStatus = razorpayPayment.status;
      reconciliation.razorpayAmount = razorpayPayment.amount / 100;
      reconciliation.razorpayMethod = razorpayPayment.method;

      // Check status match
      if (
        !this.statusMatches(order.payment.paymentStatus, razorpayPayment.status)
      ) {
        reconciliation.issues.push("status_mismatch");

        if (autoFix) {
          // Update order status to match Razorpay
          const updatedStatus = this.mapRazorpayStatus(razorpayPayment.status);
          await Order.findByIdAndUpdate(order._id, {
            "payment.paymentStatus": updatedStatus,
          });
          reconciliation.fixed = true;
          reconciliation.fixedStatus = updatedStatus;
        }
      }

      // Check amount match (allow 1 rupee tolerance for rounding)
      if (Math.abs(order.totalPrice - razorpayPayment.amount / 100) > 1) {
        reconciliation.issues.push("amount_mismatch");
      }

      // Check order ID match
      const gatewayOrderId =
        order.payment.gatewayOrderId || order.payment.razorpayOrderId;
      if (gatewayOrderId && razorpayPayment.order_id !== gatewayOrderId) {
        reconciliation.issues.push("order_id_mismatch");
      }

      // If no issues, mark as matched
      if (reconciliation.issues.length === 0) {
        reconciliation.matched = true;
      }
    } catch (error) {
      if (
        error.statusCode === 400 ||
        error.error?.code === "BAD_REQUEST_ERROR"
      ) {
        reconciliation.issues.push("payment_not_found_in_razorpay");
      } else {
        reconciliation.issues.push("razorpay_api_error");
        reconciliation.error = error.message;
      }
    }

    return reconciliation;
  }

  /**
   * Reconcile subscription payments
   */
  async reconcileSubscriptions(options) {
    try {
      const { startDate, endDate, autoFix } = options;

      // Build query
      const query = {
        paymentHistory: {
          $exists: true,
          $ne: [],
        },
      };

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const subscriptions = await AdminSubscription.find(query).lean();

      logger.info(`Reconciling ${subscriptions.length} subscription payments`);

      const report = {
        totalRecords: 0,
        matched: 0,
        unmatched: 0,
        discrepancies: [],
      };

      for (const subscription of subscriptions) {
        // Reconcile each payment in history
        for (const payment of subscription.paymentHistory) {
          if (payment.status === "success" && payment.razorpayPaymentId) {
            report.totalRecords++;

            try {
              const reconciliation = await this.reconcileSubscriptionPayment(
                subscription,
                payment,
                autoFix
              );

              if (reconciliation.matched) {
                report.matched++;
              } else {
                report.unmatched++;
                report.discrepancies.push(reconciliation);
              }
            } catch (error) {
              logger.error("Error reconciling subscription payment", {
                subscriptionId: subscription._id,
                paymentId: payment._id,
                error: error.message,
              });

              report.unmatched++;
              report.discrepancies.push({
                type: "subscription",
                id: subscription._id,
                paymentId: payment._id,
                matched: false,
                issue: "reconciliation_error",
                error: error.message,
              });
            }
          }
        }
      }

      return report;
    } catch (error) {
      logger.error("Subscription reconciliation failed", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Reconcile individual subscription payment
   */
  async reconcileSubscriptionPayment(subscription, payment, autoFix = false) {
    const reconciliation = {
      type: "subscription",
      id: subscription._id,
      subscriptionId: subscription._id,
      paymentId: payment._id,
      razorpayPaymentId: payment.razorpayPaymentId,
      dbStatus: payment.status,
      dbAmount: payment.amount,
      matched: false,
      issues: [],
    };

    try {
      // Fetch payment details from Razorpay
      const razorpayPayment = await paymentService.razorpay.payments.fetch(
        payment.razorpayPaymentId
      );

      reconciliation.razorpayStatus = razorpayPayment.status;
      reconciliation.razorpayAmount = razorpayPayment.amount / 100;

      // Check status match
      if (!this.statusMatches(payment.status, razorpayPayment.status)) {
        reconciliation.issues.push("status_mismatch");
      }

      // Check amount match
      if (Math.abs(payment.amount - razorpayPayment.amount / 100) > 1) {
        reconciliation.issues.push("amount_mismatch");
      }

      // If no issues, mark as matched
      if (reconciliation.issues.length === 0) {
        reconciliation.matched = true;
      }
    } catch (error) {
      if (
        error.statusCode === 400 ||
        error.error?.code === "BAD_REQUEST_ERROR"
      ) {
        reconciliation.issues.push("payment_not_found_in_razorpay");
      } else {
        reconciliation.issues.push("razorpay_api_error");
        reconciliation.error = error.message;
      }
    }

    return reconciliation;
  }

  /**
   * Check if database status matches Razorpay status
   */
  statusMatches(dbStatus, razorpayStatus) {
    const statusMap = {
      paid: ["captured", "authorized"],
      pending: ["created", "pending"],
      failed: ["failed"],
      refunded: ["refunded"],
    };

    return statusMap[dbStatus]?.includes(razorpayStatus) || false;
  }

  /**
   * Map Razorpay status to database status
   */
  mapRazorpayStatus(razorpayStatus) {
    const statusMap = {
      captured: "paid",
      authorized: "paid",
      created: "pending",
      pending: "pending",
      failed: "failed",
      refunded: "refunded",
    };

    return statusMap[razorpayStatus] || "pending";
  }

  /**
   * Merge report data
   */
  mergeReports(mainReport, subReport, key) {
    mainReport.totalRecords += subReport.totalRecords;
    mainReport.matched += subReport.matched;
    mainReport.unmatched += subReport.unmatched;
    mainReport.discrepancies.push(...subReport.discrepancies);
    mainReport.summary[key] = {
      total: subReport.totalRecords,
      matched: subReport.matched,
      unmatched: subReport.unmatched,
    };
  }

  /**
   * Find orphaned Razorpay payments
   * Payments in Razorpay that don't exist in database
   */
  async findOrphanedPayments(dateRange) {
    try {
      logger.info("Finding orphaned payments", dateRange);

      // This would require fetching all payments from Razorpay
      // and comparing with database records
      // Note: Razorpay API has pagination limits

      // Implementation would involve:
      // 1. Fetch all Razorpay payments for date range
      // 2. Check if each payment exists in database
      // 3. Return list of orphaned payments

      // For now, returning placeholder
      return {
        orphanedPayments: [],
        message:
          "Orphaned payment detection requires Razorpay API pagination implementation",
      };
    } catch (error) {
      logger.error("Failed to find orphaned payments", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate reconciliation summary report
   */
  async generateSummaryReport(dateRange) {
    try {
      const report = await this.reconcilePayments({
        ...dateRange,
        type: "all",
        autoFix: false,
      });

      // Add additional analytics
      const summary = {
        ...report,
        analytics: {
          totalAmount: 0,
          reconciledAmount: 0,
          unreconciledAmount: 0,
          discrepancyTypes: {},
        },
      };

      // Calculate amounts and categorize discrepancies
      report.discrepancies.forEach((disc) => {
        summary.analytics.totalAmount += disc.dbAmount || 0;

        if (disc.matched) {
          summary.analytics.reconciledAmount += disc.dbAmount || 0;
        } else {
          summary.analytics.unreconciledAmount += disc.dbAmount || 0;
        }

        // Count discrepancy types
        disc.issues?.forEach((issue) => {
          summary.analytics.discrepancyTypes[issue] =
            (summary.analytics.discrepancyTypes[issue] || 0) + 1;
        });
      });

      return summary;
    } catch (error) {
      logger.error("Failed to generate summary report", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Export reconciliation report to CSV
   */
  exportToCSV(report) {
    try {
      const headers = [
        "Type",
        "ID",
        "Transaction ID",
        "DB Status",
        "Razorpay Status",
        "DB Amount",
        "Razorpay Amount",
        "Matched",
        "Issues",
      ];

      const rows = report.discrepancies.map((disc) => [
        disc.type,
        disc.id,
        disc.transactionId || disc.razorpayPaymentId,
        disc.dbStatus,
        disc.razorpayStatus,
        disc.dbAmount,
        disc.razorpayAmount,
        disc.matched,
        disc.issues?.join("; ") || "",
      ]);

      const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");

      return csv;
    } catch (error) {
      logger.error("Failed to export to CSV", { error: error.message });
      throw error;
    }
  }
}

// Export singleton instance
export const paymentReconciliationService = new PaymentReconciliationService();
