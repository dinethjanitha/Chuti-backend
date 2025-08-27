import User from '../Models/User.js';
import Chat from '../Models/Chat.js';
import Message from '../Models/Message.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Admin login
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user with admin or moderator role
    const user = await User.findOne({ 
      email: email.toLowerCase(),
      role: { $in: ['admin', 'moderator'] },
      isActive: true
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or insufficient privileges'
      });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate admin token
    const token = jwt.sign(
      { 
        userId: user._id, 
        role: user.role,
        type: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          fullName: user.fullName,
          role: user.role
        }
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all users with pagination
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build search query
    const searchQuery = {};
    if (search) {
      searchQuery.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) {
      searchQuery.role = role;
    }

    const users = await User.find(searchQuery)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalUsers / parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

// Get user by ID
export const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's chat count and message count
    const chatCount = await Chat.countDocuments({
      'participants.user': userId,
      isActive: true
    });

    const messageCount = await Message.countDocuments({
      sender: userId,
      isDeleted: false
    });

    res.status(200).json({
      success: true,
      data: {
        user,
        stats: {
          chatCount,
          messageCount
        }
      }
    });

  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // Remove sensitive fields that shouldn't be updated via admin
    delete updates.password;
    delete updates._id;
    delete updates.__v;

    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
};

// Ban user
export const banUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Ban reason is required'
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        isBanned: true,
        banReason: reason,
        bannedAt: new Date(),
        bannedBy: req.user.userId
      },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User banned successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to ban user'
    });
  }
};

// Unban user
export const unbanUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        isBanned: false,
        $unset: { banReason: 1, bannedAt: 1, bannedBy: 1 }
      },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User unbanned successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unban user'
    });
  }
};

// Delete user (soft delete)
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // First check if user exists
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Soft delete by setting isActive to false and adding deletion info
    const user = await User.findByIdAndUpdate(
      userId,
      { 
        isActive: false,
        deletedAt: new Date(),
        deletedBy: req.user.userId
      },
      { new: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

// Get analytics data
export const getAnalytics = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ isActive: true });
    const verifiedUsers = await User.countDocuments({ isActive: true, isVerified: true });
    const bannedUsers = await User.countDocuments({ isBanned: true });
    const totalChats = await Chat.countDocuments({ isActive: true });
    const totalMessages = await Message.countDocuments({ isDeleted: false });
    
    // Get flagged messages count (assuming you have a flagged field)
    const flaggedMessages = await Message.countDocuments({ 
      isDeleted: false, 
      flagged: true 
    });

    // Get total incidents (banned users + flagged messages)
    const totalIncidents = bannedUsers + flaggedMessages;

    // Get users registered in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsersLast30Days = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
      isActive: true
    });

    // Get messages sent today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const messagesToday = await Message.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow },
      isDeleted: false
    });

    // Get user registration trend (last 7 days)
    const userTrend = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await User.countDocuments({
        createdAt: { $gte: date, $lt: nextDate }
      });

      userTrend.push({
        date: date.toISOString().split('T')[0],
        count
      });
    }

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalUsers,
          verifiedUsers,
          bannedUsers,
          totalMessages,
          flaggedMessages,
          totalIncidents,
          totalChats,
          newUsersLast30Days,
          messagesToday
        },
        trends: {
          userRegistrations: userTrend
        }
      }
    });

  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
};

// Get user message count
export const getUserMessageCount = async (req, res) => {
  try {
    const { userId } = req.params;
    const messageCount = await Message.countDocuments({ sender: userId, isDeleted: false });
    res.status(200).json({
      success: true,
      data: { userId, messageCount }
    });
  } catch (error) {
    console.error('Get user message count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user message count'
    });
  }
};
