import express from 'express';
import {
  sendVerificationCodes,
  verifyEmail,
  resendVerificationCode,
  getVerificationStatus
} from '../Controllers/verificationController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public routes (no authentication required for verification)
router.post('/send-codes', sendVerificationCodes);
router.post('/verify-email', verifyEmail);
router.post('/resend-code', resendVerificationCode);
router.get('/status/:userId', getVerificationStatus);

export default router;
