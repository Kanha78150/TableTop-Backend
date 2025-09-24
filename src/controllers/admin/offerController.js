import offerService from "../../services/offerService.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { offerValidationSchemas } from "../../models/Offer.model.js";
import Joi from "joi";

class OfferController {
  /**
   * Create new offer - Admin only
   */
  async createOffer(req, res, next) {
    try {
      // Validate request body
      const { error, value } = offerValidationSchemas.create.validate(req.body);
      if (error) {
        return next(new APIError(error.details[0].message, 400));
      }

      const adminId = req.user.id;
      const offer = await offerService.createOffer(value, adminId);

      return res
        .status(201)
        .json(new APIResponse(201, offer, "Offer created successfully"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all offers with pagination and filtering - Admin only
   */
  async getAllOffers(req, res, next) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
        isActive,
        discountType,
        foodCategory,
        foodItem,
        search,
        expired,
      } = req.query;

      // Validate pagination
      const paginationSchema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(10),
        sortBy: Joi.string()
          .valid(
            "createdAt",
            "updatedAt",
            "expiryDate",
            "discountValue",
            "code"
          )
          .default("createdAt"),
        sortOrder: Joi.string().valid("asc", "desc").default("desc"),
      });

      const { error: paginationError, value: pagination } =
        paginationSchema.validate({
          page: parseInt(page),
          limit: parseInt(limit),
          sortBy,
          sortOrder,
        });

      if (paginationError) {
        return next(new APIError(paginationError.details[0].message, 400));
      }

      const filters = {};

      if (isActive !== undefined) {
        filters.isActive = isActive === "true";
      }

      if (discountType) {
        filters.discountType = discountType;
      }

      if (foodCategory) {
        filters.foodCategory = foodCategory;
      }

      if (foodItem) {
        filters.foodItem = foodItem;
      }

      if (search) {
        filters.search = search;
      }

      if (expired !== undefined) {
        filters.expired = expired === "true";
      }

      const result = await offerService.getAllOffers(filters, pagination);

      return res
        .status(200)
        .json(new APIResponse(200, result, "Offers fetched successfully"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get offer by ID - Admin only
   */
  async getOfferById(req, res, next) {
    try {
      const { offerId } = req.params;

      if (!offerId) {
        return next(new APIError("Offer ID is required", 400));
      }

      const offer = await offerService.getOfferById(offerId);

      return res
        .status(200)
        .json(new APIResponse(200, offer, "Offer fetched successfully"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get offer by code - Admin only
   */
  async getOfferByCode(req, res, next) {
    try {
      const { code } = req.params;

      if (!code) {
        return next(new APIError("Offer code is required", 400));
      }

      const offer = await offerService.getOfferByCode(code);

      return res
        .status(200)
        .json(new APIResponse(200, offer, "Offer fetched successfully"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update offer - Admin only
   */
  async updateOffer(req, res, next) {
    try {
      const { offerId } = req.params;

      if (!offerId) {
        return next(new APIError("Offer ID is required", 400));
      }

      // Validate update data
      const { error, value } = offerValidationSchemas.update.validate(req.body);
      if (error) {
        return next(new APIError(error.details[0].message, 400));
      }

      const adminId = req.user.id;
      const updatedOffer = await offerService.updateOffer(
        offerId,
        value,
        adminId
      );

      return res
        .status(200)
        .json(new APIResponse(200, updatedOffer, "Offer updated successfully"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete offer - Admin only
   */
  async deleteOffer(req, res, next) {
    try {
      const { offerId } = req.params;

      if (!offerId) {
        return next(new APIError("Offer ID is required", 400));
      }

      await offerService.deleteOffer(offerId);

      return res
        .status(200)
        .json(new APIResponse(200, null, "Offer deleted successfully"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Toggle offer status (active/inactive) - Admin only
   */
  async toggleOfferStatus(req, res, next) {
    try {
      const { offerId } = req.params;

      if (!offerId) {
        return next(new APIError("Offer ID is required", 400));
      }

      const adminId = req.user.id;
      const updatedOffer = await offerService.toggleOfferStatus(
        offerId,
        adminId
      );

      return res
        .status(200)
        .json(
          new APIResponse(
            200,
            updatedOffer,
            "Offer status updated successfully"
          )
        );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Apply multiple offers to order with stacking support - Admin only
   */
  async applyOffers(req, res, next) {
    try {
      const { codes } = req.body; // Array of offer codes
      const orderData = req.body;

      // Validate order data
      const orderSchema = Joi.object({
        items: Joi.array()
          .items(
            Joi.object({
              _id: Joi.string().optional(),
              foodItem: Joi.string().optional(),
              category: Joi.string().optional(),
              foodCategory: Joi.string().optional(),
              price: Joi.number().positive().required(),
              quantity: Joi.number().integer().min(1).required(),
            })
          )
          .required(),
        orderValue: Joi.number().positive().required(),
        hotel: Joi.string().optional(),
        branch: Joi.string().optional(),
        codes: Joi.array().items(Joi.string()).optional(), // Specific offer codes to apply
      });

      const { error, value } = orderSchema.validate(orderData);
      if (error) {
        return next(new APIError(error.details[0].message, 400));
      }

      // Apply offers (with or without specific codes)
      const result = await offerService.applyOffers(value, value.codes || []);

      return res
        .status(200)
        .json(new APIResponse(200, result, "Offers applied successfully"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Apply single offer to order (for testing/validation) - Admin only
   */
  async applyOffer(req, res, next) {
    try {
      const { code } = req.params;
      const orderData = req.body;

      if (!code) {
        return next(new APIError("Offer code is required", 400));
      }

      // Validate order data
      const orderSchema = Joi.object({
        items: Joi.array()
          .items(
            Joi.object({
              foodItem: Joi.string().optional(),
              category: Joi.string().optional(),
              price: Joi.number().positive().required(),
              quantity: Joi.number().integer().min(1).required(),
            })
          )
          .required(),
        orderValue: Joi.number().positive().required(),
      });

      const { error, value } = orderSchema.validate(orderData);
      if (error) {
        return next(new APIError(error.details[0].message, 400));
      }

      const result = await offerService.applyOffer(code, value);

      return res
        .status(200)
        .json(new APIResponse(200, result, "Offer applied successfully"));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get active offers for specific category or item - Admin only
   */
  async getActiveOffersFor(req, res, next) {
    try {
      const { foodCategory, foodItem } = req.query;

      const filters = {};
      if (foodCategory) filters.foodCategory = foodCategory;
      if (foodItem) filters.foodItem = foodItem;

      const offers = await offerService.getActiveOffersFor(filters);

      return res
        .status(200)
        .json(
          new APIResponse(200, offers, "Active offers fetched successfully")
        );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get offers statistics - Admin only
   */
  async getOfferStats(req, res, next) {
    try {
      const now = new Date();

      // Get basic stats using aggregation
      const stats = await offerService.getAllOffers({}, { page: 1, limit: 1 });

      // Additional stats can be calculated here
      const activeOffersResult = await offerService.getAllOffers(
        { isActive: true, expired: false },
        { page: 1, limit: 1 }
      );

      const expiredOffersResult = await offerService.getAllOffers(
        { expired: true },
        { page: 1, limit: 1 }
      );

      const statisticsData = {
        totalOffers: stats.pagination.totalCount,
        activeOffers: activeOffersResult.pagination.totalCount,
        expiredOffers: expiredOffersResult.pagination.totalCount,
        inactiveOffers:
          stats.pagination.totalCount -
          activeOffersResult.pagination.totalCount,
      };

      return res
        .status(200)
        .json(
          new APIResponse(
            200,
            statisticsData,
            "Offer statistics fetched successfully"
          )
        );
    } catch (error) {
      next(error);
    }
  }
}

export default new OfferController();
