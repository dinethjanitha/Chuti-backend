import Message from '../Models/Message.js';
import Chat from '../Models/Chat.js';
import User from '../Models/User.js';

// Send a message
export const sendMessage = async (req, res) => {
  try {
    const { chatId, content, messageType = 'text', replyTo = null } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!chatId || !content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID and content are required'
      });
    }

    // Check if chat exists and user is participant
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    if (!chat.isParticipant(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this chat'
      });
    }

    // Validate reply message if provided
    let replyToMessage = null;
    if (replyTo) {
      replyToMessage = await Message.findById(replyTo);
      if (!replyToMessage || replyToMessage.chat.toString() !== chatId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid reply message'
        });
      }
    }

    // Create message
    const newMessage = new Message({
      content: content.trim(),
      messageType,
      sender: userId,
      chat: chatId,
      replyTo: replyTo || null
    });

    await newMessage.save();
    await newMessage.populate([
      {
        path: 'sender',
        select: 'username fullName profilePicture'
      },
      {
        path: 'replyTo',
        select: 'content sender messageType',
        populate: {
          path: 'sender',
          select: 'username fullName'
        }
      }
    ]);

    // Update chat's last message and activity
    chat.lastMessage = newMessage._id;
    chat.lastActivity = new Date();
    await chat.save();

    // Emit to all chat participants
    const io = req.app.get('io');
    chat.participants.forEach(participant => {
      if (participant.isActive) {
        io.to(`user_${participant.user}`).emit('newMessage', newMessage);
      }
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

// Get chat messages
export const getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50, before = null } = req.query;
    const userId = req.user.id;

    // Check if chat exists and user is participant
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    if (!chat.isParticipant(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Build query
    const query = { 
      chat: chatId,
      isDeleted: false
    };

    // Add before filter for pagination
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    // Get messages
    const messages = await Message.find(query)
      .populate([
        {
          path: 'sender',
          select: 'username fullName profilePicture'
        },
        {
          path: 'replyTo',
          select: 'content sender messageType',
          populate: {
            path: 'sender',
            select: 'username fullName'
          }
        }
      ])
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Mark messages as read for current user
    const unreadMessageIds = messages
      .filter(msg => !msg.readBy.some(read => read.user.toString() === userId))
      .map(msg => msg._id);

    if (unreadMessageIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessageIds } },
        { 
          $addToSet: { 
            readBy: { 
              user: userId, 
              readAt: new Date() 
            } 
          } 
        }
      );

      // Emit read receipts
      const io = req.app.get('io');
      chat.participants.forEach(participant => {
        if (participant.isActive && participant.user.toString() !== userId) {
          io.to(`user_${participant.user}`).emit('messagesRead', {
            chatId,
            messageIds: unreadMessageIds,
            readBy: userId
          });
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Messages retrieved successfully',
      data: messages.reverse(), // Return in chronological order
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve messages',
      error: error.message
    });
  }
};

// Edit message
export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is the sender
    if (message.sender.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own messages'
      });
    }

    // Check if message is within edit time limit (15 minutes)
    const editTimeLimit = 15 * 60 * 1000; // 15 minutes
    if (Date.now() - message.createdAt.getTime() > editTimeLimit) {
      return res.status(400).json({
        success: false,
        message: 'Message edit time limit exceeded'
      });
    }

    // Update message
    message.content = content.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    await message.populate([
      {
        path: 'sender',
        select: 'username fullName profilePicture'
      }
    ]);

    // Get chat participants for real-time update
    const chat = await Chat.findById(message.chat);
    const io = req.app.get('io');
    chat.participants.forEach(participant => {
      if (participant.isActive) {
        io.to(`user_${participant.user}`).emit('messageEdited', message);
      }
    });

    res.status(200).json({
      success: true,
      message: 'Message edited successfully',
      data: message
    });

  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to edit message',
      error: error.message
    });
  }
};

// Delete message
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check permissions (sender or chat moderator)
    const chat = await Chat.findById(message.chat);
    const canDelete = message.sender.toString() === userId || chat.canModerate(userId);

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to delete message'
      });
    }

    // Soft delete
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = userId;
    await message.save();

    // Emit to chat participants
    const io = req.app.get('io');
    chat.participants.forEach(participant => {
      if (participant.isActive) {
        io.to(`user_${participant.user}`).emit('messageDeleted', {
          messageId: message._id,
          chatId: message.chat
        });
      }
    });

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error.message
    });
  }
};

// Add reaction to message
export const addReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: 'Emoji is required'
      });
    }

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is participant in the chat
    const chat = await Chat.findById(message.chat);
    if (!chat.isParticipant(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Add or remove reaction
    const existingReactionIndex = message.reactions.findIndex(
      r => r.user.toString() === userId && r.emoji === emoji
    );

    if (existingReactionIndex > -1) {
      // Remove reaction
      message.reactions.splice(existingReactionIndex, 1);
    } else {
      // Add reaction
      message.reactions.push({
        user: userId,
        emoji: emoji
      });
    }

    await message.save();
    await message.populate('reactions.user', 'username fullName');

    // Emit to chat participants
    const io = req.app.get('io');
    chat.participants.forEach(participant => {
      if (participant.isActive) {
        io.to(`user_${participant.user}`).emit('messageReactionUpdated', {
          messageId: message._id,
          reactions: message.reactions
        });
      }
    });

    res.status(200).json({
      success: true,
      message: 'Reaction updated successfully',
      data: message.reactions
    });

  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update reaction',
      error: error.message
    });
  }
};

// Get unread message count
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's chats
    const userChats = await Chat.find({
      'participants.user': userId,
      'participants.isActive': true,
      isActive: true
    }).select('_id');

    const chatIds = userChats.map(chat => chat._id);

    // Count unread messages
    const unreadCount = await Message.countDocuments({
      chat: { $in: chatIds },
      sender: { $ne: userId },
      'readBy.user': { $ne: userId },
      isDeleted: false
    });

    res.status(200).json({
      success: true,
      message: 'Unread count retrieved successfully',
      data: { unreadCount }
    });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    });
  }
};
