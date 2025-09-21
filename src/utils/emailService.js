import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generic email sending function
export const sendEmail = async ({
  to,
  subject,
  html,
  text,
  template,
  data,
}) => {
  let emailContent = html || text;

  // Handle template-based emails
  if (template && data) {
    switch (template) {
      case "admin-welcome":
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Welcome ${data.name}!</h2>
            <p>Your admin account has been created successfully.</p>
            <p>Please click the button below to verify your email address:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.verificationUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
            </div>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; background-color: #f0f0f0; padding: 10px;">${data.verificationUrl}</p>
            <p><strong>This link will expire in 24 hours.</strong></p>
            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">Hotel Management System - Admin Panel</p>
          </div>
        `;
        break;
      case "admin-password-reset":
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p>Hello ${data.name},</p>
            <p>You have requested to reset your admin account password.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.resetUrl}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            </div>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; background-color: #f0f0f0; padding: 10px;">${data.resetUrl}</p>
            <p><strong>This link will expire in 10 minutes.</strong></p>
            <p>If you didn't request this password reset, please ignore this email or contact support.</p>
            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">Hotel Management System - Admin Panel</p>
          </div>
        `;
        break;
      case "manager-welcome":
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa; padding: 20px;">
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2c3e50; margin: 0;">Welcome to ${
                  data.hotelName
                }!</h1>
                <p style="color: #7f8c8d; margin: 5px 0;">Hotel Management System</p>
              </div>
              
              <h2 style="color: #e74c3c;">Manager Account Created</h2>
              <p>Dear ${data.name},</p>
              <p>Congratulations! Your manager account has been successfully created for <strong>${
                data.hotelName
              }</strong>.</p>
              
              <div style="background-color: #ecf0f1; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #2c3e50; margin-top: 0;">Your Account Credentials:</h3>
                <p><strong>Name:</strong> ${data.name}</p>
                <p><strong>Email:</strong> ${data.email}</p>
                <p><strong>Employee ID:</strong> <span style="background-color: #3498db; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${
                  data.employeeId
                }</span></p>
                <p><strong>Temporary Password:</strong> <span style="background-color: #e74c3c; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${
                  data.password
                }</span></p>
                <p><strong>Hotel:</strong> ${data.hotelName}</p>
                ${
                  data.branchName
                    ? `<p><strong>Branch:</strong> ${data.branchName}</p>`
                    : "<p><em>No specific branch assigned - Full hotel access</em></p>"
                }
              </div>
              
              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="color: #b7850b; margin-top: 0;">🔒 Security Notice:</h4>
                <p style="color: #856404; margin-bottom: 0;">Please change your password immediately after your first login for security purposes.</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <p style="color: #7f8c8d;">Ready to get started?</p>
                <a href="${
                  process.env.FRONTEND_URL || "http://localhost:5173"
                }/manager/login" style="background-color: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Login to Dashboard</a>
              </div>
              
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ecf0f1;">
              <p style="color: #95a5a6; font-size: 12px; text-align: center;">
                This email was sent from ${
                  data.hotelName
                } Hotel Management System<br>
                If you have any questions, please contact your hotel administrator.
              </p>
            </div>
          </div>
        `;
        break;
      case "staff-welcome":
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa; padding: 20px;">
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2c3e50; margin: 0;">Welcome to ${
                  data.hotelName
                }!</h1>
                <p style="color: #7f8c8d; margin: 5px 0;">Hotel Management System</p>
              </div>
              
              <h2 style="color: #3498db;">Staff Account Created</h2>
              <p>Dear ${data.name},</p>
              <p>Welcome aboard! Your staff account has been successfully created for <strong>${
                data.hotelName
              }</strong>.</p>
              
              <div style="background-color: #ecf0f1; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #2c3e50; margin-top: 0;">Your Account Credentials:</h3>
                <p><strong>Name:</strong> ${data.name}</p>
                <p><strong>Email:</strong> ${data.email}</p>
                <p><strong>Staff ID:</strong> <span style="background-color: #9b59b6; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${
                  data.staffId
                }</span></p>
                <p><strong>Temporary Password:</strong> <span style="background-color: #e74c3c; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${
                  data.password
                }</span></p>
                <p><strong>Role:</strong> <span style="text-transform: capitalize;">${
                  data.role
                }</span></p>
                <p><strong>Department:</strong> <span style="text-transform: capitalize;">${data.department.replace(
                  "_",
                  " "
                )}</span></p>
                <p><strong>Hotel:</strong> ${data.hotelName}</p>
                ${
                  data.branchName
                    ? `<p><strong>Branch:</strong> ${data.branchName}</p>`
                    : "<p><em>No specific branch assigned</em></p>"
                }
                ${
                  data.managerName
                    ? `<p><strong>Manager:</strong> ${data.managerName}</p>`
                    : "<p><em>No manager assigned</em></p>"
                }
              </div>
              
              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="color: #b7850b; margin-top: 0;">🔒 Security Notice:</h4>
                <p style="color: #856404; margin-bottom: 0;">Please change your password immediately after your first login for security purposes.</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <p style="color: #7f8c8d;">Ready to start working?</p>
                <a href="${
                  process.env.FRONTEND_URL || "http://localhost:5173"
                }/staff/login" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Login to Dashboard</a>
              </div>
              
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ecf0f1;">
              <p style="color: #95a5a6; font-size: 12px; text-align: center;">
                This email was sent from ${
                  data.hotelName
                } Hotel Management System<br>
                If you have any questions, please contact your manager or hotel administrator.
              </p>
            </div>
          </div>
        `;
        break;
      default:
        emailContent = html || text || "No content provided";
    }
  }

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    html: emailContent,
  });
};

export const sendEmailOtp = async (to, otp) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: "Your RMS verification OTP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Email Verification</h2>
        <p>Your OTP for email verification is:</p>
        <h1 style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 5px; margin: 20px 0;">${otp}</h1>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you didn't request this verification, please ignore this email.</p>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (to, resetToken) => {
  const resetUrl = `${
    process.env.FRONTEND_URL || "http://localhost:5173"
  }/reset-password?token=${resetToken}`;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: "Password Reset Request - RMS",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>You have requested to reset your password for your account.</p>
        <p>Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all; background-color: #f0f0f0; padding: 10px;">${resetUrl}</p>
        <p><strong>This link will expire in 1 hour.</strong></p>
        <p>If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated email XYZ Company. Please do not reply to this email.</p>
      </div>
    `,
  });
};

// Send welcome email to newly created manager
export const sendManagerWelcomeEmail = async (
  managerData,
  hotelData,
  branchData = null
) => {
  await sendEmail({
    to: managerData.email,
    subject: `Welcome to ${hotelData.name} - Manager Account Created`,
    template: "manager-welcome",
    data: {
      name: managerData.name,
      email: managerData.email,
      employeeId: managerData.employeeId,
      password: managerData.tempPassword, // Plain text password (only sent once)
      hotelName: hotelData.name,
      branchName: branchData?.name || null,
    },
  });
};

// Send welcome email to newly created staff
export const sendStaffWelcomeEmail = async (
  staffData,
  hotelData,
  branchData = null,
  managerData = null
) => {
  await sendEmail({
    to: staffData.email,
    subject: `Welcome to ${hotelData.name} - Staff Account Created`,
    template: "staff-welcome",
    data: {
      name: staffData.name,
      email: staffData.email,
      staffId: staffData.staffId,
      password: staffData.tempPassword, // Plain text password (only sent once)
      role: staffData.role,
      department: staffData.department,
      hotelName: hotelData.name,
      branchName: branchData?.name || null,
      managerName: managerData?.name || null,
    },
  });
};
