import express from "express";
import {
  getHotels,
  getHotelDetails,
  getHotelBranchesByLocation,
  searchNearbyHotels,
  getBranchDetails,
} from "../controllers/user/hotelController.js";

import userMenuController from "../controllers/user/menuController.js";
import {
  addToCart,
  getCart,
  updateItemQuantity,
  removeCartItem,
  clearCart,
  validateCart,
  getCartSummary,
  updateItemCustomizations,
  getAllUserCarts,
  transferToCheckout,
  quickAddToCart,
  getCartItemCount,
  bulkUpdateCart,
} from "../controllers/user/cartController.js";
import { authenticateUser } from "../middleware/auth.middleware.js";

const router = express.Router();

// Hotel routes for users
router.get("/hotels", getHotels);
router.get("/hotels/search-nearby", searchNearbyHotels);
router.get("/hotels/:hotelId", getHotelDetails);
router.get("/hotels/:hotelId/branches", getHotelBranchesByLocation);

// Branch routes for users
router.get("/branches/:branchId", getBranchDetails);

// Menu routes for users
// Categories
router.get("/menu/categories", userMenuController.getCategories);
router.get("/menu/categories/:categoryId", userMenuController.getCategoryById);
router.get(
  "/menu/categories/:categoryId/items",
  userMenuController.getItemsByCategory
);

// Food Items
router.get("/menu/items", userMenuController.getFoodItems);
router.get("/menu/items/featured", userMenuController.getFeaturedItems);
router.get("/menu/items/:itemId", userMenuController.getFoodItemById);

// Search
router.get("/menu/search", userMenuController.searchMenu);

// Cart routes for users (protected with authentication)
// Basic cart operations
router.post("/cart/add", authenticateUser, addToCart);
router.post("/cart/quick-add", authenticateUser, quickAddToCart);
router.get("/cart/all", authenticateUser, getAllUserCarts);

// Cart item operations (more specific routes first)
router.put("/cart/item/:itemId", authenticateUser, updateItemQuantity);
router.put(
  "/cart/item/:itemId/customizations",
  authenticateUser,
  updateItemCustomizations
);
router.delete("/cart/item/:itemId", authenticateUser, removeCartItem);

// Cart management
router.delete("/cart/clear", authenticateUser, clearCart);
router.put("/cart/bulk-update", authenticateUser, bulkUpdateCart);
router.post("/cart/validate", authenticateUser, validateCart);

// Checkout
router.post("/cart/checkout", authenticateUser, transferToCheckout);

// Cart retrieval routes (less specific routes last)
router.get("/cart/:hotelId/:branchId", authenticateUser, getCart);
router.get(
  "/cart/summary/:hotelId/:branchId",
  authenticateUser,
  getCartSummary
);
router.get(
  "/cart/count/:hotelId/:branchId",
  authenticateUser,
  getCartItemCount
);

export default router;
