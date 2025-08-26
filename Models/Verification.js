import mongoose from 'mongoose';

const verificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    length: 6
  },
  type: {
    type: String,
    enum: ['user_email', 'parent_email'],
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now
  },
  verified: {
    type: Boolean,
    default: false
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5 // Maximum 5 attempts
  }
}, {
  timestamps: true
});

// Index for automatic cleanup of expired documents
verificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for faster queries
verificationSchema.index({ email: 1, type: 1 });
verificationSchema.index({ userId: 1 });

// Method to check if verification is expired
verificationSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Method to check if verification is valid
verificationSchema.methods.isValid = function() {
  return !this.verified && !this.isExpired() && this.attempts < 5;
};

// Static method to create verification
verificationSchema.statics.createVerification = async function(email, type, userId) {
  // Remove any existing verification for this email and type
  await this.deleteMany({ email, type, userId });
  
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Create new verification
  const verification = new this({
    email,
    code,
    type,
    userId
  });
  
  return await verification.save();
};

// Static method to verify code
verificationSchema.statics.verifyCode = async function(email, code, type, userId) {
  const verification = await this.findOne({
    email,
    type,
    userId,
    verified: false
  });
  
  if (!verification) {
    throw new Error('Verification code not found');
  }
  
  if (verification.isExpired()) {
    throw new Error('Verification code has expired');
  }
  
  if (verification.attempts >= 5) {
    throw new Error('Too many failed attempts. Please request a new code');
  }
  
  // Increment attempt count
  verification.attempts += 1;
  await verification.save();
  
  if (verification.code !== code) {
    throw new Error('Invalid verification code');
  }
  
  // Mark as verified
  verification.verified = true;
  await verification.save();
  
  return verification;
};

// Static method to resend verification
verificationSchema.statics.resendVerification = async function(email, type, userId) {
  // Check if there's a recent verification (within 2 minutes)
  const recentVerification = await this.findOne({
    email,
    type,
    userId,
    createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) }
  });
  
  if (recentVerification) {
    throw new Error('Please wait 2 minutes before requesting a new code');
  }
  
  return await this.createVerification(email, type, userId);
};

const Verification = mongoose.model('Verification', verificationSchema);

export default Verification;
