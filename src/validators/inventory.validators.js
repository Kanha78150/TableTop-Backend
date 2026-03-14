import Joi from "joi";

export const validateInventory = (data) => {
  const schema = Joi.object({
    branch: Joi.string().required(),
    itemName: Joi.string().required(),
    quantity: Joi.number().min(0).required(),
    unit: Joi.string().required(),
    threshold: Joi.number().min(0),
  });
  return schema.validate(data);
};

