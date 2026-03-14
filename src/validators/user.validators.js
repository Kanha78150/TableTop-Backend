import Joi from "joi";

export const validateUser = (data) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    username: Joi.string().alphanum().min(3).max(30).required(),
    email: Joi.string().email().required(),
    phone: Joi.string()
      .pattern(/^[+]?[0-9\s\-\(\)]{10,15}$/)
      .required()
      .messages({
        "string.pattern.base":
          "Phone number must be between 10-15 digits and can include +, spaces, -, (, )",
      }),
    password: Joi.string().min(6).required(),
  });
  return schema.validate(data);
};

export const validateEditProfile = (data) => {
  const schema = Joi.object({
    name: Joi.string().optional(),
    username: Joi.string().alphanum().min(3).max(30).optional(),
    phone: Joi.string()
      .pattern(/^[+]?[0-9\s\-\(\)]{10,15}$/)
      .optional()
      .messages({
        "string.pattern.base":
          "Phone number must be between 10-15 digits and can include +, spaces, -, (, )",
      }),
  });
  return schema.validate(data);
};

export const validateChangePassword = (data) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
  });
  return schema.validate(data);
};

export const validateResetPassword = (data) => {
  const schema = Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
  });
  return schema.validate(data);
};

export const validateOAuthUserCompletion = (data) => {
  const schema = Joi.object({
    username: Joi.string().alphanum().min(3).max(30).optional(),
    phone: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .optional(),
  });
  return schema.validate(data);
};

