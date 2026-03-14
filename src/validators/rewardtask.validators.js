import Joi from "joi";

export const validateRewardTask = (data) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().allow(""),
    coins: Joi.number().positive().required(),
  });
  return schema.validate(data);
};

