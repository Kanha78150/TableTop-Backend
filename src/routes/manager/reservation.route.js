// src/routes/manager/reservation.route.js - Manager Reservation Management Routes
import express from "express";
import {
  requireRole,
  requireManagerOrHigher,
  requirePermission,
} from "../../middleware/roleAuth.middleware.js";
import {
  getReservations,
  createReservation,
  updateReservation,
  cancelReservation,
} from "../../controllers/manager/table.controller.js";

const router = express.Router();

router.get(
  "/",
  requireManagerOrHigher,
  requirePermission("manageReservations"),
  getReservations
);

router.post(
  "/",
  requireRole(["branch_manager"]),
  requirePermission("manageReservations"),
  createReservation
);

router.put(
  "/:reservationId",
  requireRole(["branch_manager"]),
  requirePermission("manageReservations"),
  updateReservation
);

router.delete(
  "/:reservationId",
  requireRole(["branch_manager"]),
  requirePermission("manageReservations"),
  cancelReservation
);

export default router;
