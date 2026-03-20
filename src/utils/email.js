const nodemailer = require('nodemailer');

// Create transporter — uses SMTP_* env vars
// For production: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// For dev/testing: falls back to Ethereal test account
let transporter;

const getTransporter = async () => {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Dev fallback: create Ethereal test account
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('[Email] Using Ethereal test account:', testAccount.user);
  }

  return transporter;
};

/**
 * Send OTP email for password reset
 */
const sendOtpEmail = async (email, otp) => {
  const transport = await getTransporter();

  const mailOptions = {
    from: process.env.SMTP_FROM || '"AutoSpark" <noreply@autospark.in>',
    to: email,
    subject: 'Your AutoSpark Password Reset OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #52277E; margin: 0;">AutoSpark</h1>
          <p style="color: #6B7280; margin-top: 4px;">Password Reset</p>
        </div>
        <div style="background: #F5F3FF; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="color: #374151; margin: 0 0 16px;">Your OTP for password reset is:</p>
          <div style="font-size: 32px; font-weight: 800; color: #52277E; letter-spacing: 8px; margin: 16px 0;">${otp}</div>
          <p style="color: #6B7280; font-size: 13px; margin: 16px 0 0;">This OTP is valid for 10 minutes</p>
        </div>
        <p style="color: #6B7280; font-size: 13px; text-align: center;">
          If you didn't request this, please ignore this email.
        </p>
      </div>
    `,
  };

  const info = await transport.sendMail(mailOptions);

  // In dev, log the Ethereal preview URL
  if (!process.env.SMTP_HOST) {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('[Email] Preview URL:', previewUrl);
    }
  }

  return info;
};

module.exports = { sendOtpEmail };
