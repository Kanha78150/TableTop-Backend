// src/routes/user/cart.route.js - User Cart Routes
// Note: authenticateUser is applied at the mount level in user.route.js
import express from "express";
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
} from "../../controllers/user/cart.controller.js";

const router = express.Router();

// Basic cart operations
router.post("/add", addToCart);
router.post("/quick-add", quickAddToCart);
router.get("/all", getAllUserCarts);

// Cart item operations (more specific routes first)
router.put("/item/:itemId", updateItemQuantity);
router.put("/item/:itemId/customizations", updateItemCustomizations);
router.delete("/item/:itemId", removeCartItem);

// Cart management
router.delete("/clear", clearCart);
router.put("/bulk-update", bulkUpdateCart);
router.post("/validate", validateCart);

// Checkout
router.post("/checkout", transferToCheckout);

// Cart retrieval routes (SPECIFIC routes FIRST, parameterized routes LAST)
router.get("/summary/:hotelId/:branchId", getCartSummary);
router.get("/summary/:hotelId", getCartSummary);
router.get("/count/:hotelId/:branchId", getCartItemCount);
router.get("/count/:hotelId", getCartItemCount);
// Parameterized routes MUST come after specific routes
router.get("/:hotelId/:branchId", getCart);
router.get("/:hotelId", getCart);

export default router;
