import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { signup, login } from '../Controllers/authController.js';
import User from '../Models/User.js';
import Verification from '../Models/Verification.js';

// Create Express app for testing
const app = express();
app.use(express.json());

// Add routes for testing
app.post('/auth/signup', signup);
app.post('/auth/login', login);

describe('Auth Controller', () => {
  describe('POST /auth/signup', () => {
    const validUserData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      fullName: 'Test User',
      age: 12,
      parentEmail: 'parent@example.com'
    };

    it('should create a new user with valid data', async () => {
      const response = await request(app)
        .post('/auth/signup')
        .send(validUserData)
        .expect(201);

      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('User created successfully. Please check your email for verification codes.');
      expect(response.body.data.user.email).toBe(validUserData.email);
      expect(response.body.data.user.username).toBe(validUserData.username);
      expect(response.body.data.user.role).toBe('children');
      expect(response.body.data.user.isVerified).toBe(false);

      // Verify user was created in database
      const userInDb = await User.findOne({ email: validUserData.email });
      expect(userInDb).toBeTruthy();
      expect(userInDb.parentEmail).toBe(validUserData.parentEmail);
    });

    it('should reject user with age under 5', async () => {
      const invalidUserData = { ...validUserData, age: 4 };
      
      const response = await request(app)
        .post('/auth/signup')
        .send(invalidUserData)
        .expect(400);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('This app is designed for children aged 5-17');
    });

    it('should reject user with age over 17', async () => {
      const invalidUserData = { ...validUserData, age: 18 };
      
      const response = await request(app)
        .post('/auth/signup')
        .send(invalidUserData)
        .expect(400);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('This app is designed for children aged 5-17');
    });

    it('should reject when parent email is same as child email', async () => {
      const invalidUserData = { 
        ...validUserData, 
        parentEmail: validUserData.email 
      };
      
      const response = await request(app)
        .post('/auth/signup')
        .send(invalidUserData)
        .expect(400);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Parent email must be different from child email address');
    });

    it('should reject duplicate email', async () => {
      // Create first user
      await request(app)
        .post('/auth/signup')
        .send(validUserData)
        .expect(201);

      // Try to create another user with same email
      const duplicateUserData = { 
        ...validUserData, 
        username: 'differentuser' 
      };
      
      const response = await request(app)
        .post('/auth/signup')
        .send(duplicateUserData)
        .expect(400);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('User already exists with this email or username');
    });

    it('should reject duplicate username', async () => {
      // Create first user
      await request(app)
        .post('/auth/signup')
        .send(validUserData)
        .expect(201);

      // Try to create another user with same username
      const duplicateUserData = { 
        ...validUserData, 
        email: 'different@example.com' 
      };
      
      const response = await request(app)
        .post('/auth/signup')
        .send(duplicateUserData)
        .expect(400);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('User already exists with this email or username');
    });

    it('should require all mandatory fields', async () => {
      const incompleteUserData = {
        username: 'testuser',
        email: 'test@example.com'
        // Missing password, age, etc.
      };
      
      const response = await request(app)
        .post('/auth/signup')
        .send(incompleteUserData)
        .expect(400);

      expect(response.body.status).toBe('fail');
    });

    it('should create verification record for new user', async () => {
      await request(app)
        .post('/auth/signup')
        .send(validUserData)
        .expect(201);

      // Check verification record was created
      const verificationRecord = await Verification.findOne({ 
        email: validUserData.email 
      });
      expect(verificationRecord).toBeTruthy();
      expect(verificationRecord.type).toBe('user_email');
    });
  });

  describe('POST /auth/login', () => {
    let testUser;

    beforeEach(async () => {
      // Create a verified test user
      testUser = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
        age: 12,
        role: 'children',
        parentEmail: 'parent@example.com',
        isVerified: true,
        emailVerified: true
      });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          emailOrUsername: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.token).toBeTruthy();
    });

    it('should login with username instead of email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          emailOrUsername: 'testuser',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.user.username).toBe(testUser.username);
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          emailOrUsername: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Incorrect email/username or password');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          emailOrUsername: 'nonexistent@example.com',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Incorrect email/username or password');
    });

    it('should reject unverified user', async () => {
      // Create unverified user
      await User.create({
        username: 'unverified',
        email: 'unverified@example.com',
        password: 'password123',
        fullName: 'Unverified User',
        age: 12,
        parentEmail: 'parent@example.com',
        role: 'children',
        isVerified: false
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          emailOrUsername: 'unverified@example.com',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Please verify your email before logging in');
    });

    it('should require both email/username and password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          emailOrUsername: 'test@example.com'
          // Missing password
        })
        .expect(400);

      expect(response.body.status).toBe('fail');
    });
  });
});
