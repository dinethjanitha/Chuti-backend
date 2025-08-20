import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: [true, 'Chat is required']
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  fileUrl: {
    type: String,
    default: null
  },
  fileName: {
    type: String,
    default: null
  },
  fileSize: {
    type: Number,
    default: null
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Index for better query performance
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ createdAt: -1 });

// Method to get message with populated fields
messageSchema.methods.getPopulatedMessage = function() {
  return this.populate([
    {
      path: 'sender',
      select: 'username fullName profilePicture isOnline'
    },
    {
      path: 'replyTo',
      select: 'content sender messageType',
      populate: {
        path: 'sender',
        select: 'username fullName'
      }
    },
    {
      path: 'reactions.user',
      select: 'username fullName'
    }
  ]);
};

// Static method to get messages for a chat
messageSchema.statics.getMessagesForChat = function(chatId, page = 1, limit = 50) {
  return this.find({ 
    chat: chatId, 
    isDeleted: false 
  })
  .populate([
    {
      path: 'sender',
      select: 'username fullName profilePicture isOnline'
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
  .limit(limit * 1)
  .skip((page - 1) * limit);
};

const Message = mongoose.model('Message', messageSchema);

export default Message;
