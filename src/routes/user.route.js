import express from "express";
import {
  getHotels,
  getHotelDetails,
  getHotelBranchesByLocation,
  searchNearbyHotels,
  getBranchDetails,
} from "../controllers/user/hotelController.js";

const router = express.Router();

// Hotel routes for users
router.get("/hotels", getHotels);
router.get("/hotels/search-nearby", searchNearbyHotels);
router.get("/hotels/:hotelId", getHotelDetails);
router.get("/hotels/:hotelId/branches", getHotelBranchesByLocation);

// Branch routes for users
router.get("/branches/:branchId", getBranchDetails);

export default router;
