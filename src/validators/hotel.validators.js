import Joi from "joi";

export const validateHotel = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().min(1).max(500).required(),
    // hotelId will be auto-generated, so not required in validation
    mainLocation: Joi.object({
      address: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().required(),
      country: Joi.string().default("India"),
      pincode: Joi.string()
        .pattern(/^[0-9]{6}$/)
        .required()
        .messages({
          "string.pattern.base": "Pincode must be 6 digits",
        }),
      coordinates: Joi.object({
        latitude: Joi.number().min(-90).max(90),
        longitude: Joi.number().min(-180).max(180),
      }).optional(),
    }).required(),
    contactInfo: Joi.object({
      phone: Joi.string()
        .pattern(/^[+]?[0-9\s\-\(\)]{10,15}$/)
        .required()
        .messages({
          "string.pattern.base":
            "Phone number must be between 10-15 digits and can include +, spaces, -, (, )",
        }),
      email: Joi.string().email().required(),
      website: Joi.string().uri().optional(),
    }).required(),
    images: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          alt: Joi.string().allow(""),
        })
      )
      .optional(),
    amenities: Joi.array().items(Joi.string()).optional(),
    establishedYear: Joi.number()
      .integer()
      .min(1800)
      .max(new Date().getFullYear())
      .optional(),
    starRating: Joi.number().min(1).max(5).optional(),
  });
  return schema.validate(data);
};

export const validateUpdateHotel = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    description: Joi.string().min(1).max(500).optional(),
    mainLocation: Joi.object({
      address: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      country: Joi.string().optional(),
      pincode: Joi.string()
        .pattern(/^[0-9]{6}$/)
        .optional()
        .messages({
          "string.pattern.base": "Pincode must be 6 digits",
        }),
      coordinates: Joi.object({
        latitude: Joi.number().min(-90).max(90),
        longitude: Joi.number().min(-180).max(180),
      }).optional(),
    }).optional(),
    contactInfo: Joi.object({
      phone: Joi.string()
        .pattern(/^[+]?[0-9\s\-\(\)]{10,15}$/)
        .optional()
        .messages({
          "string.pattern.base":
            "Phone number must be between 10-15 digits and can include +, spaces, -, (, )",
        }),
      email: Joi.string().email().optional(),
      website: Joi.string().uri().optional(),
    }).optional(),
    images: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          alt: Joi.string().allow(""),
        })
      )
      .optional(),
    amenities: Joi.array().items(Joi.string()).optional(),
    status: Joi.string().valid("active", "inactive", "maintenance").optional(),
    establishedYear: Joi.number()
      .integer()
      .min(1800)
      .max(new Date().getFullYear())
      .optional(),
    starRating: Joi.number().min(1).max(5).optional(),
  });
  return schema.validate(data);
};

