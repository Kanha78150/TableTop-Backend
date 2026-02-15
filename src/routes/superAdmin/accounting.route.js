// src/routes/superAdmin/accounting.route.js - SuperAdmin Accounting Routes
import express from "express";
import { requireRole } from "../../middleware/roleAuth.middleware.js";
import {
  getAccountingDashboard,
  getFinancialSummary,
} from "../../controllers/admin/accountingDashboard.controller.js";
import {
  getAllTransactions,
  getHotelWiseAccounting,
  getBranchWiseAccounting,
  getSettlements,
  exportReport,
} from "../../controllers/admin/accounting.controller.js";
import {
  validateDashboardQueryMiddleware,
  validateSummaryQueryMiddleware,
  validateTransactionQueryMiddleware,
  validateHotelAccountingQueryMiddleware,
  validateBranchAccountingQueryMiddleware,
  validateSettlementQueryMiddleware,
  validateExportRequestMiddleware,
  exportRateLimit,
} from "../../middleware/accounting.validation.middleware.js";

const router = express.Router();

// All routes require super_admin role
router.use(requireRole(["super_admin"]));

/**
 * @route   GET /api/v1/super-admin/accounting/dashboard
 * @desc    Get comprehensive accounting dashboard with analytics
 * @access  SuperAdmin
 * @query   period, hotelId, branchId
 */
router.get(
  "/dashboard",
  validateDashboardQueryMiddleware,
  getAccountingDashboard
);

/**
 * @route   GET /api/v1/super-admin/accounting/summary
 * @desc    Get financial summary with key metrics
 * @access  SuperAdmin
 * @query   period
 */
router.get("/summary", validateSummaryQueryMiddleware, getFinancialSummary);

/**
 * @route   GET /api/v1/super-admin/accounting/transactions
 * @desc    Get all transactions with advanced filtering
 * @access  SuperAdmin
 * @query   page, limit, hotelId, branchId, status, paymentMethod, startDate, endDate, minAmount, maxAmount, sortBy, sortOrder
 */
router.get(
  "/transactions",
  validateTransactionQueryMiddleware,
  getAllTransactions
);

/**
 * @route   GET /api/v1/super-admin/accounting/hotels
 * @desc    Get hotel-wise accounting summary
 * @access  SuperAdmin
 * @query   startDate, endDate, status
 */
router.get(
  "/hotels",
  validateHotelAccountingQueryMiddleware,
  getHotelWiseAccounting
);

/**
 * @route   GET /api/v1/super-admin/accounting/branches
 * @desc    Get branch-wise accounting summary
 * @access  SuperAdmin
 * @query   hotelId, startDate, endDate, status
 */
router.get(
  "/branches",
  validateBranchAccountingQueryMiddleware,
  getBranchWiseAccounting
);

/**
 * @route   GET /api/v1/super-admin/accounting/settlements
 * @desc    Get settlements and payout tracking
 * @access  SuperAdmin
 * @query   page, limit, hotelId, branchId, status, startDate, endDate, payoutStatus
 */
router.get("/settlements", validateSettlementQueryMiddleware, getSettlements);

/**
 * @route   POST /api/v1/super-admin/accounting/export
 * @desc    Export accounting data in various formats (CSV, Excel, PDF)
 * @access  SuperAdmin
 * @body    format, reportType, hotelId, branchId, startDate, endDate, status
 */
router.post(
  "/export",
  exportRateLimit,
  validateExportRequestMiddleware,
  exportReport
);

export default router;
