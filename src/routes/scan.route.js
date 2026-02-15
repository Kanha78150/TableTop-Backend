import express from "express";
// Import controllers
import {
  handleQRScan,
  validateQRScan,
  getTableInfo,
  recordScanEvent,
  getMenuForTable,
} from "../controllers/user/qrScan.controller.js";

const router = express.Router();

// ======================
// PUBLIC QR SCAN ROUTES
// ======================

// Main QR scan handler - supports both authenticated and unauthenticated users
// GET /api/v1/scan?hotelId=xxx&branchId=yyy&tableNo=z
router.get("/", handleQRScan);

// Validate QR code data
// POST /api/v1/scan/validate
router.post("/validate", validateQRScan);

// Get table information (public)
// GET /api/v1/scan/table-info?hotelId=xxx&branchId=yyy&tableNo=z
router.get("/table-info", getTableInfo);

// Get menu for scanned table (public)
// GET /api/v1/scan/menu?hotelId=xxx&branchId=yyy&tableNo=z
router.get("/menu", getMenuForTable);

// Record scan event for analytics (public)
// POST /api/v1/scan/record
router.post("/record", recordScanEvent);

export default router;
