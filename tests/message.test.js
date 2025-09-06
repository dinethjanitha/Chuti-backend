import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { sendMessage, getChatMessages, deleteMessage, editMessage } from '../Controllers/messageController.js';
import Message from '../Models/Message.js';
import Chat from '../Models/Chat.js';
import User from '../Models/User.js';

// Mock the auth middleware
const mockAuthMiddleware = (req, res, next) => {
  req.user = { 
    id: req.headers['user-id'] || '507f1f77bcf86cd799439011',
    role: 'children'
  };
  next();
};

// Create Express app for testing
const app = express();
app.use(express.json());
app.use(mockAuthMiddleware);

// Add routes for testing
app.post('/message/:chatId', sendMessage);
app.get('/message/:chatId', getChatMessages);
app.delete('/message/:id', deleteMessage);
app.put('/message/:id', editMessage);

describe('Message Controller', () => {
  let testUser1, testUser2, testChat;

  beforeEach(async () => {
    // Create test users
    testUser1 = await User.create({
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
      username: 'testuser1',
      email: 'test1@example.com',
      password: 'password123',
      fullName: 'Test User 1',
      age: 12,
      parentEmail: 'parent1@example.com',
      role: 'children',
      isVerified: true
    });

    testUser2 = await User.create({
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439012'),
      username: 'testuser2',
      email: 'test2@example.com',
      password: 'password123',
      fullName: 'Test User 2',
      age: 13,
      role: 'children',
      isVerified: true
    });

    // Create test chat
    testChat = await Chat.create({
      name: 'Test Chat',
      chatType: 'group',
      participants: [
        { user: testUser1._id, role: 'admin' },
        { user: testUser2._id, role: 'member' }
      ],
      createdBy: testUser1._id,
      isActive: true
    });
  });

  describe('POST /message/:chatId', () => {
    it('should send a message to chat', async () => {
      const messageData = {
        content: 'Hello, this is a test message!',
        messageType: 'text'
      };

      const response = await request(app)
        .post(`/message/${testChat._id}`)
        .set('user-id', testUser1._id.toString())
        .send(messageData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Message sent successfully');
      expect(response.body.data.message.content).toBe(messageData.content);
      expect(response.body.data.message.messageType).toBe('text');
      expect(response.body.data.message.sender._id).toBe(testUser1._id.toString());
      expect(response.body.data.message.chat).toBe(testChat._id.toString());

      // Verify message was saved in database
      const messageInDb = await Message.findById(response.body.data.message._id);
      expect(messageInDb).toBeTruthy();
      expect(messageInDb.content).toBe(messageData.content);
    });

    it('should reject empty message content', async () => {
      const messageData = {
        content: '',
        messageType: 'text'
      };

      const response = await request(app)
        .post(`/message/${testChat._id}`)
        .set('user-id', testUser1._id.toString())
        .send(messageData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Message content is required');
    });

    it('should reject message with only whitespace', async () => {
      const messageData = {
        content: '   \n\t   ',
        messageType: 'text'
      };

      const response = await request(app)
        .post(`/message/${testChat._id}`)
        .set('user-id', testUser1._id.toString())
        .send(messageData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Message content is required');
    });

    it('should reject message to non-existent chat', async () => {
      const messageData = {
        content: 'Hello!',
        messageType: 'text'
      };

      const response = await request(app)
        .post('/message/507f1f77bcf86cd799439999')
        .set('user-id', testUser1._id.toString())
        .send(messageData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Chat not found');
    });

    it('should reject message from non-participant', async () => {
      const nonParticipantUser = await User.create({
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439013'),
        username: 'nonparticipant',
        email: 'non@example.com',
        password: 'password123',
        fullName: 'Non Participant',
        age: 12,
        parentEmail: 'parent_non@example.com',
        role: 'children',
        isVerified: true
      });

      const messageData = {
        content: 'Hello!',
        messageType: 'text'
      };

      const response = await request(app)
        .post(`/message/${testChat._id}`)
        .set('user-id', nonParticipantUser._id.toString())
        .send(messageData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Access denied. You are not a participant in this chat.');
    });

    it('should handle different message types', async () => {
      const messageData = {
        content: 'image.jpg',
        messageType: 'image'
      };

      const response = await request(app)
        .post(`/message/${testChat._id}`)
        .set('user-id', testUser1._id.toString())
        .send(messageData)
        .expect(201);

      expect(response.body.data.message.messageType).toBe('image');
    });

    it('should default to text message type if not specified', async () => {
      const messageData = {
        content: 'Hello!'
      };

      const response = await request(app)
        .post(`/message/${testChat._id}`)
        .set('user-id', testUser1._id.toString())
        .send(messageData)
        .expect(201);

      expect(response.body.data.message.messageType).toBe('text');
    });
  });

  describe('GET /message/:chatId', () => {
    let testMessage1, testMessage2, testMessage3;

    beforeEach(async () => {
      // Create test messages
      testMessage1 = await Message.create({
        content: 'First message',
        messageType: 'text',
        sender: testUser1._id,
        chat: testChat._id,
        timestamp: new Date('2024-01-01T10:00:00Z')
      });

      testMessage2 = await Message.create({
        content: 'Second message',
        messageType: 'text',
        sender: testUser2._id,
        chat: testChat._id,
        timestamp: new Date('2024-01-01T10:05:00Z')
      });

      testMessage3 = await Message.create({
        content: 'Third message',
        messageType: 'text',
        sender: testUser1._id,
        chat: testChat._id,
        timestamp: new Date('2024-01-01T10:10:00Z')
      });
    });

    it('should retrieve chat messages for participant', async () => {
      const response = await request(app)
        .get(`/message/${testChat._id}`)
        .set('user-id', testUser1._id.toString())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Messages retrieved successfully');
      expect(response.body.data).toHaveLength(3);
      
      // Messages should be sorted by timestamp (newest first)
      expect(response.body.data[0].content).toBe('Third message');
      expect(response.body.data[1].content).toBe('Second message');
      expect(response.body.data[2].content).toBe('First message');
    });

    it('should reject access for non-participant', async () => {
      const nonParticipantUser = await User.create({
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439013'),
        username: 'nonparticipant',
        email: 'non@example.com',
        password: 'password123',
        fullName: 'Non Participant',
        age: 12,
        parentEmail: 'parent_non@example.com',
        role: 'children',
        isVerified: true
      });

      const response = await request(app)
        .get(`/message/${testChat._id}`)
        .set('user-id', nonParticipantUser._id.toString())
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Access denied. You are not a participant in this chat.');
    });

    it('should handle pagination', async () => {
      const response = await request(app)
        .get(`/message/${testChat._id}?page=1&limit=2`)
        .set('user-id', testUser1._id.toString())
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.total).toBe(3);
    });

    it('should return empty array for chat with no messages', async () => {
      const emptyChat = await Chat.create({
        name: 'Empty Chat',
        chatType: 'group',
        participants: [
          { user: testUser1._id, role: 'admin' },
          { user: testUser2._id, role: 'member' }
        ],
        createdBy: testUser1._id,
        isActive: true
      });

      const response = await request(app)
        .get(`/message/${emptyChat._id}`)
        .set('user-id', testUser1._id.toString())
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('should handle non-existent chat', async () => {
      const response = await request(app)
        .get('/message/507f1f77bcf86cd799439999')
        .set('user-id', testUser1._id.toString())
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Chat not found');
    });
  });

  describe('PUT /message/:id', () => {
    let testMessage;

    beforeEach(async () => {
      testMessage = await Message.create({
        content: 'Original message',
        messageType: 'text',
        sender: testUser1._id,
        chat: testChat._id
      });
    });

    it('should edit message by sender', async () => {
      const updateData = {
        content: 'Updated message content'
      };

      const response = await request(app)
        .put(`/message/${testMessage._id}`)
        .set('user-id', testUser1._id.toString())
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Message updated successfully');
      expect(response.body.data.message.content).toBe(updateData.content);
      expect(response.body.data.message.isEdited).toBe(true);

      // Verify in database
      const updatedMessage = await Message.findById(testMessage._id);
      expect(updatedMessage.content).toBe(updateData.content);
      expect(updatedMessage.isEdited).toBe(true);
    });

    it('should reject edit with empty content', async () => {
      const updateData = {
        content: ''
      };

      const response = await request(app)
        .put(`/message/${testMessage._id}`)
        .set('user-id', testUser1._id.toString())
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Message content is required');
    });

    it('should reject edit by non-sender', async () => {
      const updateData = {
        content: 'Updated message content'
      };

      const response = await request(app)
        .put(`/message/${testMessage._id}`)
        .set('user-id', testUser2._id.toString())
        .send(updateData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('You can only edit your own messages');
    });

    it('should reject edit of non-existent message', async () => {
      const updateData = {
        content: 'Updated message content'
      };

      const response = await request(app)
        .put('/message/507f1f77bcf86cd799439999')
        .set('user-id', testUser1._id.toString())
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Message not found');
    });

    it('should reject edit of deleted message', async () => {
      // Mark message as deleted
      await Message.findByIdAndUpdate(testMessage._id, { isDeleted: true });

      const updateData = {
        content: 'Updated message content'
      };

      const response = await request(app)
        .put(`/message/${testMessage._id}`)
        .set('user-id', testUser1._id.toString())
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Cannot edit deleted message');
    });
  });

  describe('DELETE /message/:id', () => {
    let testMessage;

    beforeEach(async () => {
      testMessage = await Message.create({
        content: 'Message to delete',
        messageType: 'text',
        sender: testUser1._id,
        chat: testChat._id
      });
    });

    it('should delete message by sender', async () => {
      const response = await request(app)
        .delete(`/message/${testMessage._id}`)
        .set('user-id', testUser1._id.toString())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Message deleted successfully');

      // Verify message is marked as deleted in database
      const deletedMessage = await Message.findById(testMessage._id);
      expect(deletedMessage.isDeleted).toBe(true);
      expect(deletedMessage.content).toBe('This message has been deleted');
    });

    it('should reject delete by non-sender', async () => {
      const response = await request(app)
        .delete(`/message/${testMessage._id}`)
        .set('user-id', testUser2._id.toString())
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('You can only delete your own messages');
    });

    it('should reject delete of non-existent message', async () => {
      const response = await request(app)
        .delete('/message/507f1f77bcf86cd799439999')
        .set('user-id', testUser1._id.toString())
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Message not found');
    });

    it('should reject delete of already deleted message', async () => {
      // Mark message as deleted first
      await Message.findByIdAndUpdate(testMessage._id, { 
        isDeleted: true,
        content: 'This message has been deleted'
      });

      const response = await request(app)
        .delete(`/message/${testMessage._id}`)
        .set('user-id', testUser1._id.toString())
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Message is already deleted');
    });

    it('should allow admin to delete any message', async () => {
      // Create admin user
      const adminUser = await User.create({
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439020'),
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        fullName: 'Admin User',
        age: 17,
        role: 'admin',
        isVerified: true
      });

      // Mock admin middleware
      const mockAdminMiddleware = (req, res, next) => {
        req.user = { 
          id: adminUser._id.toString(),
          role: 'admin'
        };
        next();
      };

      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use(mockAdminMiddleware);
      adminApp.delete('/message/:id', deleteMessage);

      const response = await request(adminApp)
        .delete(`/message/${testMessage._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Message deleted successfully');
    });
  });
});
