// src/routes/admin/accounting.route.js - Admin Accounting Routes
import express from "express";
import { requireRole } from "../../middleware/roleAuth.middleware.js";
import {
  getAllTransactions,
  getHotelWiseAccounting,
  getBranchWiseAccounting,
  getSettlements,
  exportReport,
} from "../../controllers/admin/accountingController.js";

import {
  getAccountingDashboard,
  getFinancialSummary,
} from "../../controllers/admin/accountingDashboardController.js";

import {
  validateTransactionQueryMiddleware,
  validateHotelAccountingQueryMiddleware,
  validateBranchAccountingQueryMiddleware,
  validateSettlementQueryMiddleware,
  validateExportRequestMiddleware,
  validateDashboardQueryMiddleware,
  validateSummaryQueryMiddleware,
  exportRateLimit,
} from "../../middleware/accounting.validation.middleware.js";

const router = express.Router();

// All routes require admin role
router.use(requireRole(["admin"]));

/**
 * @route GET /api/v1/admin/accounting/dashboard
 * @desc Get accounting dashboard with analytics summary
 * @access Admin
 * @queryParams { period, hotelId, branchId }
 */
router.get(
  "/dashboard",
  validateDashboardQueryMiddleware,
  getAccountingDashboard
);

/**
 * @route GET /api/v1/admin/accounting/summary
 * @desc Get quick financial summary
 * @access Admin
 * @queryParams { period }
 */
router.get("/summary", validateSummaryQueryMiddleware, getFinancialSummary);

/**
 * @route GET /api/v1/admin/accounting/transactions
 * @desc Get all transactions history with filters
 * @access Admin
 * @queryParams {
 *   page, limit, hotelId, branchId, status, paymentMethod,
 *   startDate, endDate, minAmount, maxAmount, sortBy, sortOrder
 * }
 */
router.get(
  "/transactions",
  validateTransactionQueryMiddleware,
  getAllTransactions
);

/**
 * @route GET /api/v1/admin/accounting/hotels
 * @desc Get hotel-wise accounting summary
 * @access Admin
 * @queryParams { startDate, endDate, status }
 */
router.get(
  "/hotels",
  validateHotelAccountingQueryMiddleware,
  getHotelWiseAccounting
);

/**
 * @route GET /api/v1/admin/accounting/branches
 * @desc Get branch-wise accounting summary
 * @access Admin
 * @queryParams { hotelId, startDate, endDate, status }
 */
router.get(
  "/branches",
  validateBranchAccountingQueryMiddleware,
  getBranchWiseAccounting
);

/**
 * @route GET /api/v1/admin/accounting/settlements
 * @desc Get settlement tracking & payout logs
 * @access Admin
 * @queryParams {
 *   page, limit, hotelId, branchId, status,
 *   startDate, endDate, payoutStatus
 * }
 */
router.get("/settlements", validateSettlementQueryMiddleware, getSettlements);

/**
 * @route POST /api/v1/admin/accounting/export
 * @desc Export accounting reports (CSV, Excel, PDF)
 * @access Admin
 * @body {
 *   format: "csv" | "excel" | "pdf",
 *   reportType: "transactions" | "hotels" | "branches" | "settlements",
 *   hotelId?, branchId?, startDate?, endDate?, status?
 * }
 */
router.post(
  "/export",
  validateExportRequestMiddleware,
  exportRateLimit,
  exportReport
);

export default router;
