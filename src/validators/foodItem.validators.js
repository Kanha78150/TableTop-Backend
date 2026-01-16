import Joi from "joi";
import { APIError } from "../utils/APIError.js";

// Valid GST rates as per Indian GST slabs
const VALID_GST_RATES = [0, 5, 12, 18, 28];

/**
 * Validate food item creation/update data
 * @param {Object} data - Food item data to validate
 * @param {boolean} isUpdate - Whether this is an update operation (makes gstRate optional)
 * @returns {Object} - Validated and sanitized data
 * @throws {APIError} - If validation fails
 */
export const validateFoodItemData = (data, isUpdate = false) => {
  const schema = Joi.object({
    name: Joi.string().trim().max(150),
    description: Joi.string().allow("").max(1000),
    shortDescription: Joi.string().allow("").max(200),
    price: Joi.number().min(0),
    discountPrice: Joi.number().min(0),
    foodType: Joi.string().valid("veg", "non-veg", "vegan", "jain"),
    gstRate: isUpdate
      ? Joi.number()
          .valid(...VALID_GST_RATES)
          .messages({
            "any.only": `GST rate must be one of: ${VALID_GST_RATES.join(
              ", "
            )}%`,
          })
      : Joi.number()
          .valid(...VALID_GST_RATES)
          .required()
          .messages({
            "any.required": "GST rate is required",
            "any.only": `GST rate must be one of: ${VALID_GST_RATES.join(
              ", "
            )}%`,
          }),
    spiceLevel: Joi.string().valid(
      "mild",
      "medium",
      "hot",
      "extra-hot",
      "none"
    ),
    dietaryInfo: Joi.object({
      glutenFree: Joi.boolean(),
      dairyFree: Joi.boolean(),
      nutFree: Joi.boolean(),
      sugarFree: Joi.boolean(),
      organic: Joi.boolean(),
    }),
    isAvailable: Joi.boolean(),
    isRecommended: Joi.boolean(),
    isBestSeller: Joi.boolean(),
    availableTimings: Joi.object({
      breakfast: Joi.boolean(),
      lunch: Joi.boolean(),
      dinner: Joi.boolean(),
      snacks: Joi.boolean(),
    }),
    categoryId: Joi.string(),
    category: Joi.string(),
    hotelId: Joi.string(),
    hotel: Joi.string(),
    branchId: Joi.string(),
    branch: Joi.string(),
    image: Joi.string().uri().allow(null, ""),
    images: Joi.array().items(Joi.string().uri()),
    nutritionalInfo: Joi.object({
      calories: Joi.number().min(0),
      protein: Joi.number().min(0),
      carbs: Joi.number().min(0),
      fat: Joi.number().min(0),
      fiber: Joi.number().min(0),
      sodium: Joi.number().min(0),
      sugar: Joi.number().min(0),
    }).unknown(false),
    preparationTime: Joi.number().min(1).max(180),
    servingSize: Joi.string(),
    ingredients: Joi.array().items(Joi.string().trim()),
    allergens: Joi.array().items(
      Joi.string().valid(
        "nuts",
        "dairy",
        "gluten",
        "soy",
        "eggs",
        "shellfish",
        "fish",
        "sesame"
      )
    ),
    tags: Joi.array().items(Joi.string().trim().max(50)),
    slug: Joi.string().lowercase().trim(),
    displayOrder: Joi.number(),
    isLimitedQuantity: Joi.boolean(),
    quantityAvailable: Joi.number().min(0).allow(null),
    createdBy: Joi.string(),
    lastModifiedBy: Joi.string(),
  }).unknown(true); // Allow other fields to pass through

  const { error, value } = schema.validate(data, { abortEarly: false });

  if (error) {
    const errorMessages = error.details
      .map((detail) => detail.message)
      .join("; ");
    throw new APIError(400, `Validation error: ${errorMessages}`);
  }

  return value;
};

/**
 * Middleware to validate GST rate in request body
 */
export const validateGstRate = (req, res, next) => {
  try {
    const { gstRate } = req.body;

    // Only validate if gstRate is provided
    if (gstRate !== undefined) {
      if (!VALID_GST_RATES.includes(gstRate)) {
        throw new APIError(
          400,
          `Invalid GST rate. Must be one of: ${VALID_GST_RATES.join(", ")}%`
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Validate bulk GST update request
 */
export const validateBulkGstUpdate = (req, res, next) => {
  try {
    const schema = Joi.object({
      categoryId: Joi.string().required().messages({
        "any.required": "Category ID is required for bulk GST update",
      }),
      gstRate: Joi.number()
        .valid(...VALID_GST_RATES)
        .required()
        .messages({
          "any.required": "GST rate is required",
          "any.only": `GST rate must be one of: ${VALID_GST_RATES.join(", ")}%`,
        }),
      hotelId: Joi.string(),
      branchId: Joi.string(),
    });

    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const errorMessages = error.details
        .map((detail) => detail.message)
        .join("; ");
      throw new APIError(400, `Validation error: ${errorMessages}`);
    }

    req.validatedData = value;
    next();
  } catch (error) {
    next(error);
  }
};

export default {
  validateFoodItemData,
  validateGstRate,
  validateBulkGstUpdate,
  VALID_GST_RATES,
};
