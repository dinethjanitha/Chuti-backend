import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../Models/User.js';
import Chat from '../Models/Chat.js';
import Message from '../Models/Message.js';
import { moderateSocketMessage } from '../middleware/moderationMiddleware.js';
import contentMonitoringService from './contentMonitoringService.js';

class SocketService {
  constructor(server) {
    console.log('\n🔌 Initializing Socket.IO Service...');
    
    this.io = new Server(server, {
      cors: {
        origin: [
    "http://localhost:8082",
    "http://localhost:8081", // Default Expo port
    "http://localhost:8083", // Alternative Expo port
    "http://localhost:19006", // Expo web port
    "exp://localhost:19000", // Expo mobile
    "exp://192.168.8.145:8082", // Your Expo mobile app
    "exp://192.168.8.137:8081", // Your Expo mobile app
    "exp://192.168.8.137:8082", // Your Expo mobile app
  ],
        methods: ["GET", "POST"],
        credentials: true
      },
      allowEIO3: true,
      transports: ['websocket', 'polling']
    });

    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> userId
    
    console.log('✅ Socket.IO Server initialized with CORS origins:', [
      "http://localhost:8082",
      "http://localhost:8081",
      "http://localhost:8083",
      "http://localhost:19006",
      "exp://localhost:19000",
      "exp://192.168.8.145:8082"
    ]);
    
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    console.log('🔧 Setting up Socket.IO event handlers...');
    
    this.io.use(this.authenticateSocket.bind(this));

    this.io.on('connection', (socket) => {
      console.log('\n🔌 NEW SOCKET CONNECTION:');
      console.log('├── Socket ID:', socket.id);
      console.log('├── User ID:', socket.userId);
      console.log('├── Username:', socket.user?.username);
      console.log('├── User Full Name:', socket.user?.fullName);
      console.log('├── Connection Time:', new Date().toISOString());
      console.log('├── Handshake Headers:', JSON.stringify(socket.handshake.headers, null, 2));
      console.log('├── Handshake Auth:', socket.handshake.auth);
      console.log('├── Remote Address:', socket.handshake.address);
      console.log('└── Total Connected Users:', this.connectedUsers.size + 1);
      
      // Store user connection
      this.connectedUsers.set(socket.userId, socket.id);
      this.userSockets.set(socket.id, socket.userId);
      
      console.log('📊 Updated Connection Maps:');
      console.log('├── Connected Users Map Size:', this.connectedUsers.size);
      console.log('├── User Sockets Map Size:', this.userSockets.size);
      console.log('└── Connected Users:', Array.from(this.connectedUsers.keys()));

      // Join user to their personal room
      socket.join(`user_${socket.userId}`);
      console.log(`🏠 User joined personal room: user_${socket.userId}`);

      // Join user to their chat rooms
      this.joinUserChats(socket);

      // Update user online status
      this.updateUserOnlineStatus(socket.userId, true);

      // Add ping handler for testing
      socket.on('ping', (data) => {
        console.log('🏓 Ping received from', socket.userId, ':', data);
        socket.emit('pong', { message: 'Pong from server!', originalData: data, timestamp: new Date().toISOString() });
      });

      // Socket event handlers
      this.setupMessageHandlers(socket);
      this.setupChatHandlers(socket);
      this.setupTypingHandlers(socket);
      this.setupPresenceHandlers(socket);

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log('\n❌ SOCKET DISCONNECTION:');
        console.log('├── Socket ID:', socket.id);
        console.log('├── User ID:', socket.userId);
        console.log('├── Username:', socket.user?.username);
        console.log('├── Reason:', reason);
        console.log('├── Disconnect Time:', new Date().toISOString());
        console.log('└── Remaining Connected Users:', this.connectedUsers.size - 1);
        
        this.handleDisconnection(socket);
      });

      // Log all socket events for debugging
      const originalEmit = socket.emit.bind(socket);
      socket.emit = function(event, ...args) {
        console.log(`📤 Emitting to ${socket.userId} (${socket.id}):`, event, args.length > 0 ? args[0] : '');
        return originalEmit(event, ...args);
      };

      const originalOn = socket.on.bind(socket);
      socket.on = function(event, handler) {
        const wrappedHandler = (...args) => {
          console.log(`📥 Event received from ${socket.userId} (${socket.id}):`, event, args.length > 0 ? args[0] : '');
          return handler(...args);
        };
        return originalOn(event, wrappedHandler);
      };
    });

    console.log('✅ Socket.IO event handlers setup complete');
  }

  async authenticateSocket(socket, next) {
    console.log('\n🔐 Socket Authentication Attempt:');
    console.log('├── Socket ID:', socket.id);
    console.log('├── Remote Address:', socket.handshake.address);
    console.log('├── Auth Token from handshake.auth:', socket.handshake.auth.token ? '***PROVIDED***' : 'NOT PROVIDED');
    console.log('├── Auth Token from headers:', socket.handshake.headers.authorization ? '***PROVIDED***' : 'NOT PROVIDED');
    
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        console.log('❌ Authentication failed: No token provided');
        return next(new Error('Authentication token required'));
      }

      console.log('🔍 Verifying JWT token...');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ JWT decoded successfully:', { userId: decoded.userId || decoded.id });
      
      const userId = decoded.userId || decoded.id; // Handle both userId and id fields
      
      console.log('🔍 Finding user in database...');
      const user = await User.findById(userId).select('_id username fullName isActive');
      
      if (!user) {
        console.log('❌ Authentication failed: User not found in database');
        return next(new Error('User not found'));
      }

      if (!user.isActive) {
        console.log('❌ Authentication failed: User account is not active');
        return next(new Error('User account not active'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      
      console.log('✅ Socket authentication successful:');
      console.log('├── User ID:', socket.userId);
      console.log('├── Username:', socket.user.username);
      console.log('├── Full Name:', socket.user.fullName);
      console.log('└── Is Active:', socket.user.isActive);
      
      next();
    } catch (error) {
      console.log('❌ Socket authentication error:');
      console.log('├── Error Type:', error.name);
      console.log('├── Error Message:', error.message);
      console.log('└── Stack:', error.stack);
      next(new Error('Authentication failed: ' + error.message));
    }
  }

  async joinUserChats(socket) {
    console.log('\n🏠 Joining user to chat rooms:');
    console.log('├── User ID:', socket.userId);
    
    try {
      const userChats = await Chat.find({
        'participants.user': socket.userId,
        'participants.isActive': true,
        isActive: true
      }).select('_id chatType');

      console.log('├── Found', userChats.length, 'active chats');
      
      userChats.forEach((chat, index) => {
        socket.join(`chat_${chat._id}`);
        console.log(`├── [${index + 1}] Joined chat_${chat._id} (${chat.chatType})`);
      });
      
      console.log('└── ✅ User joined all chat rooms successfully');
    } catch (error) {
      console.log('└── ❌ Error joining user chats:', error.message);
    }
  }

  setupMessageHandlers(socket) {
    // Send message
    socket.on('sendMessage', async (data) => {
      console.log('📤 sendMessage event received:', {
        socketId: socket.id,
        userId: socket.userId,
        data: data
      });

      try {
        const { chatId, content, messageType = 'text', replyTo = null } = data;

        // Validate input
        if (!chatId || !content || content.trim().length === 0) {
          console.log('❌ Invalid message data:', { chatId, content });
          socket.emit('error', { message: 'Chat ID and content are required' });
          return;
        }

        // 🔒 FAST SEXUAL CONTENT MODERATION CHECK WITH ASYNC PARENT NOTIFICATION
        if (messageType === 'text') {
          try {
            console.log('⚡ Fast content check for immediate UI response...');
            const monitoring = await contentMonitoringService.monitorTextContent(content, socket.userId, chatId);
            
            if (monitoring.blocked) {
              console.log('❌ Inappropriate content blocked instantly:', {
                userId: socket.userId,
                chatId,
                reason: monitoring.reason
              });
              
              socket.emit('messageBlocked', {
                reason: monitoring.reason,
                message: monitoring.message,
                blocked: true
              });
              return;
            }
            console.log('✅ Content approved in fast check');
          } catch (monitoringError) {
            console.error('⚠️ Fast content monitoring failed, using fallback moderation:', monitoringError);
            
            // Fallback to basic moderation if monitoring service fails
            const moderation = await moderateSocketMessage(content);
            if (moderation.is_sexual) {
              console.log('❌ Sexual content blocked by fallback moderation');
              socket.emit('messageBlocked', {
                reason: 'sexual_content',
                message: 'Your message contains inappropriate content and has been blocked. Please keep conversations appropriate.',
                blocked: true
              });
              return;
            }
          }
        }

        // Check chat access
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isActive || !chat.isParticipant(socket.userId)) {
          console.log('❌ Chat access denied:', { chatId, userId: socket.userId });
          socket.emit('error', { message: 'Chat not found or access denied' });
          return;
        }

        // Create and save message
        const newMessage = new Message({
          content: content.trim(),
          messageType,
          sender: socket.userId,
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

        console.log('✅ Message created and populated:', {
          messageId: newMessage._id,
          chatId: chatId,
          sender: newMessage.sender.username
        });

        // Update chat
        chat.lastMessage = newMessage._id;
        chat.lastActivity = new Date();
        await chat.save();

        // Emit to chat room
        console.log('📢 Emitting newMessage to chat room:', `chat_${chatId}`);
        this.io.to(`chat_${chatId}`).emit('newMessage', newMessage);

        // Send confirmation to sender
        socket.emit('messageSent', { messageId: newMessage._id });

      } catch (error) {
        console.error('❌ Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Mark messages as read
    socket.on('markMessagesRead', async (data) => {
      try {
        const { chatId, messageIds } = data;

        if (!chatId || !Array.isArray(messageIds)) {
          return;
        }

        // Update read status
        await Message.updateMany(
          { 
            _id: { $in: messageIds },
            chat: chatId,
            'readBy.user': { $ne: socket.userId }
          },
          { 
            $addToSet: { 
              readBy: { 
                user: socket.userId, 
                readAt: new Date() 
              } 
            } 
          }
        );

        // Emit read receipts to chat
        socket.to(`chat_${chatId}`).emit('messagesRead', {
          chatId,
          messageIds,
          readBy: socket.userId
        });

      } catch (error) {
        console.error('Mark messages read error:', error);
      }
    });
  }

  setupChatHandlers(socket) {
    // Join chat room
    socket.on('joinChat', (chatId) => {
      console.log('🏠 joinChat event received:', {
        chatId,
        socketId: socket.id,
        userId: socket.userId
      });
      
      socket.join(`chat_${chatId}`);
      socket.to(`chat_${chatId}`).emit('userJoinedChat', {
        userId: socket.userId,
        username: socket.user.username
      });
      
      console.log('✅ User joined chat room:', `chat_${chatId}`);
    });

    // Leave chat room
    socket.on('leaveChat', (chatId) => {
      console.log('🚪 leaveChat event received:', {
        chatId,
        socketId: socket.id,
        userId: socket.userId
      });
      
      socket.leave(`chat_${chatId}`);
      socket.to(`chat_${chatId}`).emit('userLeftChat', {
        userId: socket.userId,
        username: socket.user.username
      });
      
      console.log('✅ User left chat room:', `chat_${chatId}`);
    });
  }

  setupTypingHandlers(socket) {
    // Start typing
    socket.on('startTyping', (data) => {
      const { chatId } = data;
      if (chatId) {
        socket.to(`chat_${chatId}`).emit('userStartTyping', {
          userId: socket.userId,
          username: socket.user.username,
          chatId
        });
      }
    });

    // Stop typing
    socket.on('stopTyping', (data) => {
      const { chatId } = data;
      if (chatId) {
        socket.to(`chat_${chatId}`).emit('userStopTyping', {
          userId: socket.userId,
          username: socket.user.username,
          chatId
        });
      }
    });
  }

  setupPresenceHandlers(socket) {
    // Update presence status
    socket.on('updatePresence', async (data) => {
      try {
        const { status } = data; // 'online', 'away', 'busy', 'offline'
        
        await User.findByIdAndUpdate(socket.userId, {
          presenceStatus: status,
          lastSeen: new Date()
        });

        // Emit to all user's contacts/chats
        const userChats = await Chat.find({
          'participants.user': socket.userId,
          'participants.isActive': true,
          isActive: true
        }).populate('participants.user', '_id');

        const contactIds = new Set();
        userChats.forEach(chat => {
          chat.participants.forEach(participant => {
            if (participant.user._id.toString() !== socket.userId) {
              contactIds.add(participant.user._id.toString());
            }
          });
        });

        contactIds.forEach(contactId => {
          socket.to(`user_${contactId}`).emit('presenceUpdate', {
            userId: socket.userId,
            status,
            lastSeen: new Date()
          });
        });

      } catch (error) {
        console.error('Update presence error:', error);
      }
    });
  }

  async updateUserOnlineStatus(userId, isOnline) {
    try {
      await User.findByIdAndUpdate(userId, {
        isOnline,
        lastSeen: new Date()
      });

      // Emit presence update to contacts
      const userChats = await Chat.find({
        'participants.user': userId,
        'participants.isActive': true,
        isActive: true
      }).populate('participants.user', '_id');

      const contactIds = new Set();
      userChats.forEach(chat => {
        chat.participants.forEach(participant => {
          if (participant.user._id.toString() !== userId) {
            contactIds.add(participant.user._id.toString());
          }
        });
      });

      contactIds.forEach(contactId => {
        this.io.to(`user_${contactId}`).emit('presenceUpdate', {
          userId,
          isOnline,
          lastSeen: new Date()
        });
      });

    } catch (error) {
      console.error('Update online status error:', error);
    }
  }

  handleDisconnection(socket) {
    // Remove from connected users
    this.connectedUsers.delete(socket.userId);
    this.userSockets.delete(socket.id);

    // Update offline status
    this.updateUserOnlineStatus(socket.userId, false);
  }

  // Utility methods for controllers to emit events
  emitToUser(userId, event, data) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(`user_${userId}`).emit(event, data);
    }
  }

  emitToChat(chatId, event, data) {
    this.io.to(`chat_${chatId}`).emit(event, data);
  }

  emitToAll(event, data) {
    this.io.emit(event, data);
  }

  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  getUserStatus(userId) {
    return this.connectedUsers.has(userId);
  }
}

export default SocketService;
