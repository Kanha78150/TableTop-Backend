import Joi from "joi";

export const validateBooking = (data) => {
  const schema = Joi.object({
    user: Joi.string().required(),
    branch: Joi.string().required(),
    table: Joi.string().required(),
    bookingTime: Joi.date().greater("now").required(),
  });
  return schema.validate(data);
};

