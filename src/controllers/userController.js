const User = require('../models/User');
const Partner = require('../models/Partner');
const Notification = require('../models/Notification');
const { sendResponse, sendError } = require('../utils/response');

// Update user location
exports.updateLocation = async (req, res, next) => {
  try {
    const { lat, lng, city, address } = req.body;

    if (!lat || !lng) {
      return sendError(res, 400, 'Latitude and longitude are required');
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        city: city || '',
        address: { full: address || '', lat, lng },
        location: { type: 'Point', coordinates: [lng, lat] },
      },
      { new: true }
    ).select('-password');

    sendResponse(res, 200, 'Location updated', {
      city: user.city,
      address: user.address,
    });
  } catch (error) {
    next(error);
  }
};

// Update user profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;

    // Check if email/phone already taken by another user
    if (email || phone) {
      const conflict = await User.findOne({
        _id: { $ne: req.user.id },
        $or: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      });
      if (conflict) {
        return sendError(res, 400, 'Email or phone already in use by another account');
      }
    }

    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (phone) updates.phone = phone;

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    if (!user) return sendError(res, 404, 'User not found');

    sendResponse(res, 200, 'Profile updated successfully', {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      city: user.city,
      address: user.address,
    });
  } catch (error) {
    next(error);
  }
};

// Get user notifications
exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({
      $or: [
        { targetType: 'user', targetId: req.user.id },
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
    await User.findByIdAndUpdate(req.user.id, { fcmToken: pushToken || '' });
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

// Check service availability in a city
exports.checkAvailability = async (req, res, next) => {
  try {
    const { city } = req.query;

    if (!city) {
      return sendError(res, 400, 'City is required');
    }

    const partnerCount = await Partner.countDocuments({
      city: { $regex: new RegExp(`^${city.trim()}$`, 'i') },
      status: 'approved',
      isActive: true,
    });

    sendResponse(res, 200, 'Availability checked', {
      available: partnerCount > 0,
      city,
    });
  } catch (error) {
    next(error);
  }
};
