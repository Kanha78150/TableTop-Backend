import express from "express";
import offerController from "../../controllers/admin/offer.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";
import {
  requireActiveSubscription,
  requireFeature,
} from "../../middleware/subscriptionAuth.middleware.js";

const router = express.Router();

router.get(
  "/",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.getAllOffers
);

router.get(
  "/stats",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.getOfferStats
);

router.get(
  "/active",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.getActiveOffersFor
);

router.post(
  "/",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.createOffer
);

router.get(
  "/code/:code",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.getOfferByCode
);

router.get(
  "/:offerId",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.getOfferById
);

router.put(
  "/:offerId",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.updateOffer
);

router.patch(
  "/:offerId/toggle",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.toggleOfferStatus
);

router.delete(
  "/:offerId",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.deleteOffer
);

router.post(
  "/:code/apply",
  rbac({ permissions: ["manageOffers"] }),
  offerController.applyOffer
);

router.post(
  "/apply-multiple",
  rbac({ permissions: ["manageOffers"] }),
  offerController.applyOffers
);

export default router;
