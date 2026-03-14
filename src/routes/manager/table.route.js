// src/routes/manager/table.route.js - Manager Table Management Routes
import express from "express";
import {
  requireRole,
  requireManagerOrHigher,
  requirePermission,
} from "../../middleware/roleAuth.middleware.js";
import {
  getAllTables,
  getTableDetails,
  createTable,
  updateTable,
  deleteTable,
  getTableStatus,
  updateTableStatus,
} from "../../controllers/manager/table.controller.js";

const router = express.Router();

router.get(
  "/",
  requireManagerOrHigher,
  requirePermission("manageTables"),
  getAllTables
);

router.post(
  "/",
  requireRole(["branch_manager"]),
  requirePermission("manageTables"),
  createTable
);

// Specific route before parameterized /:tableId
router.get(
  "/status",
  requireManagerOrHigher,
  requirePermission("manageTables"),
  getTableStatus
);

router.get(
  "/:tableId",
  requireManagerOrHigher,
  requirePermission("manageTables"),
  getTableDetails
);

router.put(
  "/:tableId",
  requireRole(["branch_manager"]),
  requirePermission("manageTables"),
  updateTable
);

router.delete(
  "/:tableId",
  requireRole(["branch_manager"]),
  requirePermission("manageTables"),
  deleteTable
);

router.put(
  "/:tableId/status",
  requireManagerOrHigher,
  requirePermission("manageTables"),
  updateTableStatus
);

export default router;
