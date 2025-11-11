import { logger } from "./logger.js";

/**
 * Payment Logger Utility
 *
 * Comprehensive logging system for all payment-related activities
 * including transactions, webhooks, refunds, and reconciliation
 */

class PaymentLogger {
  /**
   * Log payment initiation
   */
  logPaymentInitiation(data) {
    logger.info("[PAYMENT_INITIATED]", {
      timestamp: new Date().toISOString(),
      event: "payment_initiated",
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      amount: data.amount,
      currency: data.currency || "INR",
      paymentGateway: "razorpay",
      razorpayOrderId: data.razorpayOrderId,
      userId: data.userId,
      branchId: data.branchId,
      hotelId: data.hotelId,
      metadata: data.metadata,
    });
  }

  /**
   * Log payment success
   */
  logPaymentSuccess(data) {
    logger.info("[PAYMENT_SUCCESS]", {
      timestamp: new Date().toISOString(),
      event: "payment_success",
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      transactionId: data.transactionId,
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      userId: data.userId,
      processingTime: data.processingTime,
      metadata: data.metadata,
    });
  }

  /**
   * Log payment failure
   */
  logPaymentFailure(data) {
    logger.error("[PAYMENT_FAILED]", {
      timestamp: new Date().toISOString(),
      event: "payment_failed",
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      transactionId: data.transactionId,
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
      amount: data.amount,
      reason: data.reason,
      errorCode: data.errorCode,
      errorDescription: data.errorDescription,
      userId: data.userId,
      attemptNumber: data.attemptNumber,
      metadata: data.metadata,
    });
  }

  /**
   * Log payment pending status
   */
  logPaymentPending(data) {
    logger.warn("[PAYMENT_PENDING]", {
      timestamp: new Date().toISOString(),
      event: "payment_pending",
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      transactionId: data.transactionId,
      razorpayOrderId: data.razorpayOrderId,
      amount: data.amount,
      userId: data.userId,
      pendingDuration: data.pendingDuration,
      metadata: data.metadata,
    });
  }

  /**
   * Log webhook received
   */
  logWebhookReceived(data) {
    logger.info("[WEBHOOK_RECEIVED]", {
      timestamp: new Date().toISOString(),
      event: "webhook_received",
      webhookEvent: data.event,
      webhookId: data.webhookId,
      entityType: data.entity?.entity,
      entityId: data.entity?.id,
      paymentId: data.entity?.payment?.entity?.id,
      orderId: data.entity?.payment?.entity?.order_id,
      amount: data.entity?.payment?.entity?.amount,
      status: data.entity?.payment?.entity?.status,
      signatureVerified: data.signatureVerified,
      rawPayload: JSON.stringify(data.payload).substring(0, 500), // Log first 500 chars
    });
  }

  /**
   * Log webhook processing
   */
  logWebhookProcessing(data) {
    logger.info("[WEBHOOK_PROCESSING]", {
      timestamp: new Date().toISOString(),
      event: "webhook_processing",
      webhookEvent: data.event,
      entityId: data.entityId,
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      action: data.action,
      result: data.result,
      processingTime: data.processingTime,
    });
  }

  /**
   * Log webhook error
   */
  logWebhookError(data) {
    logger.error("[WEBHOOK_ERROR]", {
      timestamp: new Date().toISOString(),
      event: "webhook_error",
      webhookEvent: data.event,
      error: data.error,
      errorMessage: data.errorMessage,
      stack: data.stack,
      payload: JSON.stringify(data.payload).substring(0, 500),
    });
  }

  /**
   * Log refund initiation
   */
  logRefundInitiation(data) {
    logger.info("[REFUND_INITIATED]", {
      timestamp: new Date().toISOString(),
      event: "refund_initiated",
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      paymentId: data.paymentId,
      refundAmount: data.refundAmount,
      totalAmount: data.totalAmount,
      reason: data.reason,
      initiatedBy: data.initiatedBy,
      refundType: data.refundType, // full/partial
      metadata: data.metadata,
    });
  }

  /**
   * Log refund success
   */
  logRefundSuccess(data) {
    logger.info("[REFUND_SUCCESS]", {
      timestamp: new Date().toISOString(),
      event: "refund_success",
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      refundId: data.refundId,
      paymentId: data.paymentId,
      refundAmount: data.refundAmount,
      refundStatus: data.refundStatus,
      processingTime: data.processingTime,
      estimatedSettlement: data.estimatedSettlement,
      metadata: data.metadata,
    });
  }

  /**
   * Log refund failure
   */
  logRefundFailure(data) {
    logger.error("[REFUND_FAILED]", {
      timestamp: new Date().toISOString(),
      event: "refund_failed",
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      paymentId: data.paymentId,
      refundAmount: data.refundAmount,
      reason: data.reason,
      errorCode: data.errorCode,
      errorDescription: data.errorDescription,
      metadata: data.metadata,
    });
  }

  /**
   * Log payment verification
   */
  logPaymentVerification(data) {
    logger.info("[PAYMENT_VERIFICATION]", {
      timestamp: new Date().toISOString(),
      event: "payment_verification",
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
      signatureProvided: !!data.signature,
      signatureValid: data.signatureValid,
      verificationMethod: data.verificationMethod, // signature/status_check
      result: data.result,
    });
  }

  /**
   * Log payment reconciliation
   */
  logReconciliation(data) {
    logger.info("[PAYMENT_RECONCILIATION]", {
      timestamp: new Date().toISOString(),
      event: "payment_reconciliation",
      dateRange: data.dateRange,
      totalOrders: data.totalOrders,
      matchedPayments: data.matchedPayments,
      unmatchedPayments: data.unmatchedPayments,
      discrepancies: data.discrepancies,
      totalAmount: data.totalAmount,
      reconciledAmount: data.reconciledAmount,
      unreconciledAmount: data.unreconciledAmount,
    });
  }

  /**
   * Log payment retry attempt
   */
  logPaymentRetry(data) {
    logger.warn("[PAYMENT_RETRY]", {
      timestamp: new Date().toISOString(),
      event: "payment_retry",
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      attemptNumber: data.attemptNumber,
      maxAttempts: data.maxAttempts,
      previousFailureReason: data.previousFailureReason,
      retryScheduledAt: data.retryScheduledAt,
      userId: data.userId,
    });
  }

  /**
   * Log invoice generation
   */
  logInvoiceGeneration(data) {
    logger.info("[INVOICE_GENERATED]", {
      timestamp: new Date().toISOString(),
      event: "invoice_generated",
      invoiceId: data.invoiceId,
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      amount: data.amount,
      invoiceNumber: data.invoiceNumber,
      generatedBy: data.generatedBy,
      fileSize: data.fileSize,
      format: data.format || "PDF",
      sentToEmail: data.sentToEmail,
    });
  }

  /**
   * Log payment status change
   */
  logPaymentStatusChange(data) {
    logger.info("[PAYMENT_STATUS_CHANGE]", {
      timestamp: new Date().toISOString(),
      event: "payment_status_change",
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      transactionId: data.transactionId,
      previousStatus: data.previousStatus,
      newStatus: data.newStatus,
      changedBy: data.changedBy,
      reason: data.reason,
      metadata: data.metadata,
    });
  }

  /**
   * Log payment gateway error
   */
  logGatewayError(data) {
    logger.error("[GATEWAY_ERROR]", {
      timestamp: new Date().toISOString(),
      event: "gateway_error",
      gateway: "razorpay",
      operation: data.operation,
      orderId: data.orderId,
      subscriptionId: data.subscriptionId,
      errorCode: data.errorCode,
      errorMessage: data.errorMessage,
      httpStatus: data.httpStatus,
      requestId: data.requestId,
      stack: data.stack,
    });
  }

  /**
   * Log subscription payment cycle
   */
  logSubscriptionPaymentCycle(data) {
    logger.info("[SUBSCRIPTION_PAYMENT_CYCLE]", {
      timestamp: new Date().toISOString(),
      event: "subscription_payment_cycle",
      subscriptionId: data.subscriptionId,
      adminId: data.adminId,
      cycleType: data.cycleType, // new/renewal/upgrade
      planId: data.planId,
      planName: data.planName,
      billingCycle: data.billingCycle,
      amount: data.amount,
      previousPlanId: data.previousPlanId,
      prorated: data.prorated,
      proratedAmount: data.proratedAmount,
    });
  }

  /**
   * Log payment analytics query
   */
  logAnalyticsQuery(data) {
    logger.info("[PAYMENT_ANALYTICS]", {
      timestamp: new Date().toISOString(),
      event: "payment_analytics_query",
      queryType: data.queryType,
      dateRange: data.dateRange,
      filters: data.filters,
      resultCount: data.resultCount,
      executionTime: data.executionTime,
      requestedBy: data.requestedBy,
    });
  }

  /**
   * Log bulk payment operation
   */
  logBulkOperation(data) {
    logger.info("[BULK_PAYMENT_OPERATION]", {
      timestamp: new Date().toISOString(),
      event: "bulk_payment_operation",
      operation: data.operation, // export/reconcile/refund
      totalRecords: data.totalRecords,
      successCount: data.successCount,
      failureCount: data.failureCount,
      dateRange: data.dateRange,
      executionTime: data.executionTime,
      initiatedBy: data.initiatedBy,
      errors: data.errors,
    });
  }

  /**
   * Log settlement information
   */
  logSettlement(data) {
    logger.info("[PAYMENT_SETTLEMENT]", {
      timestamp: new Date().toISOString(),
      event: "payment_settlement",
      settlementId: data.settlementId,
      amount: data.amount,
      settledAt: data.settledAt,
      paymentCount: data.paymentCount,
      utr: data.utr,
      fees: data.fees,
      tax: data.tax,
      netAmount: data.netAmount,
    });
  }

  /**
   * Log payment method statistics
   */
  logPaymentMethodStats(data) {
    logger.info("[PAYMENT_METHOD_STATS]", {
      timestamp: new Date().toISOString(),
      event: "payment_method_statistics",
      dateRange: data.dateRange,
      methods: data.methods, // {upi: {count: X, amount: Y}, card: {...}}
      mostUsedMethod: data.mostUsedMethod,
      highestRevenueMethod: data.highestRevenueMethod,
      totalTransactions: data.totalTransactions,
      totalAmount: data.totalAmount,
    });
  }

  /**
   * Create a payment audit trail entry
   */
  createAuditTrail(data) {
    logger.info("[PAYMENT_AUDIT_TRAIL]", {
      timestamp: new Date().toISOString(),
      event: "payment_audit_trail",
      action: data.action,
      entity: data.entity, // order/subscription/refund
      entityId: data.entityId,
      userId: data.userId,
      userRole: data.userRole,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      changes: data.changes,
      previousState: data.previousState,
      newState: data.newState,
      metadata: data.metadata,
    });
  }
}

// Export singleton instance
export const paymentLogger = new PaymentLogger();
