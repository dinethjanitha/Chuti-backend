import { auth, isFirebaseConfigured } from '../config/firebase.js';
import User from '../Models/User.js';
import { createSendToken } from '../utils/jwt.js';

// Check if Firebase is configured
export const checkFirebaseConfig = (req, res, next) => {
  if (!isFirebaseConfigured) {
    return res.status(503).json({
      status: 'error',
      message: 'Firebase OAuth is not configured on this server'
    });
  }
  next();
};

// Verify Firebase ID token
export const verifyFirebaseToken = async (req, res, next) => {
  try {
    if (!auth) {
      return res.status(503).json({
        status: 'error',
        message: 'Firebase authentication is not available'
      });
    }

    let idToken;

    // Check for Firebase ID token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      idToken = req.headers.authorization.split(' ')[1];
    }

    if (!idToken) {
      return res.status(401).json({
        status: 'fail',
        message: 'No Firebase ID token provided'
      });
    }

    // Verify the Firebase ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    req.firebaseUser = decodedToken;
    
    next();
  } catch (error) {
    console.error('Firebase token verification error:', error.message);
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid Firebase ID token'
    });
  }
};

// Create or get user from Firebase authentication
export const handleFirebaseAuth = async (req, res, next) => {
  try {
    const { firebaseUser } = req;
    const { additionalUserInfo } = req.body; // Additional info for child safety

    // Check if user already exists in our database
    let user = await User.findOne({ 
      $or: [
        { email: firebaseUser.email },
        { firebaseUid: firebaseUser.uid }
      ]
    });

    if (user) {
      // Update Firebase UID if not set
      if (!user.firebaseUid) {
        user.firebaseUid = firebaseUser.uid;
        await user.save({ validateBeforeSave: false });
      }

      // Update online status
      user.isOnline = true;
      user.lastSeen = new Date();
      await user.save({ validateBeforeSave: false });

      req.user = user;
      return next();
    }

    // For new users, we need additional information for child safety
    if (!additionalUserInfo) {
      return res.status(400).json({
        status: 'fail',
        message: 'Additional user information required for child safety',
        required: ['age', 'parentEmail', 'fullName'],
        firebaseUser: {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.name,
          picture: firebaseUser.picture
        }
      });
    }

    const { age, parentEmail, fullName } = additionalUserInfo;

    // Validate required fields for child safety
    if (!age || !parentEmail || !fullName) {
      return res.status(400).json({
        status: 'fail',
        message: 'Age, parent email, and full name are required for child safety'
      });
    }

    // Validate age for child safety
    if (age < 5 || age > 17) {
      return res.status(400).json({
        status: 'fail',
        message: 'This app is designed for children aged 5-17'
      });
    }

    // Generate username from email or name
    let username = firebaseUser.email?.split('@')[0] || 
                   firebaseUser.name?.replace(/\s+/g, '_').toLowerCase() ||
                   `user_${Date.now()}`;
    
    // Ensure username is unique
    let usernameExists = await User.findOne({ username });
    let counter = 1;
    while (usernameExists) {
      username = `${username}_${counter}`;
      usernameExists = await User.findOne({ username });
      counter++;
    }

    // Create new user in our database
    const newUser = await User.create({
      firebaseUid: firebaseUser.uid,
      username,
      email: firebaseUser.email,
      fullName: fullName || firebaseUser.name,
      age,
      parentEmail,
      profilePicture: firebaseUser.picture || '',
      isVerified: false, // Still requires verification for child safety
      authProvider: firebaseUser.firebase.sign_in_provider || 'firebase'
    });

    req.user = newUser;
    next();

  } catch (error) {
    console.error('Firebase auth handling error:', error.message);
    
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
      message: 'Something went wrong during Firebase authentication'
    });
  }
};
