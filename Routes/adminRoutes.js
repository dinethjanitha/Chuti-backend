import express from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  adminLogin,
  getAllUsers,
  getUserById,
  updateUser,
  banUser,
  unbanUser,
  deleteUser,
  getAnalytics,
  getUserMessageCount
} from '../Controllers/adminController.js';

const router = express.Router();

// Public admin routes
router.post('/login', adminLogin);

// Protected admin routes (require admin authentication)
router.use(protect);
router.use(adminOnly);

// User management
router.get('/users', getAllUsers);
router.get('/users/:userId', getUserById);
router.put('/users/:userId', updateUser);
router.delete('/users/:userId', deleteUser);
router.post('/users/:userId/ban', banUser);
router.post('/users/:userId/unban', unbanUser);
router.get('/users/:userId/message-count', getUserMessageCount);

// Analytics
router.get('/analytics', getAnalytics);

export default router;
