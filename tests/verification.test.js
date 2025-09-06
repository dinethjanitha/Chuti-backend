import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { sendVerificationCodes, verifyEmail, resendVerificationCode } from '../Controllers/verificationController.js';
import User from '../Models/User.js';
import Verification from '../Models/Verification.js';
import crypto from 'crypto';

// Mock the auth middleware (for resend endpoint)
const mockAuthMiddleware = (req, res, next) => {
  req.user = { 
    id: req.headers['user-id'] || '507f1f77bcf86cd799439011',
    role: 'children'
  };
  next();
};

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/verify/resend', mockAuthMiddleware);

// Add routes for testing
app.post('/verify/send', sendVerificationCodes);
app.get('/verify/:token', verifyEmail);
app.post('/verify/resend', resendVerificationCode);

describe('Verification Controller', () => {
  let testUser;

  beforeEach(async () => {
    // Create test user
    testUser = await User.create({
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      fullName: 'Test User',
      age: 12,
      parentEmail: 'parent@example.com',
      role: 'children',
      isVerified: false
    });
  });

  describe('POST /verify/send', () => {
    it('should send verification email for valid user', async () => {
      const requestData = {
        email: testUser.email
      };

      const response = await request(app)
        .post('/verify/send')
        .send(requestData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Verification email sent successfully');

      // Verify verification record was created
      const verification = await Verification.findOne({ 
        userId: testUser._id,
        type: 'email_verification'
      });
      expect(verification).toBeTruthy();
      expect(verification.isUsed).toBe(false);
    });

    it('should reject sending verification for non-existent user', async () => {
      const requestData = {
        email: 'nonexistent@example.com'
      };

      const response = await request(app)
        .post('/verify/send')
        .send(requestData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User not found');
    });

    it('should reject sending verification for already verified user', async () => {
      // Mark user as verified
      await User.findByIdAndUpdate(testUser._id, { isVerified: true });

      const requestData = {
        email: testUser.email
      };

      const response = await request(app)
        .post('/verify/send')
        .send(requestData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User is already verified');
    });

    it('should reject request without email', async () => {
      const response = await request(app)
        .post('/verify/send')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Email is required');
    });

    it('should reject request with invalid email format', async () => {
      const requestData = {
        email: 'invalid-email'
      };

      const response = await request(app)
        .post('/verify/send')
        .send(requestData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid email format');
    });

    it('should handle rate limiting for verification emails', async () => {
      // Create recent verification record
      await Verification.create({
        userId: testUser._id,
        token: crypto.randomBytes(32).toString('hex'),
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        createdAt: new Date()
      });

      const requestData = {
        email: testUser.email
      };

      const response = await request(app)
        .post('/verify/send')
        .send(requestData)
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Please wait before requesting another verification email');
    });
  });

  describe('GET /verify/:token', () => {
    let verificationToken;

    beforeEach(async () => {
      verificationToken = crypto.randomBytes(32).toString('hex');
      await Verification.create({
        userId: testUser._id,
        token: verificationToken,
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        isUsed: false
      });
    });

    it('should verify email with valid token', async () => {
      const response = await request(app)
        .get(`/verify/${verificationToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Email verified successfully');

      // Verify user is marked as verified
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.isVerified).toBe(true);

      // Verify token is marked as used
      const usedVerification = await Verification.findOne({ token: verificationToken });
      expect(usedVerification.isUsed).toBe(true);
    });

    it('should reject invalid token', async () => {
      const invalidToken = crypto.randomBytes(32).toString('hex');

      const response = await request(app)
        .get(`/verify/${invalidToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid verification token');
    });

    it('should reject expired token', async () => {
      // Create expired token
      const expiredToken = crypto.randomBytes(32).toString('hex');
      await Verification.create({
        userId: testUser._id,
        token: expiredToken,
        type: 'email_verification',
        expiresAt: new Date(Date.now() - 60 * 1000), // Expired 1 minute ago
        isUsed: false
      });

      const response = await request(app)
        .get(`/verify/${expiredToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Verification token has expired');
    });

    it('should reject already used token', async () => {
      // Mark token as used
      await Verification.findOneAndUpdate(
        { token: verificationToken },
        { isUsed: true }
      );

      const response = await request(app)
        .get(`/verify/${verificationToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Verification token has already been used');
    });

    it('should reject verification for already verified user', async () => {
      // Mark user as verified
      await User.findByIdAndUpdate(testUser._id, { isVerified: true });

      const response = await request(app)
        .get(`/verify/${verificationToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User is already verified');
    });

    it('should reject verification for non-existent user', async () => {
      // Create token for non-existent user
      const nonExistentToken = crypto.randomBytes(32).toString('hex');
      await Verification.create({
        userId: new mongoose.Types.ObjectId('507f1f77bcf86cd799439999'),
        token: nonExistentToken,
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        isUsed: false
      });

      const response = await request(app)
        .get(`/verify/${nonExistentToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User not found');
    });
  });

  describe('POST /verify/resend', () => {
    it('should resend verification email for unverified user', async () => {
      const response = await request(app)
        .post('/verify/resend')
        .set('user-id', testUser._id.toString())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Verification email resent successfully');

      // Verify new verification record was created
      const verification = await Verification.findOne({ 
        userId: testUser._id,
        type: 'email_verification',
        isUsed: false
      });
      expect(verification).toBeTruthy();
    });

    it('should reject resend for already verified user', async () => {
      // Mark user as verified
      await User.findByIdAndUpdate(testUser._id, { isVerified: true });

      const response = await request(app)
        .post('/verify/resend')
        .set('user-id', testUser._id.toString())
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User is already verified');
    });

    it('should handle rate limiting for resend requests', async () => {
      // Create recent verification record
      await Verification.create({
        userId: testUser._id,
        token: crypto.randomBytes(32).toString('hex'),
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date()
      });

      const response = await request(app)
        .post('/verify/resend')
        .set('user-id', testUser._id.toString())
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Please wait before requesting another verification email');
    });

    it('should reject resend for non-existent user', async () => {
      const response = await request(app)
        .post('/verify/resend')
        .set('user-id', '507f1f77bcf86cd799439999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User not found');
    });

    it('should invalidate previous unused tokens when resending', async () => {
      // Create existing verification token
      const oldToken = crypto.randomBytes(32).toString('hex');
      await Verification.create({
        userId: testUser._id,
        token: oldToken,
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        isUsed: false,
        createdAt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      });

      const response = await request(app)
        .post('/verify/resend')
        .set('user-id', testUser._id.toString())
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify old token is marked as used/invalid
      const oldVerification = await Verification.findOne({ token: oldToken });
      expect(oldVerification.isUsed).toBe(true);

      // Verify new token exists and is valid
      const newVerification = await Verification.findOne({ 
        userId: testUser._id,
        isUsed: false,
        createdAt: { $gt: new Date(Date.now() - 60 * 1000) } // Created in last minute
      });
      expect(newVerification).toBeTruthy();
      expect(newVerification.token).not.toBe(oldToken);
    });
  });

  describe('Email Verification Flow Integration', () => {
    it('should complete full email verification flow', async () => {
      // Step 1: Send verification email
      const sendResponse = await request(app)
        .post('/verify/send')
        .send({ email: testUser.email })
        .expect(200);

      expect(sendResponse.body.success).toBe(true);

      // Get the verification token
      const verification = await Verification.findOne({ 
        userId: testUser._id,
        type: 'email_verification',
        isUsed: false
      });
      expect(verification).toBeTruthy();

      // Step 2: Verify the email using the token
      const verifyResponse = await request(app)
        .get(`/verify/${verification.token}`)
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);

      // Step 3: Verify user is now verified
      const verifiedUser = await User.findById(testUser._id);
      expect(verifiedUser.isVerified).toBe(true);

      // Step 4: Attempt to resend should fail for verified user
      const resendResponse = await request(app)
        .post('/verify/resend')
        .set('user-id', testUser._id.toString())
        .expect(400);

      expect(resendResponse.body.message).toBe('User is already verified');
    });

    it('should handle multiple verification attempts correctly', async () => {
      // Send first verification
      await request(app)
        .post('/verify/send')
        .send({ email: testUser.email })
        .expect(200);

      const firstVerification = await Verification.findOne({ 
        userId: testUser._id,
        isUsed: false
      });

      // Wait a bit and resend (simulating user clicking resend)
      await new Promise(resolve => setTimeout(resolve, 100));

      // This should fail due to rate limiting
      await request(app)
        .post('/verify/send')
        .send({ email: testUser.email })
        .expect(429);

      // Verify original token still works
      const verifyResponse = await request(app)
        .get(`/verify/${firstVerification.token}`)
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);
    });
  });
});
