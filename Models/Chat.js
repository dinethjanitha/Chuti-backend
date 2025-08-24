import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Chat name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Chat description cannot exceed 500 characters']
  },
  chatType: {
    type: String,
    enum: ['direct', 'group', 'public'],
    required: [true, 'Chat type is required']
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['member', 'admin', 'moderator'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  avatar: {
    type: String,
    default: null
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  maxParticipants: {
    type: Number,
    default: 100,
    max: [500, 'Maximum participants cannot exceed 500']
  },
  settings: {
    allowFileSharing: {
      type: Boolean,
      default: true
    },
    allowImageSharing: {
      type: Boolean,
      default: true
    },
    moderationEnabled: {
      type: Boolean,
      default: true
    },
    autoDeleteMessages: {
      type: Boolean,
      default: false
    },
    autoDeleteDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365
    }
  }
}, {
  timestamps: true
});

// Index for better query performance
chatSchema.index({ 'participants.user': 1 });
chatSchema.index({ chatType: 1 });
chatSchema.index({ lastActivity: -1 });
chatSchema.index({ createdBy: 1 });

// Virtual for active participants count
chatSchema.virtual('activeParticipantsCount').get(function() {
  return this.participants.filter(p => p.isActive).length;
});

// Method to check if user is participant
chatSchema.methods.isParticipant = function(userId) {
  return this.participants.some(
    p => {
      // Handle both populated and non-populated user field
      if (!p.user) return false;
      const participantUserId = p.user._id ? p.user._id.toString() : p.user.toString();
      return participantUserId === userId.toString() && p.isActive;
    }
  );
};

// Method to get user role in chat
chatSchema.methods.getUserRole = function(userId) {
  const participant = this.participants.find(
    p => {
      // Handle both populated and non-populated user field
      const participantUserId = p.user._id ? p.user._id.toString() : p.user.toString();
      return participantUserId === userId.toString() && p.isActive;
    }
  );
  return participant ? participant.role : null;
};

// Method to check if user is admin or moderator
chatSchema.methods.canModerate = function(userId) {
  const role = this.getUserRole(userId);
  return role === 'admin' || role === 'moderator';
};

// Static method to get user's chats
chatSchema.statics.getUserChats = function(userId) {
  return this.find({
    'participants.user': userId,
    'participants.isActive': true,
    isActive: true
  })
  .populate([
    {
      path: 'participants.user',
      select: 'username fullName profilePicture isOnline'
    },
    {
      path: 'lastMessage',
      select: 'content sender createdAt messageType',
      populate: {
        path: 'sender',
        select: 'username fullName'
      }
    },
    {
      path: 'createdBy',
      select: 'username fullName profilePicture'
    }
  ])
  .sort({ lastActivity: -1 });
};

// Static method to create direct chat
chatSchema.statics.createDirectChat = async function(user1Id, user2Id) {
  // Check if direct chat already exists
  const existingChat = await this.findOne({
    chatType: 'direct',
    $and: [
      { 'participants.user': user1Id },
      { 'participants.user': user2Id }
    ],
    isActive: true
  });

  if (existingChat) {
    return existingChat;
  }

  // Create new direct chat
  const newChat = new this({
    chatType: 'direct',
    createdBy: user1Id,
    participants: [
      { user: user1Id, role: 'member' },
      { user: user2Id, role: 'member' }
    ]
  });

  return await newChat.save();
};

// Method to add participant
chatSchema.methods.addParticipant = function(userId, role = 'member') {
  const existingParticipant = this.participants.find(
    p => p.user.toString() === userId.toString()
  );

  if (existingParticipant) {
    existingParticipant.isActive = true;
    existingParticipant.role = role;
    existingParticipant.joinedAt = new Date();
  } else {
    this.participants.push({
      user: userId,
      role: role,
      joinedAt: new Date()
    });
  }

  return this.save();
};

// Method to remove participant
chatSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(
    p => p.user.toString() === userId.toString()
  );

  if (participant) {
    participant.isActive = false;
  }

  return this.save();
};

const Chat = mongoose.model('Chat', chatSchema);

export default Chat;
