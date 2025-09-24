import { Offer } from "../models/Offer.model.js";
import { FoodCategory } from "../models/FoodCategory.model.js";
import { FoodItem } from "../models/FoodItem.model.js";
import { APIError } from "../utils/APIError.js";
import mongoose from "mongoose";

class OfferService {
  /**
   * Create a new offer
   * @param {Object} offerData - Offer data
   * @param {String} adminId - Admin ID who is creating the offer
   * @returns {Promise<Object>} Created offer
   */
  async createOffer(offerData, adminId) {
    try {
      // Validate discount value based on type
      if (
        offerData.discountType === "percent" &&
        offerData.discountValue > 100
      ) {
        throw new APIError("Percentage discount cannot exceed 100%", 400);
      }

      // Validate expiry date
      if (new Date(offerData.expiryDate) <= new Date()) {
        throw new APIError("Expiry date must be in the future", 400);
      }

      // Validate food category or food item if provided
      if (offerData.foodCategory) {
        const categoryExists = await FoodCategory.findById(
          offerData.foodCategory
        );
        if (!categoryExists) {
          throw new APIError("Food category not found", 404);
        }
      }

      if (offerData.foodItem) {
        const itemExists = await FoodItem.findById(offerData.foodItem);
        if (!itemExists) {
          throw new APIError("Food item not found", 404);
        }
      }

      // Check if offer code already exists
      const existingOffer = await Offer.findOne({ code: offerData.code });
      if (existingOffer) {
        throw new APIError("Offer code already exists", 409);
      }

      // Create offer with admin reference
      const offer = new Offer({
        ...offerData,
        createdBy: adminId,
      });

      const savedOffer = await offer.save();

      // Populate references for response
      await savedOffer.populate([
        { path: "foodCategory", select: "name categoryId" },
        { path: "foodItem", select: "name itemId price" },
        { path: "createdBy", select: "name email" },
      ]);

      return savedOffer;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      if (error.code === 11000) {
        throw new APIError("Offer code already exists", 409);
      }
      throw new APIError(`Failed to create offer: ${error.message}`, 500);
    }
  }

  /**
   * Get all offers with pagination and filtering
   * @param {Object} filters - Filter criteria
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Offers with pagination info
   */
  async getAllOffers(filters = {}, pagination = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = pagination;

      const {
        isActive,
        discountType,
        foodCategory,
        foodItem,
        search,
        expired,
      } = filters;

      // Build query
      const query = {};

      if (isActive !== undefined) {
        query.isActive = isActive;
      }

      if (discountType) {
        query.discountType = discountType;
      }

      if (foodCategory) {
        query.foodCategory = foodCategory;
      }

      if (foodItem) {
        query.foodItem = foodItem;
      }

      if (search) {
        query.$or = [
          { code: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      // Filter by expiry status
      const now = new Date();
      if (expired === true) {
        query.expiryDate = { $lt: now };
      } else if (expired === false) {
        query.expiryDate = { $gte: now };
      }

      const skip = (page - 1) * limit;
      const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

      const [offers, totalCount] = await Promise.all([
        Offer.find(query)
          .populate("foodCategory", "name categoryId")
          .populate("foodItem", "name itemId price")
          .populate("createdBy", "name email")
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean(),
        Offer.countDocuments(query),
      ]);

      return {
        offers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page < Math.ceil(totalCount / limit),
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      throw new APIError(`Failed to fetch offers: ${error.message}`, 500);
    }
  }

  /**
   * Get offer by ID
   * @param {String} offerId - Offer ID
   * @returns {Promise<Object>} Offer details
   */
  async getOfferById(offerId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(offerId)) {
        throw new APIError("Invalid offer ID", 400);
      }

      const offer = await Offer.findById(offerId)
        .populate("foodCategory", "name categoryId description")
        .populate("foodItem", "name itemId price description")
        .populate("createdBy", "name email")
        .lean();

      if (!offer) {
        throw new APIError("Offer not found", 404);
      }

      // Add expiry status
      offer.isExpired = new Date(offer.expiryDate) < new Date();

      return offer;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`Failed to fetch offer: ${error.message}`, 500);
    }
  }

  /**
   * Get offer by code
   * @param {String} code - Offer code
   * @returns {Promise<Object>} Offer details
   */
  async getOfferByCode(code) {
    try {
      const offer = await Offer.findOne({ code: code.toUpperCase() })
        .populate("foodCategory", "name categoryId")
        .populate("foodItem", "name itemId price")
        .lean();

      if (!offer) {
        throw new APIError("Offer not found", 404);
      }

      // Check if offer is valid
      const now = new Date();
      if (!offer.isActive) {
        throw new APIError("Offer is not active", 400);
      }

      if (new Date(offer.expiryDate) < now) {
        throw new APIError("Offer has expired", 400);
      }

      return offer;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`Failed to fetch offer: ${error.message}`, 500);
    }
  }

  /**
   * Update offer
   * @param {String} offerId - Offer ID
   * @param {Object} updateData - Update data
   * @param {String} adminId - Admin ID who is updating
   * @returns {Promise<Object>} Updated offer
   */
  async updateOffer(offerId, updateData, adminId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(offerId)) {
        throw new APIError("Invalid offer ID", 400);
      }

      const existingOffer = await Offer.findById(offerId);
      if (!existingOffer) {
        throw new APIError("Offer not found", 404);
      }

      // Validate discount value if being updated
      if (
        updateData.discountType === "percent" &&
        updateData.discountValue > 100
      ) {
        throw new APIError("Percentage discount cannot exceed 100%", 400);
      }

      // Validate expiry date if being updated
      if (
        updateData.expiryDate &&
        new Date(updateData.expiryDate) <= new Date()
      ) {
        throw new APIError("Expiry date must be in the future", 400);
      }

      // Validate food category if being updated
      if (updateData.foodCategory) {
        const categoryExists = await FoodCategory.findById(
          updateData.foodCategory
        );
        if (!categoryExists) {
          throw new APIError("Food category not found", 404);
        }
      }

      // Validate food item if being updated
      if (updateData.foodItem) {
        const itemExists = await FoodItem.findById(updateData.foodItem);
        if (!itemExists) {
          throw new APIError("Food item not found", 404);
        }
      }

      // Check if new code already exists (if code is being updated)
      if (updateData.code && updateData.code !== existingOffer.code) {
        const codeExists = await Offer.findOne({
          code: updateData.code,
          _id: { $ne: offerId },
        });
        if (codeExists) {
          throw new APIError("Offer code already exists", 409);
        }
      }

      const updatedOffer = await Offer.findByIdAndUpdate(
        offerId,
        {
          ...updateData,
          updatedBy: adminId,
        },
        { new: true, runValidators: true }
      ).populate([
        { path: "foodCategory", select: "name categoryId" },
        { path: "foodItem", select: "name itemId price" },
        { path: "createdBy", select: "name email" },
      ]);

      return updatedOffer;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      if (error.code === 11000) {
        throw new APIError("Offer code already exists", 409);
      }
      throw new APIError(`Failed to update offer: ${error.message}`, 500);
    }
  }

  /**
   * Delete offer
   * @param {String} offerId - Offer ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteOffer(offerId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(offerId)) {
        throw new APIError("Invalid offer ID", 400);
      }

      const offer = await Offer.findById(offerId);
      if (!offer) {
        throw new APIError("Offer not found", 404);
      }

      await Offer.findByIdAndDelete(offerId);

      return { message: "Offer deleted successfully" };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`Failed to delete offer: ${error.message}`, 500);
    }
  }

  /**
   * Toggle offer status (active/inactive)
   * @param {String} offerId - Offer ID
   * @param {String} adminId - Admin ID
   * @returns {Promise<Object>} Updated offer
   */
  async toggleOfferStatus(offerId, adminId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(offerId)) {
        throw new APIError("Invalid offer ID", 400);
      }

      const offer = await Offer.findById(offerId);
      if (!offer) {
        throw new APIError("Offer not found", 404);
      }

      const updatedOffer = await Offer.findByIdAndUpdate(
        offerId,
        {
          isActive: !offer.isActive,
          updatedBy: adminId,
        },
        { new: true }
      ).populate([
        { path: "foodCategory", select: "name categoryId" },
        { path: "foodItem", select: "name itemId price" },
      ]);

      return updatedOffer;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(
        `Failed to toggle offer status: ${error.message}`,
        500
      );
    }
  }

  /**
   * Apply multiple offers to order with stacking support
   * @param {Object} orderData - Order data with items and total
   * @param {Array} specificOfferCodes - Optional array of specific offer codes to apply
   * @returns {Promise<Object>} Complete discount calculation with all applicable offers
   */
  async applyOffers(orderData, specificOfferCodes = []) {
    try {
      const { items = [], orderValue = 0, hotel, branch } = orderData;

      if (!items.length || orderValue <= 0) {
        throw new APIError(
          "Invalid order data: items and orderValue are required",
          400
        );
      }

      // Get all active offers or specific ones
      let offers = [];
      if (specificOfferCodes.length > 0) {
        // Apply specific offers
        for (const code of specificOfferCodes) {
          try {
            const offer = await this.getOfferByCode(code);
            offers.push(offer);
          } catch (error) {
            // Skip invalid offer codes but continue with others
            console.warn(
              `Offer code ${code} is invalid or expired:`,
              error.message
            );
          }
        }
      } else {
        // Get all active offers that could apply to this order
        const activeOffersResult = await this.getAllOffers(
          {
            isActive: true,
            expired: false,
            hotel: hotel || null,
            branch: branch || null,
          },
          { page: 1, limit: 100 } // Get first 100 active offers
        );
        offers = activeOffersResult.offers;
      }

      if (!offers.length) {
        return {
          originalAmount: orderValue,
          finalAmount: orderValue,
          totalDiscount: 0,
          appliedOffers: [],
          savings: 0,
        };
      }

      // Group items by category for easier processing
      const itemsByCategory = {};
      const itemsById = {};

      for (const item of items) {
        const categoryId =
          item.category?.toString() || item.foodCategory?.toString();
        const itemId = item._id?.toString() || item.foodItem?.toString();

        if (categoryId) {
          if (!itemsByCategory[categoryId]) {
            itemsByCategory[categoryId] = [];
          }
          itemsByCategory[categoryId].push(item);
        }

        if (itemId) {
          itemsById[itemId] = item;
        }
      }

      let appliedOffers = [];
      let totalCategoryDiscount = 0;
      let totalOrderDiscount = 0;

      // Sort offers by priority (percentage offers first, then by discount value)
      offers.sort((a, b) => {
        // Percentage offers generally give better discounts
        if (a.discountType === "percent" && b.discountType === "flat")
          return -1;
        if (a.discountType === "flat" && b.discountType === "percent") return 1;

        // Within same type, prioritize higher discount values
        return b.discountValue - a.discountValue;
      });

      for (const offer of offers) {
        let offerApplied = false;
        let offerDiscount = 0;
        let applicableAmount = 0;
        let applicableItems = [];

        // Check if offer applies to specific category
        if (offer.applicableFor === "category" && offer.foodCategory) {
          const categoryId =
            offer.foodCategory._id?.toString() || offer.foodCategory.toString();
          const categoryItems = itemsByCategory[categoryId] || [];

          for (const item of categoryItems) {
            applicableAmount += (item.price || 0) * (item.quantity || 1);
            applicableItems.push(item);
          }

          if (
            applicableAmount > 0 &&
            applicableAmount >= (offer.minOrderValue || 0)
          ) {
            offerDiscount = this.calculateDiscount(offer, applicableAmount);
            offerApplied = true;
            totalCategoryDiscount += offerDiscount;
          }
        }

        // Check if offer applies to specific item
        else if (offer.applicableFor === "item" && offer.foodItem) {
          const itemId =
            offer.foodItem._id?.toString() || offer.foodItem.toString();
          const specificItem = itemsById[itemId];

          if (specificItem) {
            applicableAmount =
              (specificItem.price || 0) * (specificItem.quantity || 1);
            if (applicableAmount >= (offer.minOrderValue || 0)) {
              offerDiscount = this.calculateDiscount(offer, applicableAmount);
              offerApplied = true;
              applicableItems.push(specificItem);
              totalCategoryDiscount += offerDiscount;
            }
          }
        }

        // Check if offer applies to whole order (minimum order value)
        else if (
          offer.applicableFor === "all" ||
          (!offer.foodCategory && !offer.foodItem)
        ) {
          if (orderValue >= (offer.minOrderValue || 0)) {
            applicableAmount = orderValue;
            offerDiscount = this.calculateDiscount(offer, applicableAmount);
            offerApplied = true;
            totalOrderDiscount += offerDiscount;
            applicableItems = [...items]; // All items are applicable
          }
        }

        // Check hotel specific offers
        else if (offer.applicableFor === "hotel" && offer.hotel) {
          const offerHotelId =
            offer.hotel._id?.toString() || offer.hotel.toString();
          const orderHotelId = hotel?.toString();

          if (
            offerHotelId === orderHotelId &&
            orderValue >= (offer.minOrderValue || 0)
          ) {
            applicableAmount = orderValue;
            offerDiscount = this.calculateDiscount(offer, applicableAmount);
            offerApplied = true;
            totalOrderDiscount += offerDiscount;
            applicableItems = [...items];
          }
        }

        // Check branch specific offers
        else if (offer.applicableFor === "branch" && offer.branch) {
          const offerBranchId =
            offer.branch._id?.toString() || offer.branch.toString();
          const orderBranchId = branch?.toString();

          if (
            offerBranchId === orderBranchId &&
            orderValue >= (offer.minOrderValue || 0)
          ) {
            applicableAmount = orderValue;
            offerDiscount = this.calculateDiscount(offer, applicableAmount);
            offerApplied = true;
            totalOrderDiscount += offerDiscount;
            applicableItems = [...items];
          }
        }

        // If offer was applied, add to applied offers list
        if (offerApplied && offerDiscount > 0) {
          appliedOffers.push({
            id: offer._id,
            code: offer.code,
            title: offer.title || offer.description,
            description: offer.description,
            discountType: offer.discountType,
            discountValue: offer.discountValue,
            applicableFor: offer.applicableFor,
            applicableAmount: Math.round(applicableAmount * 100) / 100,
            discountAmount: Math.round(offerDiscount * 100) / 100,
            applicableItems: applicableItems.length,
            maxDiscountAmount: offer.maxDiscountAmount,
          });
        }
      }

      // Calculate final totals
      const totalDiscount =
        Math.round((totalCategoryDiscount + totalOrderDiscount) * 100) / 100;
      const finalAmount = Math.max(0, orderValue - totalDiscount);
      const savings =
        totalDiscount > 0 ? Math.round((totalDiscount / orderValue) * 100) : 0;

      return {
        originalAmount: orderValue,
        finalAmount: Math.round(finalAmount * 100) / 100,
        totalDiscount,
        totalCategoryDiscount: Math.round(totalCategoryDiscount * 100) / 100,
        totalOrderDiscount: Math.round(totalOrderDiscount * 100) / 100,
        appliedOffers,
        offersApplied: appliedOffers.length,
        savings: `${savings}%`,
        breakdown: {
          subtotal: orderValue,
          categoryDiscounts: Math.round(totalCategoryDiscount * 100) / 100,
          orderDiscounts: Math.round(totalOrderDiscount * 100) / 100,
          finalTotal: Math.round(finalAmount * 100) / 100,
        },
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`Failed to apply offers: ${error.message}`, 500);
    }
  }

  /**
   * Calculate discount amount based on offer type
   * @param {Object} offer - Offer object
   * @param {Number} applicableAmount - Amount to apply discount to
   * @returns {Number} Discount amount
   */
  calculateDiscount(offer, applicableAmount) {
    let discount = 0;

    if (offer.discountType === "flat") {
      discount = Math.min(offer.discountValue, applicableAmount);
    } else if (offer.discountType === "percent") {
      discount = (applicableAmount * offer.discountValue) / 100;
    }

    // Apply maximum discount cap if specified
    if (offer.maxDiscountAmount && discount > offer.maxDiscountAmount) {
      discount = offer.maxDiscountAmount;
    }

    return discount;
  }

  /**
   * Legacy function - Apply single offer by code (kept for backward compatibility)
   * @param {String} offerCode - Offer code
   * @param {Object} orderData - Order data for validation
   * @returns {Promise<Object>} Discount calculation
   */
  async applyOffer(offerCode, orderData) {
    try {
      const result = await this.applyOffers(orderData, [offerCode]);

      if (result.appliedOffers.length === 0) {
        throw new APIError(
          `Offer ${offerCode} is not applicable to this order`,
          400
        );
      }

      const appliedOffer = result.appliedOffers[0];

      return {
        offer: {
          id: appliedOffer.id,
          code: appliedOffer.code,
          description: appliedOffer.description,
          discountType: appliedOffer.discountType,
          discountValue: appliedOffer.discountValue,
        },
        applicableAmount: appliedOffer.applicableAmount,
        discountAmount: appliedOffer.discountAmount,
        finalAmount: result.finalAmount,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`Failed to apply offer: ${error.message}`, 500);
    }
  }

  /**
   * Get active offers for a specific category or item
   * @param {Object} filters - Category or item filters
   * @returns {Promise<Array>} Active offers
   */
  async getActiveOffersFor(filters = {}) {
    try {
      const { foodCategory, foodItem } = filters;
      const now = new Date();

      const query = {
        isActive: true,
        expiryDate: { $gte: now },
      };

      if (foodCategory) {
        query.$or = [
          { foodCategory },
          { foodCategory: null, foodItem: null }, // General offers
        ];
      }

      if (foodItem) {
        query.$or = [
          { foodItem },
          { foodCategory: null, foodItem: null }, // General offers
        ];
      }

      if (!foodCategory && !foodItem) {
        // Get only general offers (not specific to any category or item)
        query.foodCategory = null;
        query.foodItem = null;
      }

      const offers = await Offer.find(query)
        .select(
          "code description discountType discountValue minOrderValue expiryDate"
        )
        .sort({ discountValue: -1 })
        .lean();

      return offers;
    } catch (error) {
      throw new APIError(
        `Failed to fetch active offers: ${error.message}`,
        500
      );
    }
  }
}

export default new OfferService();
