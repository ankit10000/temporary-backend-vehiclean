const mongoose = require('mongoose');
const Partner = require('../models/Partner');
const Booking = require('../models/Booking');
const Withdrawal = require('../models/Withdrawal');
const Notification = require('../models/Notification');
const { sendResponse, sendError } = require('../utils/response');
const { withTransaction } = require('../utils/transaction');

// Toggle online/offline
exports.toggleStatus = async (req, res, next) => {
  try {
    const partner = await Partner.findById(req.user.id);
    if (!partner) return sendError(res, 404, 'Partner not found');

    if (partner.status !== 'approved') {
      return sendError(res, 403, 'Your account is not approved yet');
    }

    partner.isOnline = req.body.isOnline !== undefined ? req.body.isOnline : !partner.isOnline;
    await partner.save();

    sendResponse(res, 200, `You are now ${partner.isOnline ? 'online' : 'offline'}`, {
      isOnline: partner.isOnline,
    });
  } catch (error) {
    next(error);
  }
};

// Update working hours
exports.updateWorkingHours = async (req, res, next) => {
  try {
    const { start, end } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      req.user.id,
      { workingHours: { start, end } },
      { new: true }
    ).select('-password');

    sendResponse(res, 200, 'Working hours updated', partner);
  } catch (error) {
    next(error);
  }
};

// Update service radius
exports.updateRadius = async (req, res, next) => {
  try {
    const { radius } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      req.user.id,
      { serviceRadius: radius },
      { new: true }
    ).select('-password');

    sendResponse(res, 200, 'Service radius updated', partner);
  } catch (error) {
    next(error);
  }
};

// Update location
exports.updateLocation = async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      req.user.id,
      { location: { type: 'Point', coordinates: [lng, lat] } },
      { new: true }
    ).select('-password');

    sendResponse(res, 200, 'Location updated', partner);
  } catch (error) {
    next(error);
  }
};

// Update profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, city } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (city) updateData.city = city;

    const partner = await Partner.findByIdAndUpdate(req.user.id, updateData, { new: true }).select('-password');
    sendResponse(res, 200, 'Profile updated', partner);
  } catch (error) {
    next(error);
  }
};

// Update bank / UPI details
exports.updateBankDetails = async (req, res, next) => {
  try {
    const { accountHolder, accountNumber, ifscCode, bankName, upiId } = req.body;
    const updateData = {};
    if (accountHolder || accountNumber || ifscCode || bankName) {
      updateData.bankDetails = {
        accountHolder: accountHolder || '',
        accountNumber: accountNumber || '',
        ifscCode: ifscCode || '',
        bankName: bankName || '',
      };
    }
    if (upiId !== undefined) updateData.upiId = upiId;

    const partner = await Partner.findByIdAndUpdate(req.user.id, updateData, { new: true }).select('-password');
    sendResponse(res, 200, 'Bank details updated', partner);
  } catch (error) {
    next(error);
  }
};

// Upload documents
const VALID_DOC_TYPES = ['aadhaar', 'pan', 'bankDetails', 'photo', 'drivingLicense'];

exports.uploadDocuments = async (req, res, next) => {
  try {
    const partner = await Partner.findById(req.user.id);
    if (!partner) return sendError(res, 404, 'Partner not found');

    if (partner.kycStatus === 'submitted') {
      return sendError(res, 400, 'Documents are under review. You cannot upload while review is in progress.');
    }

    // Ensure all document subdocs have valid status (handles old flat-string data)
    const validStatuses = ['not_uploaded', 'uploaded', 'approved', 'rejected'];
    for (const docType of VALID_DOC_TYPES) {
      const doc = partner.documents?.[docType];
      if (!doc || !validStatuses.includes(doc.status)) {
        const url = (typeof doc === 'string' ? doc : doc?.url) || '';
        partner.documents[docType] = {
          url,
          status: url ? 'uploaded' : 'not_uploaded',
          rejectionReason: '',
        };
      }
    }

    // Apply new uploads
    if (req.files) {
      for (const file of req.files) {
        if (VALID_DOC_TYPES.includes(file.fieldname)) {
          partner.documents[file.fieldname] = {
            url: file.path,
            status: 'uploaded',
            rejectionReason: '',
          };
        }
      }
    }

    await partner.save();
    const updated = await Partner.findById(req.user.id).select('-password');
    sendResponse(res, 200, 'Documents uploaded', updated);
  } catch (error) {
    next(error);
  }
};

// Submit KYC for review
exports.submitKYC = async (req, res, next) => {
  try {
    const partner = await Partner.findById(req.user.id);
    if (!partner) return sendError(res, 404, 'Partner not found');

    if (partner.kycStatus === 'submitted') {
      return sendError(res, 400, 'KYC is already submitted for review');
    }

    // Check all 5 documents are uploaded
    for (const docType of VALID_DOC_TYPES) {
      const doc = partner.documents?.[docType];
      if (!doc || doc.status === 'not_uploaded') {
        return sendError(res, 400, `Please upload ${docType} before submitting`);
      }
    }

    partner.kycStatus = 'submitted';
    await partner.save();

    sendResponse(res, 200, 'KYC submitted for review', partner);
  } catch (error) {
    next(error);
  }
};

// Get earnings dashboard (legacy — still used by DashboardScreen)
exports.getEarnings = async (req, res, next) => {
  try {
    const partner = await Partner.findById(req.user.id).select('totalEarnings walletBalance commission');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayEarnings = await Booking.aggregate([
      {
        $match: {
          partnerId: partner._id,
          status: 'completed',
          completedAt: { $gte: today },
        },
      },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]);

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const weeklyEarnings = await Booking.aggregate([
      {
        $match: {
          partnerId: partner._id,
          status: 'completed',
          completedAt: { $gte: weekStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]);

    const totalJobs = await Booking.countDocuments({
      partnerId: partner._id,
      status: 'completed',
    });

    sendResponse(res, 200, 'Earnings fetched', {
      totalEarnings: partner.totalEarnings,
      walletBalance: partner.walletBalance,
      commission: partner.commission,
      todayEarnings: todayEarnings[0]?.total || 0,
      weeklyEarnings: weeklyEarnings[0]?.total || 0,
      totalJobs,
    });
  } catch (error) {
    next(error);
  }
};

// Unified earnings summary — replaces 4 separate calls from EarningsScreen
exports.getEarningsSummary = async (req, res, next) => {
  try {
    const partnerId = new mongoose.Types.ObjectId(req.user.id);
    const partner = await Partner.findById(req.user.id).select('totalEarnings walletBalance commission');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    // Single aggregation for both today and weekly earnings
    const [earningsAgg, withdrawals] = await Promise.all([
      Booking.aggregate([
        { $match: { partnerId, status: 'completed', completedAt: { $exists: true } } },
        {
          $group: {
            _id: null,
            todayEarnings: {
              $sum: { $cond: [{ $gte: ['$completedAt', today] }, '$finalAmount', 0] },
            },
            weeklyEarnings: {
              $sum: { $cond: [{ $gte: ['$completedAt', weekStart] }, '$finalAmount', 0] },
            },
          },
        },
      ]),
      Withdrawal.find({ partnerId: req.user.id }).sort('-createdAt').limit(20),
    ]);

    const agg = earningsAgg[0] || {};

    sendResponse(res, 200, 'Earnings summary fetched', {
      totalEarnings: partner.totalEarnings,
      walletBalance: partner.walletBalance,
      commissionRate: partner.commission,
      todayEarnings: agg.todayEarnings || 0,
      weeklyEarnings: agg.weeklyEarnings || 0,
      withdrawals,
    });
  } catch (error) {
    next(error);
  }
};

// Request withdrawal — atomic balance deduction to prevent overdraw
exports.requestWithdrawal = async (req, res, next) => {
  try {
    const { amount } = req.body;

    // Atomic: only deduct if balance is sufficient (prevents concurrent overdraw)
    const partner = await Partner.findOneAndUpdate(
      { _id: req.user.id, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount } },
      { new: true }
    );

    if (!partner) {
      return sendError(res, 400, 'Insufficient balance');
    }

    const withdrawal = await Withdrawal.create({ partnerId: req.user.id, amount });

    sendResponse(res, 201, 'Withdrawal request submitted', withdrawal);
  } catch (error) {
    next(error);
  }
};

// Get withdrawal history
exports.getWithdrawals = async (req, res, next) => {
  try {
    const withdrawals = await Withdrawal.find({ partnerId: req.user.id }).sort('-createdAt');
    sendResponse(res, 200, 'Withdrawals fetched', withdrawals);
  } catch (error) {
    next(error);
  }
};

// Get partner notifications
exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({
      $or: [
        { targetType: 'partner', targetId: req.user.id },
        { targetType: 'all' },
      ],
    })
      .sort('-createdAt')
      .limit(50)
      .lean();

    sendResponse(res, 200, 'Notifications fetched', notifications);
  } catch (error) {
    next(error);
  }
};

// Save push notification token
exports.savePushToken = async (req, res, next) => {
  try {
    const { pushToken } = req.body;
    await Partner.findByIdAndUpdate(req.user.id, { fcmToken: pushToken || '' });
    sendResponse(res, 200, 'Push token saved');
  } catch (error) {
    next(error);
  }
};

// Mark notification as read
exports.markNotificationRead = async (req, res, next) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );
    if (!notification) return sendError(res, 404, 'Notification not found');
    sendResponse(res, 200, 'Marked as read', notification);
  } catch (error) {
    next(error);
  }
};
