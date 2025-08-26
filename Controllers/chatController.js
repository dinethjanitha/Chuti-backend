import Chat from '../Models/Chat.js';
import Message from '../Models/Message.js';
import User from '../Models/User.js';

// Create a new group chat
export const createGroupChat = async (req, res) => {
  try {
    const { name, description, participants = [], chatType = 'group' } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Chat name is required'
      });
    }

    // Ensure creator is in participants
    const participantIds = [...new Set([userId, ...participants])];

    // Validate participants exist
    const validUsers = await User.find({ 
      _id: { $in: participantIds },
      isActive: true 
    });

    if (validUsers.length !== participantIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some participants are invalid'
      });
    }

    // Create chat
    const newChat = new Chat({
      name: name.trim(),
      description: description?.trim(),
      chatType,
      createdBy: userId,
      participants: participantIds.map(id => ({
        user: id,
        role: id === userId ? 'admin' : 'member'
      }))
    });

    await newChat.save();
    await newChat.populate([
      {
        path: 'participants.user',
        select: 'username fullName profilePicture isOnline'
      },
      {
        path: 'createdBy',
        select: 'username fullName profilePicture'
      }
    ]);

    // Emit to all participants
    const io = req.app.get('io');
    participantIds.forEach(participantId => {
      io.to(`user_${participantId}`).emit('chatCreated', newChat);
    });

    res.status(201).json({
      success: true,
      message: 'Group chat created successfully',
      data: newChat
    });

  } catch (error) {
    console.error('Create group chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create group chat',
      error: error.message
    });
  }
};

// Create or get direct chat
export const createDirectChat = async (req, res) => {
  try {
    const { participantId } = req.body;
    const userId = req.user.id;

    if (!participantId) {
      return res.status(400).json({
        success: false,
        message: 'Participant ID is required'
      });
    }

    if (participantId === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create chat with yourself'
      });
    }

    // Check if participant exists
    const participant = await User.findById(participantId);
    if (!participant || !participant.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create or get existing direct chat
    const chat = await Chat.createDirectChat(userId, participantId);
    await chat.populate([
      {
        path: 'participants.user',
        select: 'username fullName profilePicture isOnline'
      }
    ]);

    res.status(200).json({
      success: true,
      message: 'Direct chat ready',
      data: chat
    });

  } catch (error) {
    console.error('Create direct chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create direct chat',
      error: error.message
    });
  }
};

// Get user's chats
export const getUserChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const chats = await Chat.getUserChats(userId)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    res.status(200).json({
      success: true,
      message: 'Chats retrieved successfully',
      data: chats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: chats.length
      }
    });

  } catch (error) {
    console.error('Get user chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve chats',
      error: error.message
    });
  }
};

// Get chat details
export const getChatDetails = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id; // Fixed: Changed from req.user.userId to req.user.id

    const chat = await Chat.findById(chatId)
      .populate([
        {
          path: 'participants.user',
          select: 'username fullName profilePicture isOnline lastSeen'
        },
        {
          path: 'createdBy',
          select: 'username fullName profilePicture'
        }
      ]);

    if (!chat || !chat.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Chat details retrieved successfully',
      data: chat
    });

  } catch (error) {
    console.error('Get chat details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve chat details',
      error: error.message
    });
  }
};

// Add participants to group chat
export const addParticipants = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { participants } = req.body;
    const userId = req.user.id;

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Participants array is required'
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Check if user can add participants (admin or moderator)
    if (!chat.canModerate(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only admins and moderators can add participants'
      });
    }

    // Check if it's a group chat
    if (chat.chatType === 'direct') {
      return res.status(400).json({
        success: false,
        message: 'Cannot add participants to direct chat'
      });
    }

    // Validate new participants
    const validUsers = await User.find({ 
      _id: { $in: participants },
      isActive: true 
    });

    if (validUsers.length !== participants.length) {
      return res.status(400).json({
        success: false,
        message: 'Some participants are invalid'
      });
    }

    // Add participants
    const addedParticipants = [];
    for (const participantId of participants) {
      if (!chat.isParticipant(participantId)) {
        await chat.addParticipant(participantId);
        addedParticipants.push(participantId);
      }
    }

    await chat.populate([
      {
        path: 'participants.user',
        select: 'username fullName profilePicture isOnline'
      }
    ]);

    // Emit to all participants
    const io = req.app.get('io');
    chat.participants.forEach(participant => {
      if (participant.isActive) {
        io.to(`user_${participant.user._id}`).emit('participantsAdded', {
          chatId: chat._id,
          addedParticipants,
          chat
        });
      }
    });

    res.status(200).json({
      success: true,
      message: 'Participants added successfully',
      data: { addedParticipants, chat }
    });

  } catch (error) {
    console.error('Add participants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add participants',
      error: error.message
    });
  }
};

// Remove participant from group chat
export const removeParticipant = async (req, res) => {
  try {
    const { chatId, participantId } = req.params;
    const userId = req.user.id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Check permissions
    if (!chat.canModerate(userId) && userId !== participantId) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Check if it's a group chat
    if (chat.chatType === 'direct') {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove participants from direct chat'
      });
    }

    // Remove participant
    await chat.removeParticipant(participantId);

    // Emit to all participants
    const io = req.app.get('io');
    chat.participants.forEach(participant => {
      if (participant.isActive) {
        io.to(`user_${participant.user}`).emit('participantRemoved', {
          chatId: chat._id,
          removedParticipant: participantId
        });
      }
    });

    res.status(200).json({
      success: true,
      message: 'Participant removed successfully'
    });

  } catch (error) {
    console.error('Remove participant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove participant',
      error: error.message
    });
  }
};

// Update chat settings
export const updateChatSettings = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Check if user can update settings
    if (!chat.canModerate(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only admins and moderators can update chat settings'
      });
    }

    // Update allowed fields
    const allowedUpdates = ['name', 'description', 'avatar', 'settings'];
    const updateData = {};

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    Object.assign(chat, updateData);
    await chat.save();

    // Emit to all participants
    const io = req.app.get('io');
    chat.participants.forEach(participant => {
      if (participant.isActive) {
        io.to(`user_${participant.user}`).emit('chatUpdated', {
          chatId: chat._id,
          updates: updateData
        });
      }
    });

    res.status(200).json({
      success: true,
      message: 'Chat settings updated successfully',
      data: chat
    });

  } catch (error) {
    console.error('Update chat settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update chat settings',
      error: error.message
    });
  }
};

// Leave chat
export const leaveChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You are not a participant in this chat'
      });
    }

    // Cannot leave direct chat
    if (chat.chatType === 'direct') {
      return res.status(400).json({
        success: false,
        message: 'Cannot leave direct chat'
      });
    }

    // Remove user from chat
    await chat.removeParticipant(userId);

    // Emit to remaining participants
    const io = req.app.get('io');
    chat.participants.forEach(participant => {
      if (participant.isActive && participant.user.toString() !== userId) {
        io.to(`user_${participant.user}`).emit('participantLeft', {
          chatId: chat._id,
          leftParticipant: userId
        });
      }
    });

    res.status(200).json({
      success: true,
      message: 'Left chat successfully'
    });

  } catch (error) {
    console.error('Leave chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave chat',
      error: error.message
    });
  }
};

// Delete chat
export const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;

    // Find the chat
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this chat'
      });
    }

    // For direct chats, only allow deletion by either participant
    // For group chats, only allow deletion by admin/creator
    if (chat.chatType === 'group' && !chat.canModerate(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only chat admin can delete group chats'
      });
    }

    // Soft delete the chat
    chat.isActive = false;
    chat.deletedAt = new Date();
    chat.deletedBy = userId;
    await chat.save();

    // Also soft delete all messages in this chat
    await Message.updateMany(
      { chat: chatId, isDeleted: false },
      { 
        isDeleted: true, 
        deletedAt: new Date(),
        deletedBy: userId 
      }
    );

    // Emit to all participants
    const io = req.app.get('io');
    chat.participants.forEach(participant => {
      if (participant.isActive) {
        io.to(`user_${participant.user}`).emit('chatDeleted', {
          chatId: chat._id,
          deletedBy: userId
        });
      }
    });

    res.status(200).json({
      success: true,
      message: 'Chat deleted successfully'
    });

  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete chat',
      error: error.message
    });
  }
};
