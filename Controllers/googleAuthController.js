import { auth, isFirebaseConfigured } from '../config/firebase.js';
import User from '../Models/User.js';
import Verification from '../Models/Verification.js';
import emailService from '../services/emailService.js';
import { createSendToken, generateToken } from '../utils/jwt.js';
import { verifyFirebaseToken, handleFirebaseAuth, checkFirebaseConfig } from '../middleware/firebaseAuth.js';

// Google OAuth login/signup through Firebase
export const googleAuth = [
  checkFirebaseConfig,
  verifyFirebaseToken,
  handleFirebaseAuth,
  async (req, res) => {
    try {
      const user = req.user;
      
      // Verify this is specifically a Google sign-in
      if (req.firebaseUser.firebase.sign_in_provider !== 'google.com') {
        return res.status(400).json({
          status: 'fail',
          message: 'This endpoint is specifically for Google authentication'
        });
      }
      
      // Create and send JWT token for our app
      createSendToken(user, user.isNew ? 201 : 200, res);
      
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Something went wrong during Google authentication'
      });
    }
  }
];

// Complete Google user registration (for new users needing additional info)
export const completeGoogleRegistration = async (req, res) => {
  try {
    if (!isFirebaseConfigured || !auth) {
      return res.status(503).json({
        status: 'error',
        message: 'Google OAuth is not configured on this server'
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
    
    // Verify this is a Google sign-in
    if (decodedToken.firebase.sign_in_provider !== 'google.com') {
      return res.status(400).json({
        status: 'fail',
        message: 'This endpoint is specifically for Google authentication'
      });
    }
    
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

    // Determine role based on age
    const userRole = age < 18 ? 'children' : 'user';

    // Generate unique username from Google email
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
      role: userRole,
      parentEmail,
      profilePicture: decodedToken.picture || '',
      authProvider: 'google',
      isVerified: false, // User needs to verify email
      emailVerified: false,
      parentEmailVerified: false,
      verificationStatus: 'pending'
    });

    // Create verification codes and send emails
    const verificationResults = {};
    
    try {
      // Send verification to user email
      const userVerification = await Verification.createVerification(
        newUser.email, 
        'user_email', 
        newUser._id
      );
      
      await emailService.sendVerificationEmail(
        newUser.email, 
        userVerification.code, 
        newUser.fullName || newUser.username
      );
      
      verificationResults.userEmail = { success: true };
    } catch (emailError) {
      console.error('Error sending user verification email:', emailError);
      verificationResults.userEmail = { success: false, error: emailError.message };
    }

    // Send verification to parent email if user is a child
    if (newUser.parentEmail && newUser.age < 13) {
      try {
        const parentVerification = await Verification.createVerification(
          newUser.parentEmail, 
          'parent_email', 
          newUser._id
        );
        
        await emailService.sendParentVerificationEmail(
          newUser.parentEmail, 
          newUser.fullName || newUser.username,
          newUser.email,
          parentVerification.code
        );
        
        verificationResults.parentEmail = { success: true };
      } catch (emailError) {
        console.error('Error sending parent verification email:', emailError);
        verificationResults.parentEmail = { success: false, error: emailError.message };
      }
    }

    // Send success response with token and verification info
    res.status(201).json({
      status: 'success',
      message: 'User created successfully. Please check your email for verification codes.',
      token: generateToken(newUser._id),
      data: {
        user: newUser.getPublicProfile(),
        verificationResults,
        requiresVerification: true,
        requiresParentVerification: !!(newUser.parentEmail && newUser.age < 13)
      }
    });

  } catch (error) {
    console.error('Google registration error:', error);
    
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
      message: 'Something went wrong during Google registration'
    });
  }
};

// Link Google account to existing local account
export const linkGoogleAccount = async (req, res) => {
  try {
    if (!isFirebaseConfigured || !auth) {
      return res.status(503).json({
        status: 'error',
        message: 'Google OAuth is not configured on this server'
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

    // Verify this is a Google sign-in
    if (decodedToken.firebase.sign_in_provider !== 'google.com') {
      return res.status(400).json({
        status: 'fail',
        message: 'This endpoint is specifically for Google authentication'
      });
    }

    // Check if Google account is already linked to another user
    const existingGoogleUser = await User.findOne({ firebaseUid: decodedToken.uid });
    if (existingGoogleUser && existingGoogleUser.id !== userId) {
      return res.status(400).json({
        status: 'fail',
        message: 'This Google account is already linked to another user'
      });
    }

    // Check if email matches
    const currentUser = await User.findById(userId);
    if (currentUser.email !== decodedToken.email) {
      return res.status(400).json({
        status: 'fail',
        message: 'Google account email must match your current account email'
      });
    }

    // Link Google account to current user
    currentUser.firebaseUid = decodedToken.uid;
    currentUser.authProvider = 'google';
    if (decodedToken.picture && !currentUser.profilePicture) {
      currentUser.profilePicture = decodedToken.picture;
    }

    await currentUser.save({ validateBeforeSave: false });

    res.status(200).json({
      status: 'success',
      message: 'Google account linked successfully',
      data: {
        user: currentUser.getPublicProfile()
      }
    });

  } catch (error) {
    console.error('Google linking error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while linking Google account'
    });
  }
};

// Unlink Google account
export const unlinkGoogleAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user.firebaseUid || user.authProvider !== 'google') {
      return res.status(400).json({
        status: 'fail',
        message: 'No Google account is linked to this user'
      });
    }

    // Check if user has a password (can't unlink if it's the only auth method)
    if (!user.password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot unlink Google account. Please set a password first.'
      });
    }

    // Unlink Google account
    user.firebaseUid = undefined;
    user.authProvider = 'local';
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      status: 'success',
      message: 'Google account unlinked successfully',
      data: {
        user: user.getPublicProfile()
      }
    });

  } catch (error) {
    console.error('Google unlinking error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while unlinking Google account'
    });
  }
};

// Get Google user info from Firebase token
export const getGoogleUserInfo = async (req, res) => {
  try {
    const { firebaseIdToken } = req.body;

    if (!firebaseIdToken) {
      return res.status(400).json({
        status: 'fail',
        message: 'Firebase ID token is required'
      });
    }

    // Verify Firebase token
    const decodedToken = await auth.verifyIdToken(firebaseIdToken);

    // Verify this is a Google sign-in
    if (decodedToken.firebase.sign_in_provider !== 'google.com') {
      return res.status(400).json({
        status: 'fail',
        message: 'This endpoint is specifically for Google authentication'
      });
    }

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
        googleUser: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name,
          picture: decodedToken.picture,
          provider: 'google.com',
          emailVerified: decodedToken.email_verified
        },
        existsInSystem: !!existingUser,
        needsAdditionalInfo: !existingUser
      }
    });

  } catch (error) {
    console.error('Google user info error:', error);
    res.status(401).json({
      status: 'fail',
      message: 'Invalid Firebase ID token'
    });
  }
};
