import { validationResult } from "express-validator";
import { APIError } from "../utils/APIError.js";

/**
 * Validation middleware to handle express-validator results
 */
export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
    }));

    throw new APIError(400, "Validation Error", errorMessages);
  }

  next();
};
