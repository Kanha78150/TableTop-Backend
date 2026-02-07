/**
 * Commission Calculation Utility
 *
 * Calculates commission amount based on hotel's commission configuration.
 * Commission is completely separate from subscription system.
 *
 * Priority:
 * 1. Hotel-specific commission config (if set)
 * 2. None (0%) if not configured
 */

/**
 * Calculate commission for an order
 * @param {Object} hotel - Hotel document with commissionConfig
 * @param {Number} orderAmount - Total order amount
 * @returns {Object} { amount, rate, type, applicable }
 */
export function calculateCommission(hotel, orderAmount) {
  // Validate inputs
  if (!hotel || !orderAmount || orderAmount <= 0) {
    return {
      amount: 0,
      rate: 0,
      type: "none",
      applicable: false,
      reason: "Invalid inputs",
    };
  }

  const commissionConfig = hotel.commissionConfig;

  // No commission config or type is "none"
  if (!commissionConfig || commissionConfig.type === "none") {
    return {
      amount: 0,
      rate: 0,
      type: "none",
      applicable: false,
      reason: "No commission configured",
    };
  }

  // Check if commission is suspended or waived
  if (
    commissionConfig.status === "suspended" ||
    commissionConfig.status === "waived"
  ) {
    return {
      amount: 0,
      rate: commissionConfig.rate || 0,
      type: commissionConfig.type,
      applicable: false,
      reason: `Commission ${commissionConfig.status}`,
    };
  }

  // Calculate based on type
  let commissionAmount = 0;
  let commissionRate = 0;

  if (commissionConfig.type === "percentage") {
    commissionRate = commissionConfig.rate || 0;
    commissionAmount = orderAmount * commissionRate;
  } else if (commissionConfig.type === "fixed") {
    commissionAmount = commissionConfig.fixedAmount || 0;
    commissionRate = 0; // Fixed amount doesn't have a rate
  }

  return {
    amount: Math.round(commissionAmount * 100) / 100, // Round to 2 decimal places
    rate: commissionRate,
    type: commissionConfig.type,
    applicable: true,
    reason: "Commission applied",
    notes: commissionConfig.notes || "",
  };
}

/**
 * Calculate commission for multiple orders (bulk)
 * @param {Array} orders - Array of { hotel, orderAmount }
 * @returns {Object} { total, breakdown }
 */
export function calculateBulkCommission(orders) {
  const breakdown = orders.map((order) => {
    const commission = calculateCommission(order.hotel, order.orderAmount);
    return {
      orderId: order.orderId || order._id,
      hotelId: order.hotel.hotelId || order.hotel._id,
      orderAmount: order.orderAmount,
      commission,
    };
  });

  const total = breakdown.reduce(
    (sum, item) => sum + item.commission.amount,
    0
  );

  return {
    total: Math.round(total * 100) / 100,
    count: breakdown.length,
    breakdown,
  };
}

/**
 * Get commission summary for a hotel (for admin dashboard)
 * @param {Object} hotel - Hotel document
 * @returns {Object} Commission configuration summary
 */
export function getCommissionSummary(hotel) {
  if (!hotel || !hotel.commissionConfig) {
    return {
      configured: false,
      type: "none",
      details: "No commission configured for this hotel",
    };
  }

  const config = hotel.commissionConfig;

  let details = "";
  if (config.type === "percentage") {
    details = `${(config.rate * 100).toFixed(2)}% per order`;
  } else if (config.type === "fixed") {
    details = `₹${config.fixedAmount} per order`;
  } else {
    details = "No commission";
  }

  return {
    configured: config.type !== "none",
    type: config.type,
    details,
    status: config.status,
    notes: config.notes || "",
    setBy: config.setBy,
    lastModified: config.lastModified,
    active: config.status === "active",
  };
}

/**
 * Validate commission configuration
 * @param {Object} commissionConfig - Commission config object
 * @returns {Object} { valid, errors }
 */
export function validateCommissionConfig(commissionConfig) {
  const errors = [];

  if (!commissionConfig) {
    return { valid: false, errors: ["Commission config is required"] };
  }

  // Validate type
  if (!["percentage", "fixed", "none"].includes(commissionConfig.type)) {
    errors.push("Invalid commission type. Must be: percentage, fixed, or none");
  }

  // Validate percentage
  if (commissionConfig.type === "percentage") {
    if (commissionConfig.rate === undefined || commissionConfig.rate === null) {
      errors.push("Rate is required for percentage type");
    } else if (commissionConfig.rate < 0 || commissionConfig.rate > 1) {
      errors.push("Rate must be between 0 and 1 (0% to 100%)");
    }
  }

  // Validate fixed amount
  if (commissionConfig.type === "fixed") {
    if (
      commissionConfig.fixedAmount === undefined ||
      commissionConfig.fixedAmount === null
    ) {
      errors.push("Fixed amount is required for fixed type");
    } else if (commissionConfig.fixedAmount < 0) {
      errors.push("Fixed amount cannot be negative");
    }
  }

  // Validate status
  if (
    commissionConfig.status &&
    !["active", "suspended", "waived"].includes(commissionConfig.status)
  ) {
    errors.push("Invalid status. Must be: active, suspended, or waived");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format commission amount for display
 * @param {Number} amount - Commission amount
 * @param {String} currency - Currency symbol (default: ₹)
 * @returns {String} Formatted commission string
 */
export function formatCommission(amount, currency = "₹") {
  return `${currency}${amount.toFixed(2)}`;
}
