import { auth, isFirebaseConfigured } from '../config/firebase.js';
import User from '../Models/User.js';
import { createSendToken } from '../utils/jwt.js';
import { verifyFirebaseToken, handleFirebaseAuth, checkFirebaseConfig } from '../middleware/firebaseAuth.js';

// Firebase OAuth login/signup
export const firebaseAuth = [
  checkFirebaseConfig,
  verifyFirebaseToken,
  handleFirebaseAuth,
  async (req, res) => {
    try {
      const user = req.user;
      
      // Create and send JWT token for our app
      createSendToken(user, user.isNew ? 201 : 200, res);
      
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Something went wrong during Firebase authentication'
      });
    }
  }
];

// Complete Firebase user registration (for new users needing additional info)
export const completeFirebaseRegistration = async (req, res) => {
  try {
    if (!isFirebaseConfigured || !auth) {
      return res.status(503).json({
        status: 'error',
        message: 'Firebase OAuth is not configured on this server'
      });
    }
    const { firebaseIdToken, age, parentEmail, fullName } = req.body;

    if (!firebaseIdToken || !age || !parentEmail || !fullName) {
      return res.status(400).json({
        status: 'fail',
        message: 'Firebase ID token, age, parent email, and full name are required'
      });
    }

    // Verify Firebase token
    const decodedToken = await auth.verifyIdToken(firebaseIdToken);
    
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: decodedToken.email },
        { firebaseUid: decodedToken.uid }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        status: 'fail',
        message: 'User already exists'
      });
    }

    // Validate age for child safety
    if (age < 5 || age > 17) {
      return res.status(400).json({
        status: 'fail',
        message: 'This app is designed for children aged 5-17'
      });
    }

    // Generate unique username
    let username = decodedToken.email?.split('@')[0] || 
                   decodedToken.name?.replace(/\s+/g, '_').toLowerCase() ||
                   `user_${Date.now()}`;
    
    let usernameExists = await User.findOne({ username });
    let counter = 1;
    while (usernameExists) {
      username = `${username}_${counter}`;
      usernameExists = await User.findOne({ username });
      counter++;
    }

    // Create new user
    const newUser = await User.create({
      firebaseUid: decodedToken.uid,
      username,
      email: decodedToken.email,
      fullName,
      age,
      parentEmail,
      profilePicture: decodedToken.picture || '',
      authProvider: decodedToken.firebase.sign_in_provider || 'firebase',
      isVerified: false
    });

    // Send success response with token
    createSendToken(newUser, 201, res);

  } catch (error) {
    console.error('Firebase registration error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation Error',
        errors
      });
    }

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

// Link Firebase account to existing local account
export const linkFirebaseAccount = async (req, res) => {
  try {
    if (!isFirebaseConfigured || !auth) {
      return res.status(503).json({
        status: 'error',
        message: 'Firebase OAuth is not configured on this server'
      });
    }

    const { firebaseIdToken } = req.body;
    const userId = req.user.id;

    if (!firebaseIdToken) {
      return res.status(400).json({
        status: 'fail',
        message: 'Firebase ID token is required'
      });
    }

    // Verify Firebase token
    const decodedToken = await auth.verifyIdToken(firebaseIdToken);

    // Check if Firebase UID is already linked to another account
    const existingFirebaseUser = await User.findOne({ firebaseUid: decodedToken.uid });
    if (existingFirebaseUser && existingFirebaseUser.id !== userId) {
      return res.status(400).json({
        status: 'fail',
        message: 'This Firebase account is already linked to another user'
      });
    }

    // Check if email matches
    const currentUser = await User.findById(userId);
    if (currentUser.email !== decodedToken.email) {
      return res.status(400).json({
        status: 'fail',
        message: 'Firebase account email must match your current account email'
      });
    }

    // Link Firebase UID to current user
    currentUser.firebaseUid = decodedToken.uid;
    currentUser.authProvider = 'firebase';
    if (decodedToken.picture && !currentUser.profilePicture) {
      currentUser.profilePicture = decodedToken.picture;
    }

    await currentUser.save({ validateBeforeSave: false });

    res.status(200).json({
      status: 'success',
      message: 'Firebase account linked successfully',
      data: {
        user: currentUser.getPublicProfile()
      }
    });

  } catch (error) {
    console.error('Firebase linking error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while linking Firebase account'
    });
  }
};

// Unlink Firebase account
export const unlinkFirebaseAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user.firebaseUid) {
      return res.status(400).json({
        status: 'fail',
        message: 'No Firebase account is linked to this user'
      });
    }

    // Check if user has a password (can't unlink if it's the only auth method)
    if (!user.password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot unlink Firebase account. Please set a password first.'
      });
    }

    // Unlink Firebase
    user.firebaseUid = undefined;
    user.authProvider = 'local';
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      status: 'success',
      message: 'Firebase account unlinked successfully',
      data: {
        user: user.getPublicProfile()
      }
    });

  } catch (error) {
    console.error('Firebase unlinking error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while unlinking Firebase account'
    });
  }
};

// Get Firebase user info
export const getFirebaseUserInfo = async (req, res) => {
  try {
    if (!isFirebaseConfigured || !auth) {
      return res.status(503).json({
        status: 'error',
        message: 'Firebase OAuth is not configured on this server'
      });
    }

    const { firebaseIdToken } = req.body;

    if (!firebaseIdToken) {
      return res.status(400).json({
        status: 'fail',
        message: 'Firebase ID token is required'
      });
    }

    // Verify Firebase token
    const decodedToken = await auth.verifyIdToken(firebaseIdToken);

    // Check if user exists in our system
    const existingUser = await User.findOne({
      $or: [
        { email: decodedToken.email },
        { firebaseUid: decodedToken.uid }
      ]
    });

    res.status(200).json({
      status: 'success',
      data: {
        firebaseUser: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name,
          picture: decodedToken.picture,
          provider: decodedToken.firebase.sign_in_provider
        },
        existsInSystem: !!existingUser,
        needsAdditionalInfo: !existingUser
      }
    });

  } catch (error) {
    console.error('Firebase user info error:', error);
    res.status(401).json({
      status: 'fail',
      message: 'Invalid Firebase ID token'
    });
  }
};
