import express from 'express';
import User from '../Models/User.js';
import { protect, restrictTo, requireVerification, requireMinAge } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Get all users (for admin/moderator)
router.get('/', restrictTo('admin', 'moderator'), async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users: users.map(user => user.getPublicProfile())
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while fetching users'
    });
  }
});

// Get online users (requires verification)
router.get('/online', requireVerification, async (req, res) => {
  try {
    const onlineUsers = await User.find({ 
      isOnline: true,
      _id: { $ne: req.user.id } // Exclude current user
    }).select('username fullName profilePicture lastSeen');

    res.status(200).json({
      status: 'success',
      results: onlineUsers.length,
      data: {
        users: onlineUsers.map(user => user.getPublicProfile())
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while fetching online users'
    });
  }
});

// Search users (requires verification)
router.get('/search', requireVerification, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({
        status: 'fail',
        message: 'Search query is required'
      });
    }

    const searchUsers = await User.find({
      $and: [
        { _id: { $ne: req.user.id } }, // Exclude current user
        {
          $or: [
            { username: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } }
          ] 
        }
      ]
    })
    .select('username email profilePicture isOnline lastSeen')
    .limit(20);

    res.status(200).json({
      status: 'success',
      results: searchUsers.length,
      data: {
        users: searchUsers.map(user => user.getPublicProfile())
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while searching users'
    });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: user.getPublicProfile()
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while fetching user'
    });
  }
});

// Update user verification status (admin only)
router.patch('/:id/verify', restrictTo('admin'), async (req, res) => {
  try {
    const { isVerified } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isVerified },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: user.getPublicProfile()
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while updating verification status'
    });
  }
});

// Delete user (admin only)
router.delete('/:id', restrictTo('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while deleting user'
    });
  }
});

export default router;
