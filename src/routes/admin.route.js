import express from "express";

// Hotel and Branch Controllers
import {
  createHotel,
  getAllHotels,
  getHotelById,
  getHotelBranchesByLocation,
  updateHotel,
  deleteHotel,
  deactivateHotel,
  reactivateHotel,
  searchHotels,
  searchHotelsByLocation,
} from "../controllers/admin/hotelController.js";

import {
  createBranch,
  getAllBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  deactivateBranch,
  reactivateBranch,
  searchBranchesByLocation,
  getBranchesByHotel,
} from "../controllers/admin/branchController.js";

// User Management Controllers
import {
  getAllUsers,
  getUserById,
  updateUser,
  blockUser,
  unblockUser,
  deleteUser,
  getAllManagers,
  getManagerById,
  createManager,
  updateManager,
  updateManagerPermissions,
  deleteManager,
  deactivateManager,
  reactivateManager,
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  updateStaffPermissions,
  deleteStaff,
  deactivateStaff,
  reactivateStaff,
  assignStaffToManager,
  getStaffByManager,
} from "../controllers/admin/userController.js";

// Menu Management Controllers
import {
  getAllCategories,
  createCategory,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getAllFoodItems,
  createFoodItem,
  getFoodItemById,
  updateFoodItem,
  deleteFoodItem,
  updateFoodItemAvailability,
} from "../controllers/admin/menuController.js";

// Table Management Controllers
import {
  generateTableQRCodes,
  getTables,
  getTableById,
  updateTable,
  deleteTable,
  regenerateTableQR,
  getAvailableTables,
  bulkUpdateTableStatus,
  getTableStats,
} from "../controllers/admin/tableController.js";

// Offer Management Controllers
import offerController from "../controllers/admin/offerController.js";

// Analytics Controllers
import {
  getDashboardOverview,
  getSalesReport,
  getProfitLossReport,
  getCustomerAnalytics,
  getBestSellingItems,
} from "../controllers/admin/analyticsController.js";

// Middleware
import {
  authenticateAdmin,
  requireSuperAdmin,
  requirePermission,
  requirePermissions,
  requireBranchAccess,
  requireFinancialAccess,
  rbac,
} from "../middleware/roleAuth.middleware.js";

const router = express.Router();

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// ======================
// HOTEL MANAGEMENT ROUTES
// ======================
router.post("/hotels", rbac({ permissions: ["manageBranches"] }), createHotel);

router.get("/hotels", rbac({ permissions: ["manageBranches"] }), getAllHotels);

router.get(
  "/hotels/search",
  rbac({ permissions: ["manageBranches"] }),
  searchHotels
);

router.get(
  "/hotels/search-by-location",
  rbac({ permissions: ["manageBranches"] }),
  searchHotelsByLocation
);

router.get(
  "/hotels/:hotelId",
  rbac({ permissions: ["manageBranches"] }),
  getHotelById
);

router.put(
  "/hotels/:hotelId",
  rbac({ permissions: ["manageBranches"] }),
  updateHotel
);

router.delete(
  "/hotels/:hotelId",
  rbac({ roles: ["admin", "super_admin"] }),
  deleteHotel
);
router.patch(
  "/hotels/:hotelId/deactivate",
  rbac({ roles: ["admin", "super_admin"] }),
  deactivateHotel
);

router.patch(
  "/hotels/:hotelId/reactivate",
  rbac({ roles: ["admin", "super_admin"] }),
  reactivateHotel
);

router.get(
  "/hotels/:hotelId/branches",
  rbac({ permissions: ["manageBranches"] }),
  getHotelBranchesByLocation
);

// ======================
// BRANCH MANAGEMENT ROUTES
// ======================
router.post(
  "/branches",
  rbac({ permissions: ["manageBranches"] }),
  createBranch
);

router.get(
  "/branches",
  rbac({ permissions: ["manageBranches"] }),
  getAllBranches
);

router.get(
  "/branches/search-by-location",
  rbac({ permissions: ["manageBranches"] }),
  searchBranchesByLocation
);

router.get(
  "/branches/hotel/:hotelId",
  rbac({ permissions: ["manageBranches"] }),
  getBranchesByHotel
);

router.get(
  "/branches/:branchId",
  rbac({ permissions: ["manageBranches"] }),
  getBranchById
);

router.put(
  "/branches/:branchId",
  rbac({ permissions: ["manageBranches"] }),
  updateBranch
);

router.delete(
  "/branches/:branchId",
  rbac({
    roles: ["admin", "super_admin", "branch_admin"],
    permissions: ["manageBranches"],
  }),
  deleteBranch
);

// Branch deactivation/reactivation routes
router.patch(
  "/branches/:branchId/deactivate",
  rbac({
    roles: ["admin", "super_admin", "branch_admin"],
    permissions: ["manageBranches"],
  }),
  deactivateBranch
);

router.patch(
  "/branches/:branchId/reactivate",
  rbac({
    roles: ["admin", "super_admin", "branch_admin"],
    permissions: ["manageBranches"],
  }),
  reactivateBranch
);

// ======================
// USER MANAGEMENT ROUTES
// ======================

// Customer Management
router.get("/users", rbac({ permissions: ["manageUsers"] }), getAllUsers);

router.get(
  "/users/:userId",
  rbac({ permissions: ["manageUsers"] }),
  getUserById
);

router.put(
  "/users/:userId",
  rbac({ permissions: ["manageUsers"] }),
  updateUser
);

router.post(
  "/users/:userId/block",
  rbac({ permissions: ["manageUsers"] }),
  blockUser
);

router.post(
  "/users/:userId/unblock",
  rbac({ permissions: ["manageUsers"] }),
  unblockUser
);

router.delete("/users/:userId", requireSuperAdmin, deleteUser);

// Manager Management
router.get(
  "/managers",
  rbac({ permissions: ["manageManagers"] }),
  getAllManagers
);

router.get(
  "/managers/:managerId",
  rbac({ permissions: ["manageManagers"] }),
  getManagerById
);

router.post(
  "/managers",
  rbac({ permissions: ["manageManagers"] }),
  createManager
);

router.put(
  "/managers/:managerId",
  rbac({ permissions: ["manageManagers"] }),
  updateManager
);

router.delete(
  "/managers/:managerId",
  rbac({ permissions: ["manageManagers"] }),
  deleteManager
);

// Manager deactivation/reactivation routes
router.patch(
  "/managers/:managerId/deactivate",
  rbac({ permissions: ["manageManagers"] }),
  deactivateManager
);

router.patch(
  "/managers/:managerId/reactivate",
  rbac({ permissions: ["manageManagers"] }),
  reactivateManager
);

router.put(
  "/managers/:managerId/permissions",
  rbac({ roles: ["admin", "super_admin"] }),
  updateManagerPermissions
);

// Staff Management
router.get("/staff", rbac({ permissions: ["manageStaff"] }), getAllStaff);

router.get(
  "/staff/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  getStaffById
);

router.post("/staff", rbac({ permissions: ["manageStaff"] }), createStaff);

router.put(
  "/staff/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  updateStaff
);

// Staff Permissions Update (Admin and Super Admin Only - not Branch Admin)
router.put(
  "/staff/:staffId/permissions",
  rbac({ permissions: ["manageStaff"] }),
  updateStaffPermissions
);

router.delete(
  "/staff/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  deleteStaff
);

// Staff deactivation/reactivation routes
router.patch(
  "/staff/:staffId/deactivate",
  rbac({ permissions: ["manageStaff"] }),
  deactivateStaff
);

router.patch(
  "/staff/:staffId/reactivate",
  rbac({ permissions: ["manageStaff"] }),
  reactivateStaff
);

// Staff-Manager Assignment (Admin Only)
router.put(
  "/staff/:staffId/assign-manager",
  rbac({ permissions: ["manageStaff"] }),
  assignStaffToManager
);

router.get(
  "/managers/:managerId/staff",
  rbac({ permissions: ["manageStaff"] }),
  getStaffByManager
);

// ======================
// MENU MANAGEMENT ROUTES
// ======================

// Food Categories
router.get(
  "/menu/categories",
  rbac({ permissions: ["manageMenu"] }),
  getAllCategories
);

router.post(
  "/menu/categories",
  rbac({ permissions: ["manageMenu"] }),
  createCategory
);

router.get(
  "/menu/categories/:categoryId",
  rbac({ permissions: ["manageMenu"] }),
  getCategoryById
);

router.put(
  "/menu/categories/:categoryId",
  rbac({ permissions: ["manageMenu"] }),
  updateCategory
);

router.delete(
  "/menu/categories/:categoryId",
  rbac({ permissions: ["manageMenu"] }),
  deleteCategory
);

// Food Items
router.get(
  "/menu/items",
  rbac({ permissions: ["manageMenu"] }),
  getAllFoodItems
);

router.post(
  "/menu/items",
  rbac({ permissions: ["manageMenu"] }),
  createFoodItem
);

router.get(
  "/menu/items/:itemId",
  rbac({ permissions: ["manageMenu"] }),
  getFoodItemById
);

router.put(
  "/menu/items/:itemId",
  rbac({ permissions: ["manageMenu"] }),
  updateFoodItem
);

router.delete(
  "/menu/items/:itemId",
  rbac({ permissions: ["manageMenu"] }),
  deleteFoodItem
);

router.patch(
  "/menu/items/availability",
  rbac({ permissions: ["manageMenu"] }),
  updateFoodItemAvailability
);

// ======================
// TABLE MANAGEMENT ROUTES
// ======================

// Generate QR codes for tables
router.post(
  "/tables/generate-qr",
  rbac({ permissions: ["manageTables"] }),
  generateTableQRCodes
);

// Get all tables
router.get("/tables", rbac({ permissions: ["manageTables"] }), getTables);

// Get available tables
router.get(
  "/tables/available",
  rbac({ permissions: ["manageTables"] }),
  getAvailableTables
);

// Get table statistics
router.get(
  "/tables/stats",
  rbac({ permissions: ["manageTables"] }),
  getTableStats
);

// Bulk update table status (must be before :tableId routes)
router.put(
  "/tables/bulk-status",
  rbac({ permissions: ["manageTables"] }),
  bulkUpdateTableStatus
);

// Get table by ID
router.get(
  "/tables/:tableId",
  rbac({ permissions: ["manageTables"] }),
  getTableById
);

// Update table
router.put(
  "/tables/:tableId",
  rbac({ permissions: ["manageTables"] }),
  updateTable
);

// Delete table
router.delete(
  "/tables/:tableId",
  rbac({ permissions: ["manageTables"] }),
  deleteTable
);

// Regenerate QR code for table
router.post(
  "/tables/:tableId/regenerate-qr",
  rbac({ permissions: ["manageTables"] }),
  regenerateTableQR
);

// Offers Management
router.get(
  "/offers",
  rbac({ permissions: ["manageOffers"] }),
  offerController.getAllOffers
);

router.get(
  "/offers/stats",
  rbac({ permissions: ["manageOffers"] }),
  offerController.getOfferStats
);

router.get(
  "/offers/active",
  rbac({ permissions: ["manageOffers"] }),
  offerController.getActiveOffersFor
);

router.post(
  "/offers",
  rbac({ permissions: ["manageOffers"] }),
  offerController.createOffer
);

router.get(
  "/offers/code/:code",
  rbac({ permissions: ["manageOffers"] }),
  offerController.getOfferByCode
);

router.get(
  "/offers/:offerId",
  rbac({ permissions: ["manageOffers"] }),
  offerController.getOfferById
);

router.put(
  "/offers/:offerId",
  rbac({ permissions: ["manageOffers"] }),
  offerController.updateOffer
);

router.patch(
  "/offers/:offerId/toggle",
  rbac({ permissions: ["manageOffers"] }),
  offerController.toggleOfferStatus
);

router.delete(
  "/offers/:offerId",
  rbac({ permissions: ["manageOffers"] }),
  offerController.deleteOffer
);

router.post(
  "/offers/:code/apply",
  rbac({ permissions: ["manageOffers"] }),
  offerController.applyOffer
);

router.post(
  "/offers/apply-multiple",
  rbac({ permissions: ["manageOffers"] }),
  offerController.applyOffers
);

// ======================
// ANALYTICS & REPORTS ROUTES
// ======================

// Dashboard
router.get(
  "/dashboard",
  rbac({ permissions: ["viewAnalytics"] }),
  getDashboardOverview
);

// Sales Reports
router.get(
  "/reports/sales",
  rbac({ permissions: ["viewReports"] }),
  getSalesReport
);

// Profit & Loss Reports
router.get(
  "/reports/profit-loss",
  rbac({ permissions: ["viewFinancials"] }),
  getProfitLossReport
);

// Customer Analytics
router.get(
  "/analytics/customers",
  rbac({ permissions: ["viewAnalytics"] }),
  getCustomerAnalytics
);

// Best Selling Items
router.get(
  "/reports/best-sellers",
  rbac({ permissions: ["viewReports"] }),
  getBestSellingItems
);

export default router;
