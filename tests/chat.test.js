import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { createGroupChat, getUserChats, getChatDetails, addParticipants, removeParticipant } from '../Controllers/chatController.js';
import Chat from '../Models/Chat.js';
import User from '../Models/User.js';
import { verifyToken } from '../utils/jwt.js';

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
app.post('/chat/group', createGroupChat);
app.get('/chat/', getUserChats);
app.get('/chat/:id', getChatDetails);
app.post('/chat/:id/participants', addParticipants);
app.delete('/chat/:id/participants/:userId', removeParticipant);

describe('Chat Controller', () => {
  let testUser1, testUser2, testUser3;

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

    testUser3 = await User.create({
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439013'),
      username: 'testuser3',
      email: 'test3@example.com',
      password: 'password123',
      fullName: 'Test User 3',
      age: 14,
      role: 'children',
      isVerified: true
    });
  });

  describe('POST /chat/group', () => {
    it('should create a new group chat with valid data', async () => {
      const chatData = {
        name: 'Test Group',
        description: 'A test group chat',
        participants: [testUser2._id.toString(), testUser3._id.toString()],
        chatType: 'group'
      };

      const response = await request(app)
        .post('/chat/group')
        .set('user-id', testUser1._id.toString())
        .send(chatData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Group chat created successfully');
      expect(response.body.data.chat.name).toBe(chatData.name);
      expect(response.body.data.chat.description).toBe(chatData.description);
      expect(response.body.data.chat.chatType).toBe('group');
      expect(response.body.data.chat.participants).toHaveLength(3); // Creator + 2 participants

      // Verify chat was created in database
      const chatInDb = await Chat.findById(response.body.data.chat._id);
      expect(chatInDb).toBeTruthy();
      expect(chatInDb.participants).toContainEqual(testUser1._id);
      expect(chatInDb.participants).toContainEqual(testUser2._id);
      expect(chatInDb.participants).toContainEqual(testUser3._id);
    });

    it('should reject chat without name', async () => {
      const chatData = {
        description: 'A test group chat',
        participants: [testUser2._id.toString()]
      };

      const response = await request(app)
        .post('/chat/group')
        .set('user-id', testUser1._id.toString())
        .send(chatData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Chat name is required');
    });

    it('should reject chat with empty name', async () => {
      const chatData = {
        name: '   ',
        description: 'A test group chat',
        participants: [testUser2._id.toString()]
      };

      const response = await request(app)
        .post('/chat/group')
        .set('user-id', testUser1._id.toString())
        .send(chatData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Chat name is required');
    });

    it('should reject chat with invalid participants', async () => {
      const chatData = {
        name: 'Test Group',
        participants: ['507f1f77bcf86cd799439999'] // Non-existent user
      };

      const response = await request(app)
        .post('/chat/group')
        .set('user-id', testUser1._id.toString())
        .send(chatData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Some participants are invalid');
    });

    it('should automatically include creator in participants', async () => {
      const chatData = {
        name: 'Test Group',
        participants: [testUser2._id.toString()]
      };

      const response = await request(app)
        .post('/chat/group')
        .set('user-id', testUser1._id.toString())
        .send(chatData)
        .expect(201);

      expect(response.body.data.chat.participants).toContainEqual(
        expect.objectContaining({ _id: testUser1._id.toString() })
      );
    });

    it('should handle duplicate participants', async () => {
      const chatData = {
        name: 'Test Group',
        participants: [
          testUser2._id.toString(),
          testUser2._id.toString(), // Duplicate
          testUser3._id.toString()
        ]
      };

      const response = await request(app)
        .post('/chat/group')
        .set('user-id', testUser1._id.toString())
        .send(chatData)
        .expect(201);

      // Should only have 3 participants (creator + 2 unique participants)
      expect(response.body.data.chat.participants).toHaveLength(3);
    });
  });

  describe('GET /chat/', () => {
    let testChat1, testChat2;

    beforeEach(async () => {
      // Create test chats
      testChat1 = await Chat.create({
        name: 'Test Chat 1',
        chatType: 'group',
        participants: [
          { user: testUser1._id, role: 'admin' },
          { user: testUser2._id, role: 'member' }
        ],
        createdBy: testUser1._id,
        isActive: true
      });

      testChat2 = await Chat.create({
        name: 'Test Chat 2',
        chatType: 'group',
        participants: [
          { user: testUser1._id, role: 'admin' },
          { user: testUser3._id, role: 'member' }
        ],
        createdBy: testUser1._id,
        isActive: true
      });

      // Create a chat where user1 is not a participant
      await Chat.create({
        name: 'Other Chat',
        chatType: 'group',
        participants: [
          { user: testUser2._id, role: 'admin' },
          { user: testUser3._id, role: 'member' }
        ],
        createdBy: testUser2._id,
        isActive: true
      });
    });

    it('should return user chats', async () => {
      const response = await request(app)
        .get('/chat/')
        .set('user-id', testUser1._id.toString())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Chats retrieved successfully');
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].name).toBe('Test Chat 2'); // Most recent first
      expect(response.body.data[1].name).toBe('Test Chat 1');
    });

    it('should return empty array for user with no chats', async () => {
      // Create a new user with no chats
      const newUser = await User.create({
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439020'),
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
        fullName: 'New User',
        age: 12,
        parentEmail: 'newparent@example.com',
        role: 'children',
        isVerified: true
      });

      const response = await request(app)
        .get('/chat/')
        .set('user-id', newUser._id.toString())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/chat/?page=1&limit=1')
        .set('user-id', testUser1._id.toString())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(1);
      expect(response.body.pagination.total).toBe(2);
    });
  });

  describe('GET /chat/:id', () => {
    let testChat;

    beforeEach(async () => {
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

    it('should return chat details for participant', async () => {
      const response = await request(app)
        .get(`/chat/${testChat._id}`)
        .set('user-id', testUser1._id.toString())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.chat._id).toBe(testChat._id.toString());
      expect(response.body.data.chat.name).toBe('Test Chat');
    });

    it('should reject non-participant access', async () => {
      const response = await request(app)
        .get(`/chat/${testChat._id}`)
        .set('user-id', testUser3._id.toString())
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Access denied. You are not a participant in this chat.');
    });

    it('should reject invalid chat ID', async () => {
      const response = await request(app)
        .get('/chat/507f1f77bcf86cd799439999')
        .set('user-id', testUser1._id.toString())
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Chat not found');
    });
  });

  describe('POST /chat/:id/participants', () => {
    let testChat;

    beforeEach(async () => {
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

    it('should add participant to chat', async () => {
      const response = await request(app)
        .post(`/chat/${testChat._id}/participants`)
        .set('user-id', testUser1._id.toString())
        .send({ userId: testUser3._id.toString() })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Participant added successfully');

      // Verify participant was added
      const updatedChat = await Chat.findById(testChat._id);
      expect(updatedChat.participants).toContainEqual(testUser3._id);
    });

    it('should reject adding existing participant', async () => {
      const response = await request(app)
        .post(`/chat/${testChat._id}/participants`)
        .set('user-id', testUser1._id.toString())
        .send({ userId: testUser2._id.toString() })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User is already a participant');
    });

    it('should reject non-participant trying to add users', async () => {
      const response = await request(app)
        .post(`/chat/${testChat._id}/participants`)
        .set('user-id', testUser3._id.toString())
        .send({ userId: testUser3._id.toString() })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Access denied. You are not a participant in this chat.');
    });

    it('should reject adding invalid user', async () => {
      const response = await request(app)
        .post(`/chat/${testChat._id}/participants`)
        .set('user-id', testUser1._id.toString())
        .send({ userId: '507f1f77bcf86cd799439999' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User not found');
    });
  });

  describe('DELETE /chat/:id/participants/:userId', () => {
    let testChat;

    beforeEach(async () => {
      testChat = await Chat.create({
        name: 'Test Chat',
        chatType: 'group',
        participants: [
          { user: testUser1._id, role: 'admin' },
          { user: testUser2._id, role: 'member' },
          { user: testUser3._id, role: 'member' }
        ],
        createdBy: testUser1._id,
        isActive: true
      });
    });

    it('should remove participant from chat', async () => {
      const response = await request(app)
        .delete(`/chat/${testChat._id}/participants/${testUser3._id}`)
        .set('user-id', testUser1._id.toString())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Participant removed successfully');

      // Verify participant was removed
      const updatedChat = await Chat.findById(testChat._id);
      expect(updatedChat.participants).not.toContainEqual(testUser3._id);
    });

    it('should allow users to remove themselves', async () => {
      const response = await request(app)
        .delete(`/chat/${testChat._id}/participants/${testUser2._id}`)
        .set('user-id', testUser2._id.toString())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Participant removed successfully');
    });

    it('should reject removing non-existent participant', async () => {
      // First remove the participant
      await Chat.findByIdAndUpdate(testChat._id, {
        $pull: { participants: testUser3._id }
      });

      const response = await request(app)
        .delete(`/chat/${testChat._id}/participants/${testUser3._id}`)
        .set('user-id', testUser1._id.toString())
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User is not a participant in this chat');
    });

    it('should reject unauthorized removal', async () => {
      // testUser3 trying to remove testUser2 (not allowed)
      const response = await request(app)
        .delete(`/chat/${testChat._id}/participants/${testUser2._id}`)
        .set('user-id', testUser3._id.toString())
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('You can only remove yourself from the chat');
    });
  });
});
