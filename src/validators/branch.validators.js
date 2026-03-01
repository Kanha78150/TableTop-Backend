import Joi from "joi";

export const validateBranch = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).required(),
    // branchId will be auto-generated, so not required in validation
    hotel: Joi.string().required(), // ObjectId as string
    location: Joi.object({
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
    }).required(),
    operatingHours: Joi.object({
      openTime: Joi.string()
        .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .required()
        .messages({
          "string.pattern.base": "Open time must be in HH:MM format",
        }),
      closeTime: Joi.string()
        .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .required()
        .messages({
          "string.pattern.base": "Close time must be in HH:MM format",
        }),
      isOpen24Hours: Joi.boolean().optional(),
    }).required(),
    capacity: Joi.object({
      totalTables: Joi.number().integer().min(1).required(),
      maxOccupancy: Joi.number().integer().min(1).required(),
    }).required(),
    amenities: Joi.array().items(Joi.string()).optional(),
    images: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          alt: Joi.string().allow(""),
        })
      )
      .optional(),
  });
  return schema.validate(data);
};

export const validateUpdateBranch = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    location: Joi.object({
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
    }).optional(),
    operatingHours: Joi.object({
      openTime: Joi.string()
        .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .optional()
        .messages({
          "string.pattern.base": "Open time must be in HH:MM format",
        }),
      closeTime: Joi.string()
        .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .optional()
        .messages({
          "string.pattern.base": "Close time must be in HH:MM format",
        }),
      isOpen24Hours: Joi.boolean().optional(),
    }).optional(),
    capacity: Joi.object({
      totalTables: Joi.number().integer().min(1).optional(),
      maxOccupancy: Joi.number().integer().min(1).optional(),
    }).optional(),
    amenities: Joi.array().items(Joi.string()).optional(),
    images: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          alt: Joi.string().allow(""),
        })
      )
      .optional(),
    status: Joi.string().valid("active", "inactive", "maintenance").optional(),
  });
  return schema.validate(data);
};

// Validation for location-based branch search
export const validateBranchLocationSearch = (data) => {
  const schema = Joi.object({
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    pincode: Joi.string()
      .pattern(/^[0-9]{6}$/)
      .optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    radius: Joi.number().min(0.1).max(100).optional(), // radius in km
    hotelId: Joi.string().optional(), // to filter branches by specific hotel
  });
  return schema.validate(data);
};

