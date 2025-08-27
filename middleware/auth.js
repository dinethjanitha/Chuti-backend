import { verifyToken } from '../utils/jwt.js';
import User from '../Models/User.js';

// Protect middleware - check if user is authenticated
export const protect = async (req, res, next) => {
  try {
    let token;

    // Check if token exists in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
      // Check if token exists in cookies
      token = req.cookies.jwt;
    }

    if (!token) {
      return res.status(401).json({
        status: 'fail',
        message: 'You are not logged in! Please log in to get access.'
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Check if user still exists
    const currentUser = await User.findById(decoded.userId);
    if (!currentUser) {
      return res.status(401).json({
        status: 'fail',
        message: 'The user belonging to this token no longer exists.'
      });
    }

    // Grant access to protected route
    req.user = currentUser;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid token. Please log in again.'
    });
  }
};

// Restrict to certain roles
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};

// Check if user is verified (for child safety)
export const requireVerification = (req, res, next) => {
  if (!req.user.isVerified) {
    return res.status(403).json({
      status: 'fail',
      message: 'Your account needs to be verified by a parent/guardian before you can access this feature.'
    });
  }
  next();
};

// Age restriction middleware
export const requireMinAge = (minAge) => {
  return (req, res, next) => {
    if (req.user.age < minAge) {
      return res.status(403).json({
        status: 'fail',
        message: `You must be at least ${minAge} years old to access this feature.`
      });
    }
    next();
  };
};

// Admin only middleware - check if user is an admin
export const adminOnly = async (req, res, next) => {
  try {
    let token;

    // Check if token exists in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        status: 'fail',
        message: 'Access denied. Admin token required.'
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Check if user still exists and is an admin
    const currentUser = await User.findById(decoded.userId);
    if (!currentUser) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid admin token.'
      });
    }

    // Check if user has admin role
    if (currentUser.role !== 'admin') {
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied. Admin privileges required.'
      });
    }

    // Grant access to admin route
    req.user = currentUser;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid admin token.'
    });
  }
};
