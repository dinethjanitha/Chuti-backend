import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    unique: true,
    sparse: true // Allow null values but enforce uniqueness when present
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [20, 'Username cannot exceed 20 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() {
      return !this.firebaseUid; // Password not required for Firebase users
    },
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false // Don't include password in queries by default
  },
  fullName: {
    type: String,
    required: false, // Make optional since we're using username primarily
    trim: true,
    maxlength: [50, 'Full name cannot exceed 50 characters']
  },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [5, 'Age must be at least 5'],
    max: [17, 'Age cannot exceed 17']
  },
  parentEmail: {
    type: String,
    required: function() {
      return this.age < 13; // Only required for children under 13
    },
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid parent email']
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  parentEmailVerified: {
    type: Boolean,
    default: false
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'partial', 'complete'],
    default: 'pending'
  },
  profilePicture: {
    type: String,
    default: ''
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  presenceStatus: {
    type: String,
    enum: ['online', 'away', 'busy', 'offline'],
    default: 'offline'
  },
  role: {
    type: String,
    enum: ['children', 'user', 'moderator', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ firebaseUid: 1 });

// Hash password before saving (only for local auth)
userSchema.pre('save', async function(next) {
  // Skip password hashing for Firebase users or if password hasn't been modified
  if (!this.password || !this.isModified('password') || this.firebaseUid) {
    return next();
  }

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method (only for local auth)
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    // Skip password comparison for Firebase users
    if (this.firebaseUid) {
      throw new Error('Password comparison not available for OAuth users');
    }
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Method to get public user data (without sensitive info)
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    fullName: this.fullName,
    age: this.age,
    parentEmail: this.parentEmail,
    profilePicture: this.profilePicture,
    isOnline: this.isOnline,
    lastSeen: this.lastSeen,
    role: this.role,
    authProvider: this.authProvider,
    isVerified: this.isVerified,
    emailVerified: this.emailVerified,
    parentEmailVerified: this.parentEmailVerified,
    verificationStatus: this.verificationStatus,
    createdAt: this.createdAt
  };
};

const User = mongoose.model('User', userSchema);

export default User;
