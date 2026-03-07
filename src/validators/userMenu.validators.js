import Joi from "joi";

// ── Shared field definitions ─────────────────────────────────────────────────
const paginationFields = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
};

const sortOrderField = Joi.string().valid("asc", "desc").default("asc");

const foodTypeField = Joi.string()
  .valid("veg", "non-veg", "vegan", "jain")
  .optional();

const spiceLevelField = Joi.string()
  .valid("mild", "medium", "hot", "extra-hot", "none")
  .optional();

const priceFields = {
  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),
};

// ── Schemas ──────────────────────────────────────────────────────────────────

/**
 * GET /categories
 */
export const getCategoriesSchema = Joi.object({
  ...paginationFields,
  sortBy: Joi.string()
    .valid("name", "displayOrder", "createdAt")
    .default("displayOrder"),
  sortOrder: sortOrderField,
  hotel: Joi.string().optional(),
  branch: Joi.string().optional(),
  search: Joi.string().optional(),
  type: Joi.string().valid("veg", "non-veg", "both").optional(),
});

/**
 * GET /items
 */
export const getFoodItemsSchema = Joi.object({
  ...paginationFields,
  sortBy: Joi.string()
    .valid("name", "price", "displayOrder", "averageRating", "createdAt")
    .default("displayOrder"),
  sortOrder: sortOrderField,
  hotel: Joi.string().optional(),
  branch: Joi.string().optional(),
  category: Joi.string().optional(),
  foodType: foodTypeField,
  search: Joi.string().optional(),
  ...priceFields,
  isRecommended: Joi.boolean().optional(),
  isBestSeller: Joi.boolean().optional(),
  spiceLevel: spiceLevelField,
});

/**
 * GET /categories/:categoryId/items
 */
export const getItemsByCategorySchema = Joi.object({
  ...paginationFields,
  sortBy: Joi.string()
    .valid("name", "price", "displayOrder", "averageRating")
    .default("displayOrder"),
  sortOrder: sortOrderField,
  foodType: foodTypeField,
  search: Joi.string().optional(),
  ...priceFields,
  spiceLevel: spiceLevelField,
});

/**
 * GET /location/:hotelId(/:branchId)
 */
export const getMenuForLocationSchema = Joi.object({
  categoryFilter: Joi.string().optional(),
  category: Joi.string().optional(),
  foodType: foodTypeField,
  ...priceFields,
  isRecommended: Joi.boolean().optional(),
  isBestSeller: Joi.boolean().optional(),
  spiceLevel: spiceLevelField,
  search: Joi.string().optional(),
  sortBy: Joi.string()
    .valid("name", "price", "displayOrder", "averageRating", "createdAt")
    .default("displayOrder"),
  sortOrder: sortOrderField,
});

/**
 * GET /categories/hotel/:hotelId(/:branchId)
 */
export const getCategoriesForScannedHotelSchema = Joi.object({
  foodType: foodTypeField,
  search: Joi.string().optional(),
  sortBy: Joi.string()
    .valid("name", "displayOrder", "createdAt")
    .default("displayOrder"),
  sortOrder: sortOrderField,
});
