import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  sendMessage,
  getChatMessages,
  editMessage,
  deleteMessage,
  addReaction,
  getUnreadCount
} from '../Controllers/messageController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Message operations
router.post('/', sendMessage);
router.get('/chat/:chatId', getChatMessages);
router.put('/:messageId', editMessage);
router.delete('/:messageId', deleteMessage);
router.post('/:messageId/reaction', addReaction);
router.get('/unread/count', getUnreadCount);

export default router;
