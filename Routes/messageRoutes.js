import express from 'express';
import { protect } from '../middleware/auth.js';
import { sexualContentMiddleware } from '../middleware/moderationMiddleware.js';
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

// Message operations (with sexual content moderation for sending messages)
router.post('/', sexualContentMiddleware, sendMessage);
router.get('/chat/:chatId', getChatMessages);
router.put('/:messageId', sexualContentMiddleware, editMessage); // Also check edited messages
router.delete('/:messageId', deleteMessage);
router.post('/:messageId/reaction', addReaction);
router.get('/unread/count', getUnreadCount);

export default router;
