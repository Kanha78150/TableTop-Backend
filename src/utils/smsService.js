import twilio from "twilio";

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

export const sendSmsOtp = async (phone, otp) => {
  await client.messages.create({
    body: `Your RMS verification OTP is: ${otp}`,
    from: process.env.TWILIO_PHONE,
    to: phone,
  });
};
