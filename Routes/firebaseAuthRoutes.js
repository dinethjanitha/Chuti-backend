import express from 'express';
import {
  googleAuth,
  completeGoogleRegistration,
  linkGoogleAccount,
  unlinkGoogleAccount,
  getGoogleUserInfo
} from '../Controllers/googleAuthController.js';
import { protect } from '../middleware/auth.js';
import { checkFirebaseConfig } from '../middleware/firebaseAuth.js';

const router = express.Router();

// Check Firebase configuration for all routes
router.use(checkFirebaseConfig);

// Public Google OAuth routes
router.post('/google-login', googleAuth);
router.post('/google-register', completeGoogleRegistration);
router.post('/google-user-info', getGoogleUserInfo);

// Protected routes (require existing authentication)
router.use(protect);

router.post('/link-google', linkGoogleAccount);
router.delete('/unlink-google', unlinkGoogleAccount);

export default router;
