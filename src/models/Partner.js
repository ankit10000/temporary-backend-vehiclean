const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const partnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      unique: true,
      trim: true,
    },
    password: { type: String, required: [true, 'Password is required'], minlength: 6 },
    avatar: { type: String, default: '' },
    documents: {
      aadhaar: {
        url: { type: String, default: '' },
        status: { type: String, enum: ['not_uploaded', 'uploaded', 'approved', 'rejected'], default: 'not_uploaded' },
        rejectionReason: { type: String, default: '' },
      },
      pan: {
        url: { type: String, default: '' },
        status: { type: String, enum: ['not_uploaded', 'uploaded', 'approved', 'rejected'], default: 'not_uploaded' },
        rejectionReason: { type: String, default: '' },
      },
      bankDetails: {
        url: { type: String, default: '' },
        status: { type: String, enum: ['not_uploaded', 'uploaded', 'approved', 'rejected'], default: 'not_uploaded' },
        rejectionReason: { type: String, default: '' },
      },
      photo: {
        url: { type: String, default: '' },
        status: { type: String, enum: ['not_uploaded', 'uploaded', 'approved', 'rejected'], default: 'not_uploaded' },
        rejectionReason: { type: String, default: '' },
      },
      drivingLicense: {
        url: { type: String, default: '' },
        status: { type: String, enum: ['not_uploaded', 'uploaded', 'approved', 'rejected'], default: 'not_uploaded' },
        rejectionReason: { type: String, default: '' },
      },
    },
    kycStatus: {
      type: String,
      enum: ['not_submitted', 'submitted', 'verified', 'rejected'],
      default: 'not_submitted',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
    },
    isActive: { type: Boolean, default: true },
    isOnline: { type: Boolean, default: false },
    commission: { type: Number, default: 20, min: 0, max: 100 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    serviceRadius: { type: Number, default: 10 },
    workingHours: {
      start: { type: String, default: '08:00' },
      end: { type: String, default: '20:00' },
    },
    city: { type: String, default: '' },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    totalBookings: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
    bankDetails: {
      accountHolder: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      bankName: { type: String, default: '' },
    },
    upiId: { type: String, default: '' },
    minBookings: { type: Number, default: 0 },
    maxBookings: { type: Number, default: 10 },
    fcmToken: { type: String, default: '' },
    resetOtp: { type: String },
    resetOtpExpires: { type: Date },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

partnerSchema.index({ location: '2dsphere' });
partnerSchema.index({ status: 1, isActive: 1, isOnline: 1 }); // Partner search/assignment
partnerSchema.index({ city: 1, status: 1 });                   // City-based assignment fallback
partnerSchema.index({ kycStatus: 1 });                          // KYC filtering
partnerSchema.index({ isDeleted: 1, createdAt: -1 });           // Admin listing

partnerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

partnerSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Partner', partnerSchema);
