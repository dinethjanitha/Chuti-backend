import nodemailer from 'nodemailer';
import crypto from 'crypto';

// Email configuration - you should set these in environment variables
const EMAIL_CONFIG = {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER, // your email
    pass: process.env.EMAIL_PASS  // your email password or app password
  }
};

// Create reusable transporter object using SMTP
const transporter = nodemailer.createTransport(EMAIL_CONFIG);

// Generate 6-digit verification code
export const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Generate verification token for URL-based verification (optional)
export const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Send verification email to user
export const sendVerificationEmail = async (email, code, name = 'User') => {
  try {
    const mailOptions = {
      from: `"Chuti - Safe Chat" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email - Chuti Safe Chat',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #007AFF, #5856FF); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .code { background: #007AFF; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 10px; letter-spacing: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎯 Welcome to Chuti!</h1>
              <p>Safe Chat for Kids</p>
            </div>
            <div class="content">
              <h2>Hi ${name}!</h2>
              <p>Thank you for joining Chuti - the safe chat app designed for children. To complete your registration, please verify your email address.</p>
              
              <p><strong>Your verification code is:</strong></p>
              <div class="code">${code}</div>
              
              <p>Please enter this 6-digit code in the app to verify your email address.</p>
              
              <div class="warning">
                <strong>Important:</strong> This code will expire in 15 minutes for security reasons.
              </div>
              
              <p>If you didn't create an account with Chuti, please ignore this email.</p>
              
              <h3>Why verify your email?</h3>
              <ul>
                <li>🔒 Keeps your account secure</li>
                <li>📧 Allows important notifications</li>
                <li>🔄 Helps with account recovery</li>
                <li>👨‍👩‍👧‍👦 Ensures parent communication</li>
              </ul>
            </div>
            <div class="footer">
              <p>Chuti - Safe Chat for Kids<br>
              Building safe digital spaces for children</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
};

// Send verification email to parent
export const sendParentVerificationEmail = async (parentEmail, childName, childEmail, code) => {
  try {
    const mailOptions = {
      from: `"Chuti - Safe Chat" <${process.env.EMAIL_USER}>`,
      to: parentEmail,
      subject: 'Parent Verification Required - Chuti Safe Chat',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #FF6B6B, #FF8E53); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .code { background: #FF6B6B; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 10px; letter-spacing: 5px; margin: 20px 0; }
            .info-box { background: #e3f2fd; border: 1px solid #2196f3; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>👨‍👩‍👧‍👦 Parent Verification</h1>
              <p>Chuti - Safe Chat for Kids</p>
            </div>
            <div class="content">
              <h2>Dear Parent/Guardian,</h2>
              <p>A child has signed up for Chuti using your email address as their parent contact. We need your verification to ensure child safety.</p>
              
              <div class="info-box">
                <h3>Child Account Details:</h3>
                <p><strong>Name:</strong> ${childName}</p>
                <p><strong>Email:</strong> ${childEmail}</p>
                <p><strong>Registration Date:</strong> ${new Date().toLocaleDateString()}</p>
              </div>
              
              <p><strong>Your parent verification code is:</strong></p>
              <div class="code">${code}</div>
              
              <p>Please provide this code to your child so they can complete their account verification.</p>
              
              <div class="warning">
                <strong>Important:</strong> 
                <ul>
                  <li>This code will expire in 15 minutes</li>
                  <li>Only share this code with your child if you approve their account</li>
                  <li>Chuti is designed for children aged 5-17</li>
                </ul>
              </div>
              
              <h3>About Chuti:</h3>
              <ul>
                <li>🛡️ Safe chat environment with content moderation</li>
                <li>🔍 AI-powered inappropriate content detection</li>
                <li>👨‍👩‍👧‍👦 Parent notifications and controls</li>
                <li>🚫 No contact with strangers outside approved friends</li>
                <li>📱 Age-appropriate features and interface</li>
              </ul>
              
              <p>If you did not authorize this account creation, please ignore this email and the account will not be activated.</p>
            </div>
            <div class="footer">
              <p>Chuti - Safe Chat for Kids<br>
              Building safe digital spaces for children<br>
              Contact: support@chuti.com</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Parent verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending parent verification email:', error);
    throw new Error('Failed to send parent verification email');
  }
};

// Send welcome email after successful verification
export const sendWelcomeEmail = async (email, name, username) => {
  try {
    const mailOptions = {
      from: `"Chuti - Safe Chat" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to Chuti! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #00C851, #007E33); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .welcome-box { background: #e8f5e8; border: 1px solid #4caf50; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0; }
            .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #00C851; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to Chuti!</h1>
              <p>Your account is now active!</p>
            </div>
            <div class="content">
              <div class="welcome-box">
                <h2>Hi ${name}! 👋</h2>
                <p><strong>Username:</strong> @${username}</p>
                <p>Your email has been verified and your account is ready to use!</p>
              </div>
              
              <h3>🚀 Get Started:</h3>
              
              <div class="feature">
                <h4>💬 Start Chatting Safely</h4>
                <p>Connect with friends in a safe, moderated environment designed just for kids.</p>
              </div>
              
              <div class="feature">
                <h4>👥 Find Friends</h4>
                <p>Search for friends by username and start safe conversations.</p>
              </div>
              
              <div class="feature">
                <h4>🛡️ Stay Protected</h4>
                <p>Our AI system automatically detects and blocks inappropriate content.</p>
              </div>
              
              <div class="feature">
                <h4>📱 Family Friendly</h4>
                <p>Parents can monitor activity and receive important notifications.</p>
              </div>
              
              <h3>🔒 Safety Features:</h3>
              <ul>
                <li>✅ Real-time content moderation</li>
                <li>✅ No contact with unknown users</li>
                <li>✅ Parent notification system</li>
                <li>✅ Age-appropriate content only</li>
                <li>✅ Secure and encrypted messaging</li>
              </ul>
              
              <p><strong>Remember:</strong> Always be kind, respectful, and never share personal information like your address, phone number, or school name.</p>
              
              <p>If you ever need help, contact our support team at support@chuti.com</p>
            </div>
            <div class="footer">
              <p>Chuti - Safe Chat for Kids<br>
              Building safe digital spaces for children<br>
              Have fun and stay safe! 🌟</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw new Error('Failed to send welcome email');
  }
};

// Send parent alert email for inappropriate content
export const sendParentContentAlert = async (parentEmail, childName, childEmail, contentType, details = {}) => {
  try {
    const mailOptions = {
      from: `"Chuti - Safety Alert" <${process.env.EMAIL_USER}>`,
      to: parentEmail,
      subject: '🚨 Safety Alert - Inappropriate Content Detected',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #FF6B6B, #FF8E53); color: white; text-align: center; padding: 30px; border-radius: 10px 10px 0 0; }
            .content { background: #fff; padding: 30px; border: 2px solid #FF6B6B; border-top: none; }
            .alert-box { background: #FFF3CD; border: 2px solid #FF8E53; color: #856404; padding: 20px; border-radius: 10px; margin: 20px 0; }
            .details-box { background: #F8F9FA; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #FF6B6B; }
            .safety-tips { background: #E3F2FD; border: 1px solid #2196F3; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
            .urgent { color: #FF6B6B; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 Safety Alert</h1>
              <p>Chuti - Protecting Your Child Online</p>
            </div>
            <div class="content">
              <div class="alert-box">
                <h2 class="urgent">⚠️ Inappropriate Content Detected</h2>
                <p>We detected potentially inappropriate content involving your child's account and have taken immediate action to protect them.</p>
              </div>
              
              <div class="details-box">
                <h3>📋 Incident Details:</h3>
                <p><strong>Child:</strong> ${childName} (${childEmail})</p>
                <p><strong>Content Type:</strong> ${contentType === 'text' ? 'Text Message' : contentType === 'image' ? 'Image' : 'Unknown'}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Action Taken:</strong> Content has been blocked and not delivered</p>
                ${details.chatType ? `<p><strong>Chat Type:</strong> ${details.chatType}</p>` : ''}
                ${details.otherParticipants ? `<p><strong>Other Participants:</strong> ${details.otherParticipants}</p>` : ''}
              </div>
              
              <div class="safety-tips">
                <h3>🛡️ What We're Doing:</h3>
                <ul>
                  <li>✅ The inappropriate content was immediately blocked</li>
                  <li>✅ Your child's account safety status is being monitored</li>
                  <li>✅ AI-powered moderation is actively protecting conversations</li>
                  <li>✅ All future messages are continuously scanned for safety</li>
                </ul>
              </div>
              
              <div class="safety-tips">
                <h3>💬 Recommended Actions:</h3>
                <ul>
                  <li>🗣️ Have a conversation with your child about online safety</li>
                  <li>📚 Review appropriate online communication guidelines</li>
                  <li>🔍 Monitor your child's online activities regularly</li>
                  <li>📞 Contact us if you have concerns: support@chuti.com</li>
                </ul>
              </div>
              
              <p><strong>Remember:</strong> Chuti is designed to be a safe space for children. Our advanced AI moderation system works 24/7 to detect and prevent inappropriate content.</p>
              
              <p>If you have any questions or concerns, please don't hesitate to contact our support team.</p>
            </div>
            <div class="footer">
              <p>Chuti - Safe Chat for Kids<br>
              Protecting children in digital spaces<br>
              Support: support@chuti.com | Emergency: emergency@chuti.com</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Parent content alert email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending parent content alert email:', error);
    throw new Error('Failed to send parent content alert email');
  }
};

// Test email configuration
export const testEmailConfig = async () => {
  try {
    await transporter.verify();
    console.log('Email service is ready');
    return true;
  } catch (error) {
    console.error('Email service error:', error);
    return false;
  }
};

export default {
  sendVerificationEmail,
  sendParentVerificationEmail,
  sendWelcomeEmail,
  sendParentContentAlert,
  generateVerificationCode,
  generateVerificationToken,
  testEmailConfig
};
