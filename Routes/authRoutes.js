import express from 'express';
import {
  signup,
  login,
  logout,
  getMe,
  updateMe,
  changePassword,
  refreshToken
} from '../Controllers/authController.js';
import { protect } from '../middleware/auth.js';
import googleAuthRoutes from './firebaseAuthRoutes.js'; // Renamed but still using Firebase for Google OAuth

const router = express.Router();

// Google OAuth authentication routes (through Firebase)
router.use('/google', googleAuthRoutes);

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/refresh-token', refreshToken);

// Protected routes (require authentication)
router.use(protect); // All routes after this middleware are protected

router.post('/logout', logout);
router.get('/me', getMe);
router.patch('/updateMe', updateMe);
router.patch('/changePassword', changePassword);

export default router;
