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

    const user = await User.findByIdAndUpdate(req.user.id, updateData, { new: true }).select('-password');
    sendResponse(res, 200, 'Bank details updated', user);
  } catch (error) {
    next(error);
  }
};

// Upload avatar
exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 400, 'No image file provided');
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: req.file.path },
      { new: true }
    ).select('-password');

    if (!user) return sendError(res, 404, 'User not found');

    sendResponse(res, 200, 'Avatar updated successfully', {
      avatar: user.avatar,
    });
  } catch (error) {
    next(error);
  }
};

// Delete account (soft delete)
exports.deleteAccount = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    if (!user) return sendError(res, 404, 'User not found');

    sendResponse(res, 200, 'Account deleted successfully');
  } catch (error) {
    next(error);
  }
};

// ── Address Book CRUD ──

exports.listAddresses = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id, 'addresses').lean();
    sendResponse(res, 200, 'Addresses fetched', user?.addresses || []);
  } catch (error) {
    next(error);
  }
};

exports.addAddress = async (req, res, next) => {
  try {
    const { label, full, lat, lng, isDefault } = req.body;
    if (!full) return sendError(res, 400, 'Address is required');

    const user = await User.findById(req.user.id);
    if (!user) return sendError(res, 404, 'User not found');

    if (user.addresses.length >= 10) {
      return sendError(res, 400, 'Maximum 10 addresses allowed');
    }

    // If marking as default, unset others
    if (isDefault) {
      user.addresses.forEach((a) => { a.isDefault = false; });
    }

    user.addresses.push({ label: label || 'Home', full, lat: lat || 0, lng: lng || 0, isDefault: !!isDefault });
    await user.save({ validateModifiedOnly: true });

    sendResponse(res, 201, 'Address added', user.addresses);
  } catch (error) {
    next(error);
  }
};

exports.updateAddress = async (req, res, next) => {
  try {
    const { label, full, lat, lng, isDefault } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return sendError(res, 404, 'User not found');

    const addr = user.addresses.id(req.params.addressId);
    if (!addr) return sendError(res, 404, 'Address not found');

    if (label !== undefined) addr.label = label;
    if (full !== undefined) addr.full = full;
    if (lat !== undefined) addr.lat = lat;
    if (lng !== undefined) addr.lng = lng;
    if (isDefault) {
      user.addresses.forEach((a) => { a.isDefault = false; });
      addr.isDefault = true;
    }

    await user.save({ validateModifiedOnly: true });
    sendResponse(res, 200, 'Address updated', user.addresses);
  } catch (error) {
    next(error);
  }
};

exports.deleteAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return sendError(res, 404, 'User not found');

    const addr = user.addresses.id(req.params.addressId);
    if (!addr) return sendError(res, 404, 'Address not found');

    addr.deleteOne();
    await user.save({ validateModifiedOnly: true });

    sendResponse(res, 200, 'Address removed', user.addresses);
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
