import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  createGroupChat,
  createDirectChat,
  getUserChats,
  getChatDetails,
  addParticipants,
  removeParticipant,
  updateChatSettings,
  leaveChat,
  deleteChat
} from '../Controllers/chatController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Chat management routes - unified endpoint
router.post('/', (req, res, next) => {
  // Route to appropriate handler based on chat type
  if (req.body.type === 'group') {
    return createGroupChat(req, res, next);
  } else if (req.body.type === 'direct') {
    return createDirectChat(req, res, next);
  } else {
    return res.status(400).json({ message: 'Invalid chat type. Must be "group" or "direct"' });
  }
});
router.post('/group', createGroupChat);
router.post('/direct', createDirectChat);
router.get('/', getUserChats);
router.get('/:chatId', getChatDetails);

// Group chat management
router.post('/:chatId/participants', addParticipants);
router.delete('/:chatId/participants/:participantId', removeParticipant);
router.put('/:chatId/settings', updateChatSettings);
router.post('/:chatId/leave', leaveChat);
router.delete('/:chatId', deleteChat);

export default router;
