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
  searchHotels,
  searchHotelsByLocation,
} from "../controllers/admin/hotelController.js";

import {
  createBranch,
  getAllBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
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
  getAllStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  assignStaffToManager,
  getStaffByManager,
} from "../controllers/admin/userController.js";

// Menu Management Controllers
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllFoodItems,
  createFoodItem,
  updateFoodItem,
  deleteFoodItem,
  updateFoodItemAvailability,
  getAllOffers,
  createOffer,
  updateOffer,
  deleteOffer,
} from "../controllers/admin/menuController.js";

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

router.delete("/hotels/:hotelId", requireSuperAdmin, deleteHotel);
router.patch("/hotels/:hotelId/deactivate", requireSuperAdmin, deactivateHotel);

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
  rbac({ permissions: ["manageBranches"], branchAccess: true }),
  getBranchById
);

router.put(
  "/branches/:branchId",
  rbac({ permissions: ["manageBranches"], branchAccess: true }),
  updateBranch
);

router.delete(
  "/branches/:branchId",
  rbac({
    roles: ["super_admin", "branch_admin"],
    permissions: ["manageBranches"],
  }),
  deleteBranch
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

router.put(
  "/managers/:managerId/permissions",
  requireSuperAdmin,
  updateManagerPermissions
);

// Staff Management
router.get("/staff", rbac({ permissions: ["manageStaff"] }), getAllStaff);

router.post("/staff", rbac({ permissions: ["manageStaff"] }), createStaff);

router.put(
  "/staff/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  updateStaff
);

router.delete(
  "/staff/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  deleteStaff
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

// Offers Management
router.get("/offers", rbac({ permissions: ["manageOffers"] }), getAllOffers);

router.post("/offers", rbac({ permissions: ["manageOffers"] }), createOffer);

router.put(
  "/offers/:offerId",
  rbac({ permissions: ["manageOffers"] }),
  updateOffer
);

router.delete(
  "/offers/:offerId",
  rbac({ permissions: ["manageOffers"] }),
  deleteOffer
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
