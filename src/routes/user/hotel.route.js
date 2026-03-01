// src/routes/user/hotel.route.js - User Hotel & Branch Routes (public)
import express from "express";
import {
  getHotels,
  getHotelDetails,
  getHotelBranchesByLocation,
  searchNearbyHotels,
  getAllBranches,
  getBranchDetails,
} from "../../controllers/user/hotel.controller.js";

const router = express.Router();

// Hotel routes (public - no auth required)
router.get("/hotels", getHotels);
router.get("/hotels/search-nearby", searchNearbyHotels);
router.get("/hotels/:hotelId", getHotelDetails);
router.get("/hotels/:hotelId/branches", getHotelBranchesByLocation);

// Branch routes
router.get("/branches", getAllBranches);
router.get("/branches/:branchId", getBranchDetails);

export default router;
