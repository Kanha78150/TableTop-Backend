import offerService from "../../services/offer.service.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";

class UserOfferController {
  /**
   * Get available offers for a specific hotel/branch
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware function
   */
  async getAvailableOffers(req, res, next) {
    try {
      const { hotelId, branchId } = req.params;

      if (!hotelId) {
        return next(new APIError(400, "Hotel ID is required"));
      }

      // Validate hotel ID format
      if (!/^HTL-\d{4}-\d{5}$/.test(hotelId)) {
        return next(new APIError(400, "Invalid hotel ID format"));
      }

      // Validate branch ID format if provided
      if (branchId && !/^BRN-[A-Z0-9]+-\d{5}$/.test(branchId)) {
        return next(new APIError(400, "Invalid branch ID format"));
      }

      const offers = await offerService.getAvailableOffersForUser(
        hotelId,
        branchId
      );

      return res
        .status(200)
        .json(
          new APIResponse(200, offers, "Available offers fetched successfully")
        );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate offer code for a specific hotel/branch
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware function
   */
  async validateOfferCode(req, res, next) {
    try {
      const { code } = req.params;
      const { hotelId, branchId, orderValue } = req.query;

      if (!code) {
        return next(new APIError(400, "Offer code is required"));
      }

      if (!hotelId) {
        return next(new APIError(400, "Hotel ID is required"));
      }

      if (!orderValue || orderValue <= 0) {
        return next(new APIError(400, "Valid order value is required"));
      }

      const now = new Date();
      const offer = await offerService.getOfferByCode(code);

      // Validate offer exists and is active
      if (!offer || !offer.isActive) {
        return next(new APIError(400, "Invalid or inactive offer code"));
      }

      // Validate offer hasn't expired
      if (new Date(offer.expiryDate) < now) {
        return next(new APIError(400, "Offer has expired"));
      }

      // Validate offer scope
      if (offer.hotelId !== hotelId) {
        return next(
          new APIError(
            "This offer is not applicable for the selected hotel",
            400
          )
        );
      }

      if (offer.applicableFor === "branch" && offer.branchId !== branchId) {
        return next(
          new APIError(
            "This offer is not applicable for the selected branch",
            400
          )
        );
      }

      // Check minimum order value
      const minOrderValue = offer.minOrderValue || 0;
      if (parseFloat(orderValue) < minOrderValue) {
        return res.status(200).json(
          new APIResponse(
            200,
            {
              valid: false,
              message: `Minimum order value of ₹${minOrderValue} required for this offer`,
              minOrderValue,
            },
            "Offer validation completed"
          )
        );
      }

      // Calculate discount
      let discountAmount = 0;
      if (offer.discountType === "percent") {
        discountAmount = Math.min(
          (parseFloat(orderValue) * offer.discountValue) / 100,
          offer.maxDiscountAmount || parseFloat(orderValue)
        );
      } else {
        discountAmount = Math.min(offer.discountValue, parseFloat(orderValue));
      }

      return res.status(200).json(
        new APIResponse(
          200,
          {
            valid: true,
            offer: {
              code: offer.code,
              title: offer.title,
              description: offer.description,
              discountType: offer.discountType,
              discountValue: offer.discountValue,
              discountAmount: Math.round(discountAmount * 100) / 100,
              minOrderValue: offer.minOrderValue || 0,
              maxDiscountAmount: offer.maxDiscountAmount,
            },
          },
          "Offer is valid"
        )
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get smart offer recommendations based on user's cart
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware function
   */
  async getSmartOfferRecommendations(req, res, next) {
    try {
      const { hotelId, branchId } = req.params;
      const userId = req.user._id;

      if (!hotelId) {
        return next(new APIError(400, "Hotel ID is required"));
      }

      // Validate hotel ID format
      if (!/^HTL-\d{4}-\d{5}$/.test(hotelId)) {
        return next(new APIError(400, "Invalid hotel ID format"));
      }

      // Validate branch ID format if provided
      if (branchId && !/^BRN-[A-Z0-9]+-\d{5}$/.test(branchId)) {
        return next(new APIError(400, "Invalid branch ID format"));
      }

      const recommendations = await offerService.getSmartOfferRecommendations(
        userId,
        hotelId,
        branchId
      );

      return res
        .status(200)
        .json(
          new APIResponse(
            200,
            recommendations,
            "Smart offer recommendations fetched successfully"
          )
        );
    } catch (error) {
      next(error);
    }
  }
}

export default new UserOfferController();
