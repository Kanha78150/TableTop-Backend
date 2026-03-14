import Joi from "joi";

export const validateRewardHistory = (data) => {
  const schema = Joi.object({
    user: Joi.string().required(),
    coins: Joi.number().required(),
    type: Joi.string().valid("task", "order").required(),
  });
  return schema.validate(data);
};

