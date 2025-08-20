import User from '../Models/User.js';
import { createSendToken, generateToken, verifyToken } from '../utils/jwt.js';

// Register new user
export const signup = async (req, res) => {
  try {
    const { username, email, password, fullName, age, parentEmail } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        status: 'fail',
        message: 'User already exists with this email or username'
      });
    }

    // Validate age for child safety
    if (age < 5 || age > 17) {
      return res.status(400).json({
        status: 'fail',
        message: 'This app is designed for children aged 5-17'
      });
    }

    // Create new user
    const newUser = await User.create({
      username,
      email,
      password,
      fullName: fullName || username, // Use username as fullName if not provided
      age,
      parentEmail: age < 13 ? parentEmail : undefined // Only set parentEmail for children under 13
    });

    // Send success response with token
    createSendToken(newUser, 201, res);

  } catch (error) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation Error',
        errors
      });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        status: 'fail',
        message: `${field} already exists`
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during registration'
    });
  }
};

// Login user
export const login = async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    // Check if email/username and password exist
    if (!emailOrUsername || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide email/username and password'
      });
    }

    // Find user by email or username and include password
    const user = await User.findOne({
      $or: [
        { email: emailOrUsername.toLowerCase() },
        { username: emailOrUsername }
      ]
    }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect email/username or password'
      });
    }

    // Update user status
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save({ validateBeforeSave: false });

    // Send token
    createSendToken(user, 200, res);

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during login'
    });
  }
};

// Logout user
export const logout = async (req, res) => {
  try {
    // Update user status if authenticated
    if (req.user) {
      req.user.isOnline = false;
      req.user.lastSeen = new Date();
      await req.user.save({ validateBeforeSave: false });
    }

    // Clear cookies
    res.cookie('jwt', 'loggedout', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true
    });

    res.cookie('refreshToken', 'loggedout', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true
    });

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during logout'
    });
  }
};

// Get current user
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      status: 'success',
      data: {
        user: user.getPublicProfile()
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while fetching user data'
    });
  }
};

// Update current user
export const updateMe = async (req, res) => {
  try {
    // Fields that can be updated
    const allowedFields = ['fullName', 'profilePicture'];
    const updates = {};

    // Filter allowed fields
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'No valid fields to update'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser.getPublicProfile()
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while updating user data'
    });
  }
};

// Change password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide current password, new password, and confirm password'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        status: 'fail',
        message: 'New password and confirm password do not match'
      });
    }

    // Get user with password
    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Send new token
    createSendToken(user, 200, res);

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while changing password'
    });
  }
};

// Refresh token
export const refreshToken = async (req, res) => {
  try {
    let refreshToken;

    if (req.cookies.refreshToken) {
      refreshToken = req.cookies.refreshToken;
    }

    if (!refreshToken) {
      return res.status(401).json({
        status: 'fail',
        message: 'No refresh token provided'
      });
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken);
    
    // Check if user still exists
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'User no longer exists'
      });
    }

    // Generate new tokens
    createSendToken(user, 200, res);

  } catch (error) {
    res.status(401).json({
      status: 'fail',
      message: 'Invalid refresh token'
    });
  }
};
