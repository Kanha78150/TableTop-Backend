import nodemailer from "nodemailer";

// Lazy transporter initialization to ensure env vars are loaded
let transporter = null;

function getTransporter() {
  if (!transporter) {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (!emailUser || !emailPass) {
      throw new Error(
        "Email credentials not configured. EMAIL_USER or EMAIL_PASS is missing."
      );
    }

    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: emailUser,
        pass: emailPass.replace(/\s/g, ""), // Remove any spaces
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }
  return transporter;
}

// Generic email sending function
export const sendEmail = async ({
  to,
  subject,
  html,
  text,
  template,
  data,
  attachments,
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
      case "super-admin-verification":
        emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .otp-box { 
                background-color: #fff; 
                border: 3px dashed #667eea; 
                padding: 25px; 
                text-align: center; 
                font-size: 36px; 
                font-weight: bold; 
                letter-spacing: 8px; 
                margin: 25px 0;
                border-radius: 8px;
                color: #667eea;
              }
              .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
              .warning { color: #ff6b6b; font-weight: bold; background-color: #ffe0e0; padding: 15px; border-radius: 8px; margin: 20px 0; }
              .icon { font-size: 48px; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="icon">🔐</div>
                <h1 style="margin: 0;">Super Admin Email Verification</h1>
              </div>
              <div class="content">
                <h2>Hello ${data.name},</h2>
                <p>Your Super Admin account has been created successfully! Please verify your email address using the OTP below:</p>
                
                <div class="otp-box">
                  ${data.otp}
                </div>
                
                <div class="warning">
                  ⏰ <strong>This OTP will expire in 10 minutes.</strong>
                </div>
                
                <p>If you didn't create this account, please ignore this email.</p>
                
                <p>Best regards,<br><strong>Hotel Management Team</strong></p>
              </div>
              <div class="footer">
                <p>This is an automated email. Please do not reply.</p>
                <p>© ${new Date().getFullYear()} Hotel Management System. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `;
        break;
      case "subscription-activated":
        emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .plan-box { 
                background-color: #fff; 
                border: 2px solid #11998e; 
                padding: 25px; 
                margin: 20px 0;
                border-radius: 8px;
              }
              .feature { padding: 8px 0; border-bottom: 1px solid #eee; }
              .feature:last-child { border-bottom: none; }
              .checkmark { color: #11998e; font-weight: bold; margin-right: 10px; }
              .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
              .button { 
                display: inline-block; 
                padding: 12px 30px; 
                background-color: #11998e; 
                color: white; 
                text-decoration: none; 
                border-radius: 5px; 
                margin: 15px 0;
              }
              .icon { font-size: 48px; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="icon">🎉</div>
                <h1 style="margin: 0;">Subscription Activated!</h1>
              </div>
              <div class="content">
                <h2>Hello ${data.name},</h2>
                <p>Congratulations! Your subscription has been activated successfully!</p>
                
                <div class="plan-box">
                  <h3 style="color: #11998e; margin-top: 0;">📦 Plan: ${
                    data.planName
                  }</h3>
                  <p><strong>Billing Cycle:</strong> ${data.billingCycle}</p>
                  <p><strong>Amount Paid:</strong> ₹${data.amount}</p>
                  <p><strong>Valid From:</strong> ${new Date(
                    data.startDate
                  ).toLocaleDateString()}</p>
                  <p><strong>Valid Until:</strong> ${new Date(
                    data.endDate
                  ).toLocaleDateString()}</p>
                  
                  <h4 style="color: #11998e;">Your Plan Includes:</h4>
                  <div class="feature"><span class="checkmark">✓</span> ${
                    data.maxHotels
                  } Hotels</div>
                  <div class="feature"><span class="checkmark">✓</span> ${
                    data.maxBranches
                  } Branches</div>
                  <div class="feature"><span class="checkmark">✓</span> ${
                    data.maxManagers
                  } Managers</div>
                  <div class="feature"><span class="checkmark">✓</span> ${
                    data.maxStaff
                  } Staff Members</div>
                  <div class="feature"><span class="checkmark">✓</span> ${
                    data.maxTables
                  } Tables</div>
                </div>
                
                <p style="text-align: center;">
                  <a href="${
                    process.env.FRONTEND_URL || "http://localhost:5173"
                  }/admin/dashboard" class="button">Go to Dashboard</a>
                </p>
                
                <p>You can now access all features included in your plan!</p>
                
                <p>Best regards,<br><strong>Hotel Management Team</strong></p>
              </div>
              <div class="footer">
                <p>Questions? Contact us at support@hotelmanagement.com</p>
                <p>© ${new Date().getFullYear()} Hotel Management System. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `;
        break;
      case "subscription-expiring":
        emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .warning-box { 
                background-color: #fff3cd; 
                border: 2px solid #ff9800; 
                padding: 20px; 
                margin: 20px 0;
                border-radius: 8px;
              }
              .button {
                display: inline-block;
                padding: 12px 30px;
                background-color: #4CAF50;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin: 10px 0;
                font-weight: bold;
              }
              .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
              .icon { font-size: 48px; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="icon">⚠️</div>
                <h1 style="margin: 0;">Subscription Expiring Soon</h1>
              </div>
              <div class="content">
                <h2>Hello ${data.name},</h2>
                
                <div class="warning-box">
                  <h3 style="color: #ff9800; margin-top: 0;">⏰ Your subscription will expire in ${
                    data.daysLeft
                  } days!</h3>
                  <p><strong>Plan:</strong> ${data.planName}</p>
                  <p><strong>Expiry Date:</strong> ${new Date(
                    data.expiryDate
                  ).toLocaleDateString()}</p>
                </div>
                
                <p>To continue enjoying our services without interruption, please renew your subscription.</p>
                
                <p style="text-align: center;">
                  <a href="${data.renewLink}" class="button">Renew Now</a>
                </p>
                
                <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                
                <p>Best regards,<br><strong>Hotel Management Team</strong></p>
              </div>
              <div class="footer">
                <p>Questions? Contact us at support@hotelmanagement.com</p>
                <p>© ${new Date().getFullYear()} Hotel Management System. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `;
        break;
      case "subscription-expired":
        emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #434343 0%, #000000 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .expired-box { 
                background-color: #ffebee; 
                border: 2px solid #f44336; 
                padding: 20px; 
                margin: 20px 0;
                border-radius: 8px;
              }
              .button {
                display: inline-block;
                padding: 12px 30px;
                background-color: #f44336;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin: 10px 0;
                font-weight: bold;
              }
              .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
              .icon { font-size: 48px; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="icon">❌</div>
                <h1 style="margin: 0;">Subscription Expired</h1>
              </div>
              <div class="content">
                <h2>Hello ${data.name},</h2>
                
                <div class="expired-box">
                  <h3 style="color: #f44336; margin-top: 0;">Your subscription has expired</h3>
                  <p><strong>Plan:</strong> ${data.planName}</p>
                  <p><strong>Expired On:</strong> ${new Date(
                    data.expiryDate
                  ).toLocaleDateString()}</p>
                </div>
                
                <p>Your access to premium features has been suspended. To restore full access, please renew your subscription.</p>
                
                <p style="text-align: center;">
                  <a href="${
                    data.renewLink
                  }" class="button">Renew Subscription</a>
                </p>
                
                <p>We'd love to have you back! If you have any questions or need assistance, please contact our support team.</p>
                
                <p>Best regards,<br><strong>Hotel Management Team</strong></p>
              </div>
              <div class="footer">
                <p>Questions? Contact us at support@hotelmanagement.com</p>
                <p>© ${new Date().getFullYear()} Hotel Management System. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `;
        break;
      case "payment-success":
        emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .payment-box { 
                background-color: #fff; 
                border: 2px solid #4CAF50; 
                padding: 25px; 
                margin: 20px 0;
                border-radius: 8px;
              }
              .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
              .icon { font-size: 48px; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="icon">✅</div>
                <h1 style="margin: 0;">Payment Successful</h1>
              </div>
              <div class="content">
                <h2>Hello ${data.name},</h2>
                <p>Thank you for your payment! Your transaction has been completed successfully.</p>
                
                <div class="payment-box">
                  <h3 style="color: #4CAF50; margin-top: 0;">Payment Details</h3>
                  <p><strong>Amount:</strong> ₹${data.amount}</p>
                  <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
                  <p><strong>Payment Date:</strong> ${new Date(
                    data.paymentDate
                  ).toLocaleDateString()}</p>
                  <p><strong>Payment Method:</strong> ${data.paymentMethod}</p>
                  <p><strong>Plan:</strong> ${data.planName}</p>
                </div>
                
                ${
                  data.invoiceUrl
                    ? `<p style="text-align: center;"><a href="${data.invoiceUrl}" style="color: #4CAF50; text-decoration: none; font-weight: bold;">Download Invoice</a></p>`
                    : ""
                }
                
                <p>Your subscription is now active and you have full access to all features.</p>
                
                <p>Best regards,<br><strong>Hotel Management Team</strong></p>
              </div>
              <div class="footer">
                <p>Questions? Contact us at support@hotelmanagement.com</p>
                <p>© ${new Date().getFullYear()} Hotel Management System. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `;
        break;
      case "payment-failed":
        emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #f44336 0%, #e53935 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .failed-box { 
                background-color: #ffebee; 
                border: 2px solid #f44336; 
                padding: 20px; 
                margin: 20px 0;
                border-radius: 8px;
              }
              .button {
                display: inline-block;
                padding: 12px 30px;
                background-color: #4CAF50;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin: 10px 0;
                font-weight: bold;
              }
              .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
              .icon { font-size: 48px; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="icon">❌</div>
                <h1 style="margin: 0;">Payment Failed</h1>
              </div>
              <div class="content">
                <h2>Hello ${data.name},</h2>
                
                <div class="failed-box">
                  <h3 style="color: #f44336; margin-top: 0;">Your payment could not be processed</h3>
                  <p><strong>Amount:</strong> ₹${data.amount}</p>
                  <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
                  ${
                    data.reason
                      ? `<p><strong>Reason:</strong> ${data.reason}</p>`
                      : ""
                  }
                </div>
                
                <p>Please try again or use a different payment method.</p>
                
                <p style="text-align: center;">
                  <a href="${data.retryLink}" class="button">Retry Payment</a>
                </p>
                
                <p>If you continue to experience issues, please contact our support team for assistance.</p>
                
                <p>Best regards,<br><strong>Hotel Management Team</strong></p>
              </div>
              <div class="footer">
                <p>Questions? Contact us at support@hotelmanagement.com</p>
                <p>© ${new Date().getFullYear()} Hotel Management System. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `;
        break;
      default:
        emailContent = html || text || "No content provided";
    }
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html: emailContent,
  };

  if (attachments) {
    mailOptions.attachments = attachments;
  }

  await getTransporter().sendMail(mailOptions);
};

export const sendEmailOtp = async (to, otp) => {
  await getTransporter().sendMail({
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

  await getTransporter().sendMail({
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

// Send password reset email for admin accounts
export const sendAdminPasswordResetEmail = async (
  to,
  resetToken,
  adminName
) => {
  const resetUrl = `${
    process.env.FRONTEND_URL || "http://localhost:5173"
  }/admin/reset-password?token=${resetToken}`;

  await getTransporter().sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: "Admin Password Reset Request - RMS",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${adminName},</p>
        <p>You have requested to reset your admin account password.</p>
        <p>Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all; background-color: #f0f0f0; padding: 10px;">${resetUrl}</p>
        <p><strong>This link will expire in 15 minutes.</strong></p>
        <p>If you didn't request this password reset, please ignore this email or contact support.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">Hotel Management System - Admin Panel</p>
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

// ============================================
// Subscription-Related Email Functions
// ============================================

// Send subscription renewal reminder email
export const sendSubscriptionRenewalReminderEmail = async (
  email,
  name,
  planName,
  endDate,
  daysRemaining
) => {
  const formattedDate = new Date(endDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  await sendEmail({
    to: email,
    subject: `Subscription Renewal Reminder - ${daysRemaining} Days Remaining`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #ff9800; margin: 0;">⏰ Renewal Reminder</h1>
        </div>
        
        <h2 style="color: #333;">Hi ${name},</h2>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          This is a friendly reminder that your <strong>${planName}</strong> subscription will expire in <strong style="color: #ff9800;">${daysRemaining} day${
            daysRemaining > 1 ? "s" : ""
          }</strong>.
        </p>
        
        <div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #e65100;">
            <strong>Expiration Date:</strong> ${formattedDate}
          </p>
        </div>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          To avoid any interruption to your service, please renew your subscription before the expiration date.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/subscription/renew" 
             style="background-color: #4caf50; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Renew Now
          </a>
        </div>
        
        <p style="font-size: 14px; color: #777; margin-top: 30px;">
          If you have any questions or need assistance, please don't hesitate to contact our support team.
        </p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e0e0e0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated reminder from Hotel Management System.<br>
          Please do not reply to this email.
        </p>
      </div>
    `,
  });
};

// Send subscription expiring email
export const sendSubscriptionExpiringEmail = async (
  email,
  name,
  planName,
  endDate,
  daysRemaining
) => {
  const formattedDate = new Date(endDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  await sendEmail({
    to: email,
    subject: `⚠️ Subscription Expiring Soon - ${planName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #f44336; margin: 0;">⚠️ Subscription Alert</h1>
        </div>
        
        <h2 style="color: #333;">Hi ${name},</h2>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          Your <strong>${planName}</strong> subscription is expiring ${
            daysRemaining === 0
              ? "today"
              : `in ${daysRemaining} day${daysRemaining > 1 ? "s" : ""}`
          }!
        </p>
        
        <div style="background-color: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #c62828;">
            <strong>Expiration Date:</strong> ${formattedDate}
          </p>
        </div>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          After your subscription expires, you will lose access to:
        </p>
        
        <ul style="color: #555; line-height: 1.8;">
          <li>All premium features</li>
          <li>Dashboard analytics</li>
          <li>Advanced reports</li>
          <li>Resource management</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/subscription/renew" 
             style="background-color: #4caf50; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Renew Now
          </a>
        </div>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e0e0e0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated alert from Hotel Management System.<br>
          Please do not reply to this email.
        </p>
      </div>
    `,
  });
};

// Send subscription expired email
export const sendSubscriptionExpiredEmail = async (
  email,
  name,
  planName,
  expiredDate
) => {
  const formattedDate = new Date(expiredDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  await sendEmail({
    to: email,
    subject: `Subscription Expired - ${planName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #9e9e9e; margin: 0;">📭 Subscription Expired</h1>
        </div>
        
        <h2 style="color: #333;">Hi ${name},</h2>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          Your <strong>${planName}</strong> subscription has expired as of <strong>${formattedDate}</strong>.
        </p>
        
        <div style="background-color: #f5f5f5; border-left: 4px solid #9e9e9e; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #424242;">
            <strong>Status:</strong> Expired<br>
            <strong>Expired On:</strong> ${formattedDate}
          </p>
        </div>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          You currently have limited access to the system. To restore full functionality, please renew your subscription.
        </p>
        
        <div style="background-color: #e3f2fd; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p style="margin: 0; color: #1976d2;">
            💡 <strong>Good News!</strong> Your data is safe and will be preserved for 30 days. Renew anytime to restore full access!
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/subscription/renew" 
             style="background-color: #2196f3; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Renew Subscription
          </a>
        </div>
        
        <p style="font-size: 14px; color: #777; margin-top: 30px;">
          Need help? Contact our support team at support@hotelmanagementsystem.com
        </p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e0e0e0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated notification from Hotel Management System.<br>
          Please do not reply to this email.
        </p>
      </div>
    `,
  });
};
/**
 * Send review invitation email to user after order completion
 * @param {Object} order - Order object
 * @param {Object} user - User object
 */
export const sendReviewInvitationEmail = async (order, user) => {
  try {
    const hotelName = order.hotel?.name || "Our Restaurant";
    const branchName = order.branch?.name || "";
    const orderId = order.orderId || order._id;
    const completedDate = new Date(
      order.completedAt || order.updatedAt
    ).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const itemCount = order.items?.length || 0;
    const totalAmount = order.totalPrice || 0;

    // Generate review link with orderId
    const reviewLink = `${process.env.FRONTEND_URL}/reviews/create?orderId=${order._id}`;

    await sendEmail({
      to: user.email,
      subject: `How was your experience at ${hotelName}? Share your review`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
            <h1 style="color: #ffffff; margin: 0;">⭐ Share Your Experience</h1>
            <p style="color: #f0f0f0; margin: 10px 0 0 0;">Your feedback helps us serve you better!</p>
          </div>
          
          <h2 style="color: #333;">Hi ${user.name},</h2>
          
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Thank you for dining with us at <strong>${hotelName}</strong>${
              branchName ? ` - ${branchName}` : ""
            }! We hope you enjoyed your meal.
          </p>
          
          <div style="background-color: #f5f7fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #667eea;">
            <h3 style="color: #333; margin-top: 0;">📋 Order Summary</h3>
            <p style="margin: 5px 0; color: #555;"><strong>Order ID:</strong> ${orderId}</p>
            <p style="margin: 5px 0; color: #555;"><strong>Date:</strong> ${completedDate}</p>
            <p style="margin: 5px 0; color: #555;"><strong>Items:</strong> ${itemCount} item${
              itemCount !== 1 ? "s" : ""
            }</p>
            <p style="margin: 5px 0; color: #555;"><strong>Total:</strong> ₹${totalAmount.toFixed(
              2
            )}</p>
          </div>
          
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            We'd love to hear about your experience! Please take a moment to rate us on:
          </p>
          
          <div style="background-color: #fff3cd; padding: 15px; margin: 20px 0; border-radius: 8px;">
            <ul style="margin: 0; padding-left: 20px; color: #856404;">
              <li style="margin: 8px 0;"><strong>🍕 Food Quality</strong> - How was the taste and presentation?</li>
              <li style="margin: 8px 0;"><strong>🏨 Hotel Experience</strong> - Ambiance and overall atmosphere</li>
              <li style="margin: 8px 0;"><strong>🏢 Branch Service</strong> - Facilities and cleanliness</li>
              <li style="margin: 8px 0;"><strong>👥 Staff Behavior</strong> - Service quality and friendliness</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${reviewLink}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 18px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
              ⭐ Write a Review
            </a>
          </div>
          
          <p style="font-size: 14px; color: #777; text-align: center; margin-top: 20px;">
            Or copy this link: <br>
            <span style="word-break: break-all; background-color: #f0f0f0; padding: 8px; display: inline-block; margin-top: 5px; border-radius: 4px; font-size: 12px;">${reviewLink}</span>
          </p>
          
          <div style="background-color: #e3f2fd; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #1976d2; font-size: 14px;">
              ⏰ <strong>Please Note:</strong> You can submit your review within 30 days of order completion.
            </p>
          </div>
          
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Your honest feedback helps us improve and helps other customers make informed decisions.
          </p>
          
          <p style="font-size: 16px; color: #333; margin-top: 30px;">
            Thank you for choosing ${hotelName}!<br>
            We look forward to serving you again soon.
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e0e0e0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from ${hotelName}.<br>
            If you have any questions, feel free to contact us.
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("Error sending review invitation email:", error);
    throw error;
  }
};

/**
 * Send email when admin responds to a review
 * @param {Object} review - Review object with populated fields
 * @param {Object} user - User object
 * @param {Object} admin - Admin object who responded
 * @param {String} message - Admin's response message
 */
export const sendReviewResponseEmail = async (review, user, admin, message) => {
  try {
    const hotelName = review.hotel?.name || "Our Restaurant";
    const branchName = review.branch?.name || "";
    const orderId = review.order?.orderId || review.order?._id;
    const reviewDate = new Date(review.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Generate review link
    const reviewLink = `${process.env.FRONTEND_URL}/reviews/${review._id}`;

    // Format ratings for display
    const avgRating =
      review.overallRating ||
      (
        (review.foodRating +
          review.hotelRating +
          review.branchRating +
          review.staffRating) /
        4
      ).toFixed(1);
    const starsDisplay = "⭐".repeat(Math.round(avgRating));

    await sendEmail({
      to: user.email,
      subject: `${hotelName} responded to your review`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
            <h1 style="color: #ffffff; margin: 0;">💬 Response to Your Review</h1>
            <p style="color: #f0f0f0; margin: 10px 0 0 0;">Thank you for sharing your feedback!</p>
          </div>
          
          <h2 style="color: #333;">Hi ${user.name},</h2>
          
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            <strong>${hotelName}</strong>${
              branchName ? ` - ${branchName}` : ""
            } has responded to your review. We appreciate you taking the time to share your experience with us!
          </p>
          
          <div style="background-color: #f5f7fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #667eea;">
            <h3 style="color: #333; margin-top: 0;">📝 Your Review Summary</h3>
            <p style="margin: 5px 0; color: #555;"><strong>Order ID:</strong> ${orderId}</p>
            <p style="margin: 5px 0; color: #555;"><strong>Review Date:</strong> ${reviewDate}</p>
            <p style="margin: 5px 0; color: #555;"><strong>Overall Rating:</strong> ${starsDisplay} (${avgRating}/5)</p>
            <div style="margin-top: 15px; padding: 15px; background-color: #ffffff; border-radius: 5px;">
              <p style="margin: 5px 0; color: #555;"><strong>🍕 Food:</strong> ${
                review.foodRating
              }/5</p>
              <p style="margin: 5px 0; color: #555;"><strong>🏨 Hotel:</strong> ${
                review.hotelRating
              }/5</p>
              <p style="margin: 5px 0; color: #555;"><strong>🏢 Branch:</strong> ${
                review.branchRating
              }/5</p>
              <p style="margin: 5px 0; color: #555;"><strong>👥 Staff:</strong> ${
                review.staffRating
              }/5</p>
            </div>
            ${
              review.comment
                ? `
            <div style="margin-top: 15px; padding: 15px; background-color: #ffffff; border-radius: 5px; border-left: 3px solid #667eea;">
              <p style="margin: 0; color: #666; font-style: italic;">"${review.comment}"</p>
            </div>
            `
                : ""
            }
          </div>
          
          <div style="background-color: #e8f5e9; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #4caf50;">
            <h3 style="color: #2e7d32; margin-top: 0;">💼 Response from ${
              admin.name || "Management"
            }</h3>
            <p style="color: #333; font-size: 15px; line-height: 1.6; margin: 0;">
              ${message}
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${reviewLink}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 18px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
              View Full Review
            </a>
          </div>
          
          <p style="font-size: 14px; color: #777; text-align: center; margin-top: 20px;">
            Or copy this link: <br>
            <span style="word-break: break-all; background-color: #f0f0f0; padding: 8px; display: inline-block; margin-top: 5px; border-radius: 4px; font-size: 12px;">${reviewLink}</span>
          </p>
          
          <div style="background-color: #fff3cd; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              💡 <strong>Did you find this helpful?</strong> Mark the review as helpful or share it with others who might be interested in ${hotelName}!
            </p>
          </div>
          
          <p style="font-size: 16px; color: #333; margin-top: 30px;">
            Thank you for being a valued customer!<br>
            We look forward to serving you again soon.
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e0e0e0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated notification from ${hotelName}.<br>
            You received this email because you submitted a review for Order #${orderId}.
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("Error sending review response email:", error);
    throw error;
  }
};
