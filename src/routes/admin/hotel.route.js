import express from "express";
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
} from "../../controllers/admin/hotel.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";
import {
  requireActiveSubscription,
  checkResourceLimit,
} from "../../middleware/subscriptionAuth.middleware.js";
import { upload } from "../../middleware/multer.middleware.js";

const router = express.Router();

router.post(
  "/",
  upload.array("images", 5),
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  checkResourceLimit("hotels"),
  createHotel
);

router.get(
  "/",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getAllHotels
);

router.get(
  "/search",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  searchHotels
);

router.get(
  "/search-by-location",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  searchHotelsByLocation
);

router.get(
  "/:hotelId",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getHotelById
);

router.put(
  "/:hotelId",
  upload.array("images", 10),
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  updateHotel
);

router.delete(
  "/:hotelId",
  rbac({ roles: ["admin", "super_admin"] }),
  requireActiveSubscription,
  deleteHotel
);

router.patch(
  "/:hotelId/deactivate",
  rbac({ roles: ["admin", "super_admin"] }),
  requireActiveSubscription,
  deactivateHotel
);

router.patch(
  "/:hotelId/reactivate",
  rbac({ roles: ["admin", "super_admin"] }),
  requireActiveSubscription,
  reactivateHotel
);

router.get(
  "/:hotelId/branches",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getHotelBranchesByLocation
);

export default router;
