import User from '../Models/User.js';
import Verification from '../Models/Verification.js';
import emailService from '../services/emailService.js';

// Send verification codes to user and parent email
export const sendVerificationCodes = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        status: 'fail',
        message: 'User ID is required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    // Check if user is already fully verified
    if (user.verificationStatus === 'complete') {
      return res.status(400).json({
        status: 'fail',
        message: 'User is already fully verified'
      });
    }

    const results = {};

    try {
      // Send verification to user email
      const userVerification = await Verification.createVerification(
        user.email, 
        'user_email', 
        user._id
      );
      
      await emailService.sendVerificationEmail(
        user.email, 
        userVerification.code, 
        user.fullName || user.username
      );
      
      results.userEmail = { success: true, email: user.email };
    } catch (error) {
      console.error('Error sending user verification:', error);
      results.userEmail = { success: false, error: error.message };
    }

    // Send verification to parent email if user is a child
    if (user.parentEmail && user.age < 13) {
      try {
        const parentVerification = await Verification.createVerification(
          user.parentEmail, 
          'parent_email', 
          user._id
        );
        
        await emailService.sendParentVerificationEmail(
          user.parentEmail, 
          user.fullName || user.username,
          user.email,
          parentVerification.code
        );
        
        results.parentEmail = { success: true, email: user.parentEmail };
      } catch (error) {
        console.error('Error sending parent verification:', error);
        results.parentEmail = { success: false, error: error.message };
      }
    }

    // Check if at least one email was sent successfully
    const hasSuccess = Object.values(results).some(result => result.success);
    
    if (!hasSuccess) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to send verification emails',
        details: results
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Verification codes sent',
      data: {
        results,
        requiresParentVerification: !!(user.parentEmail && user.age < 13)
      }
    });

  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while sending verification codes'
    });
  }
};

// Verify email code
export const verifyEmail = async (req, res) => {
  try {
    const { userId, email, code, type } = req.body;

    if (!userId || !email || !code || !type) {
      return res.status(400).json({
        status: 'fail',
        message: 'User ID, email, code, and type are required'
      });
    }

    if (!['user_email', 'parent_email'].includes(type)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid verification type'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    // Verify the code
    await Verification.verifyCode(email, code, type, userId);

    // Update user verification status
    if (type === 'user_email') {
      user.emailVerified = true;
    } else if (type === 'parent_email') {
      user.parentEmailVerified = true;
    }

    // Check overall verification status
    const needsParentVerification = user.parentEmail && user.age < 13;
    if (needsParentVerification) {
      // Child needs both email and parent email verified
      if (user.emailVerified && user.parentEmailVerified) {
        user.verificationStatus = 'complete';
        user.isVerified = true;
      } else if (user.emailVerified || user.parentEmailVerified) {
        user.verificationStatus = 'partial';
      }
    } else {
      // Only user email verification needed
      if (user.emailVerified) {
        user.verificationStatus = 'complete';
        user.isVerified = true;
      }
    }

    await user.save();

    // Send welcome email if fully verified
    if (user.verificationStatus === 'complete') {
      try {
        await emailService.sendWelcomeEmail(
          user.email,
          user.fullName || user.username,
          user.username
        );
      } catch (emailError) {
        console.error('Error sending welcome email:', emailError);
        // Don't fail the verification if welcome email fails
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Email verified successfully',
      data: {
        user: user.getPublicProfile(),
        verificationComplete: user.verificationStatus === 'complete'
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    
    if (error.message.includes('not found') || 
        error.message.includes('expired') || 
        error.message.includes('Invalid') ||
        error.message.includes('Too many')) {
      return res.status(400).json({
        status: 'fail',
        message: error.message
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during email verification'
    });
  }
};

// Resend verification code
export const resendVerificationCode = async (req, res) => {
  try {
    const { userId, email, type } = req.body;

    if (!userId || !email || !type) {
      return res.status(400).json({
        status: 'fail',
        message: 'User ID, email, and type are required'
      });
    }

    if (!['user_email', 'parent_email'].includes(type)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid verification type'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    // Create new verification
    const verification = await Verification.resendVerification(email, type, userId);

    // Send email based on type
    if (type === 'user_email') {
      await emailService.sendVerificationEmail(
        email, 
        verification.code, 
        user.fullName || user.username
      );
    } else {
      await emailService.sendParentVerificationEmail(
        email, 
        user.fullName || user.username,
        user.email,
        verification.code
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Verification code resent successfully'
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    
    if (error.message.includes('wait')) {
      return res.status(429).json({
        status: 'fail',
        message: error.message
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while resending verification code'
    });
  }
};

// Get verification status
export const getVerificationStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    const needsParentVerification = user.parentEmail && user.age < 13;
    
    res.status(200).json({
      status: 'success',
      data: {
        emailVerified: user.emailVerified,
        parentEmailVerified: user.parentEmailVerified,
        verificationStatus: user.verificationStatus,
        isFullyVerified: user.isVerified,
        needsParentVerification,
        userEmail: user.email,
        parentEmail: user.parentEmail
      }
    });

  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong while fetching verification status'
    });
  }
};
