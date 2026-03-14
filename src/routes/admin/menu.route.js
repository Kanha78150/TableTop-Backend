import express from "express";
import { validateBulkGstUpdate } from "../../validators/foodItem.validators.js";
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
  updateSingleFoodItemAvailability,
  bulkUpdateGstRate,
} from "../../controllers/admin/menu.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";
import { upload } from "../../middleware/multer.middleware.js";

const router = express.Router();

// Food Categories
router.get(
  "/categories",
  rbac({ permissions: ["manageMenu"] }),
  getAllCategories
);

router.post(
  "/categories",
  upload.single("image"),
  rbac({ permissions: ["manageMenu"] }),
  createCategory
);

router.get(
  "/categories/:categoryId",
  rbac({ permissions: ["manageMenu"] }),
  getCategoryById
);

router.put(
  "/categories/:categoryId",
  upload.single("image"),
  rbac({ permissions: ["manageMenu"] }),
  updateCategory
);

router.delete(
  "/categories/:categoryId",
  rbac({ permissions: ["manageMenu"] }),
  deleteCategory
);

// Food Items
router.get("/items", rbac({ permissions: ["manageMenu"] }), getAllFoodItems);

router.post(
  "/items",
  upload.single("image"),
  rbac({ permissions: ["manageMenu"] }),
  createFoodItem
);

router.get(
  "/items/:itemId",
  rbac({ permissions: ["manageMenu"] }),
  getFoodItemById
);

router.put(
  "/items/:itemId",
  upload.single("image"),
  rbac({ permissions: ["manageMenu"] }),
  updateFoodItem
);

router.delete(
  "/items/:itemId",
  rbac({ permissions: ["manageMenu"] }),
  deleteFoodItem
);

// Update single item availability
router.patch(
  "/items/:itemId/availability",
  rbac({ permissions: ["manageMenu"] }),
  updateSingleFoodItemAvailability
);

// Bulk update items availability
router.patch(
  "/items/availability",
  rbac({ permissions: ["manageMenu"] }),
  updateFoodItemAvailability
);

// Bulk update GST rates by category
router.put(
  "/bulk-update-gst",
  rbac({ permissions: ["manageMenu"] }),
  validateBulkGstUpdate,
  bulkUpdateGstRate
);

export default router;
