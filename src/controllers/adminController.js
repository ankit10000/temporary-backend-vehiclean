const User = require('../models/User');
const Partner = require('../models/Partner');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Service = require('../models/Service');
const PromoCode = require('../models/PromoCode');
const Banner = require('../models/Banner');
const Withdrawal = require('../models/Withdrawal');
const Notification = require('../models/Notification');
const TimeSlot = require('../models/TimeSlot');
const Settings = require('../models/Settings');
const { sendResponse, sendError } = require('../utils/response');
const { sendNotification } = require('../utils/notification');
const { sendPushNotification, sendPushToMany } = require('../utils/pushNotification');
const { clearAssignmentTimeout, startAssignmentTimeout } = require('../utils/assignmentTimeout');

// Dashboard Stats
exports.getDashboardStats = async (req, res, next) => {
  try {
    const [totalUsers, totalPartners, totalBookings, totalRevenue] = await Promise.all([
      User.countDocuments(),
      Partner.countDocuments(),
      Booking.countDocuments(),
      Booking.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$finalAmount' } } },
      ]),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayBookings = await Booking.countDocuments({ createdAt: { $gte: today } });

    const pendingPartners = await Partner.countDocuments({ status: 'pending' });
    const activeBookings = await Booking.countDocuments({
      status: { $in: ['pending', 'assigned', 'accepted', 'started', 'in_progress'] },
    });

    sendResponse(res, 200, 'Dashboard stats', {
      totalUsers,
      totalPartners,
      totalBookings,
      totalRevenue: totalRevenue[0]?.total || 0,
      todayBookings,
      pendingPartners,
      activeBookings,
    });
  } catch (error) {
    next(error);
  }
};

// User Management
exports.getUsers = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('-password')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await User.countDocuments(filter);

    sendResponse(res, 200, 'Users fetched', { users, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

exports.toggleBlockUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, 404, 'User not found');
    user.isBlocked = !user.isBlocked;
    await user.save();
    sendResponse(res, 200, `User ${user.isBlocked ? 'blocked' : 'unblocked'}`, user);
  } catch (error) {
    next(error);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, {
      isDeleted: true,
      deletedAt: new Date(),
      isBlocked: true,
    }, { new: true });
    if (!user) return sendError(res, 404, 'User not found');
    sendResponse(res, 200, 'User deleted');
  } catch (error) {
    next(error);
  }
};

// Partner Management
exports.getPartners = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) filter.status = status;

    const partners = await Partner.find(filter)
      .select('-password')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Partner.countDocuments(filter);

    sendResponse(res, 200, 'Partners fetched', { partners, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

exports.getPartnerById = async (req, res, next) => {
  try {
    const partner = await Partner.findById(req.params.id).select('-password');
    if (!partner) return sendError(res, 404, 'Partner not found');

    const bookings = await Booking.countDocuments({ partnerId: partner._id });
    const earnings = await Booking.aggregate([
      { $match: { partnerId: partner._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } },
    ]);

    sendResponse(res, 200, 'Partner fetched', {
      ...partner.toObject(),
      totalBookings: bookings,
      totalEarningsFromBookings: earnings[0]?.total || 0,
    });
  } catch (error) {
    next(error);
  }
};

exports.updatePartnerStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const partner = await Partner.findByIdAndUpdate(req.params.id, { status }, { new: true }).select('-password');
    if (!partner) return sendError(res, 404, 'Partner not found');
    sendResponse(res, 200, `Partner ${status}`, partner);
  } catch (error) {
    next(error);
  }
};

exports.updatePartnerCommission = async (req, res, next) => {
  try {
    const { commission } = req.body;
    const partner = await Partner.findByIdAndUpdate(req.params.id, { commission }, { new: true }).select('-password');
    if (!partner) return sendError(res, 404, 'Partner not found');
    sendResponse(res, 200, 'Commission updated', partner);
  } catch (error) {
    next(error);
  }
};

exports.updatePartnerBookingLimits = async (req, res, next) => {
  try {
    const { minBookings, maxBookings } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      req.params.id,
      { minBookings, maxBookings },
      { new: true }
    ).select('-password');
    if (!partner) return sendError(res, 404, 'Partner not found');
    sendResponse(res, 200, 'Booking limits updated', partner);
  } catch (error) {
    next(error);
  }
};

// KYC Document Verification
const VALID_DOC_TYPES = ['aadhaar', 'pan', 'bankDetails', 'photo', 'drivingLicense'];

exports.verifyPartnerDocument = async (req, res, next) => {
  try {
    const { id, docType } = req.params;
    const { status, rejectionReason } = req.body;

    if (!VALID_DOC_TYPES.includes(docType)) {
      return sendError(res, 400, 'Invalid document type');
    }

    const partner = await Partner.findById(id);
    if (!partner) return sendError(res, 404, 'Partner not found');

    const doc = partner.documents?.[docType];
    if (!doc || doc.status === 'not_uploaded') {
      return sendError(res, 400, `${docType} has not been uploaded yet`);
    }

    partner.documents[docType].status = status;
    partner.documents[docType].rejectionReason = status === 'rejected' ? rejectionReason : '';

    // Auto-calculate kycStatus
    const allDocs = VALID_DOC_TYPES.map((t) => partner.documents[t]);
    const allApproved = allDocs.every((d) => d.status === 'approved');
    const anyRejected = allDocs.some((d) => d.status === 'rejected');

    if (allApproved) {
      partner.kycStatus = 'verified';
      partner.status = 'approved';
    } else if (anyRejected) {
      partner.kycStatus = 'rejected';
    }
    // else stays 'submitted'

    await partner.save();
    sendResponse(res, 200, `Document ${status}`, partner);
  } catch (error) {
    next(error);
  }
};

// Service Management
exports.createService = async (req, res, next) => {
  try {
    const service = await Service.create(req.body);
    sendResponse(res, 201, 'Service created', service);
  } catch (error) {
    next(error);
  }
};

exports.getAllServices = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const services = await Service.find().sort('-createdAt').skip(skip).limit(limit);
    const total = await Service.countDocuments();

    sendResponse(res, 200, 'Services fetched', {
      services,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateService = async (req, res, next) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!service) return sendError(res, 404, 'Service not found');
    sendResponse(res, 200, 'Service updated', service);
  } catch (error) {
    next(error);
  }
};

exports.deleteService = async (req, res, next) => {
  try {
    await Service.findByIdAndDelete(req.params.id);
    sendResponse(res, 200, 'Service deleted');
  } catch (error) {
    next(error);
  }
};

// Promo Code Management
exports.createPromo = async (req, res, next) => {
  try {
    const promo = await PromoCode.create(req.body);
    sendResponse(res, 201, 'Promo code created', promo);
  } catch (error) {
    next(error);
  }
};

exports.getPromos = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const promos = await PromoCode.find().sort('-createdAt').skip(skip).limit(limit);
    const total = await PromoCode.countDocuments();

    sendResponse(res, 200, 'Promo codes fetched', {
      promos,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

exports.updatePromo = async (req, res, next) => {
  try {
    const promo = await PromoCode.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!promo) return sendError(res, 404, 'Promo not found');
    sendResponse(res, 200, 'Promo updated', promo);
  } catch (error) {
    next(error);
  }
};

exports.deletePromo = async (req, res, next) => {
  try {
    await PromoCode.findByIdAndDelete(req.params.id);
    sendResponse(res, 200, 'Promo deleted');
  } catch (error) {
    next(error);
  }
};

// Banner Management
exports.createBanner = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) data.image = req.file.path;
    const banner = await Banner.create(data);
    sendResponse(res, 201, 'Banner created', banner);
  } catch (error) {
    next(error);
  }
};

exports.getBanners = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const banners = await Banner.find().populate('serviceId', 'name price duration category').sort('-createdAt').skip(skip).limit(limit);
    const total = await Banner.countDocuments();

    sendResponse(res, 200, 'Banners fetched', {
      banners,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateBanner = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) data.image = req.file.path;
    const banner = await Banner.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!banner) return sendError(res, 404, 'Banner not found');
    sendResponse(res, 200, 'Banner updated', banner);
  } catch (error) {
    next(error);
  }
};

exports.deleteBanner = async (req, res, next) => {
  try {
    await Banner.findByIdAndDelete(req.params.id);
    sendResponse(res, 200, 'Banner deleted');
  } catch (error) {
    next(error);
  }
};

// Booking Management
exports.getAllBookings = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const bookings = await Booking.find(filter)
      .populate('userId', 'name phone email')
      .populate('partnerId', 'name phone')
      .populate('serviceId', 'name price')
      .populate('carId', 'make model registrationNo')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await Booking.countDocuments(filter);

    sendResponse(res, 200, 'Bookings fetched', { bookings, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

exports.assignPartner = async (req, res, next) => {
  try {
    const { partnerId } = req.body;

    // Clear any existing assignment timeout
    clearAssignmentTimeout(req.params.id);

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { partnerId, status: 'assigned', assignedAt: new Date() },
      { new: true }
    );
    if (!booking) return sendError(res, 404, 'Booking not found');

    // Start new assignment timeout
    startAssignmentTimeout(req.app, booking._id);

    // Notify user about partner assignment
    const partner = await Partner.findById(partnerId, 'name');
    sendNotification(req, {
      title: 'Partner Assigned',
      body: `${partner?.name || 'A partner'} has been assigned to your booking.`,
      type: 'partner_assigned',
      targetType: 'user',
      targetId: booking.userId.toString(),
    });

    // Notify partner about new assignment
    sendNotification(req, {
      title: 'New Booking Assigned',
      body: 'Admin has assigned a new booking to you.',
      type: 'new_booking',
      targetType: 'partner',
      targetId: partnerId.toString(),
    });

    sendResponse(res, 200, 'Partner assigned', booking);
  } catch (error) {
    next(error);
  }
};

exports.adminCancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return sendError(res, 404, 'Booking not found');

    booking.status = 'cancelled';
    booking.cancelledBy = 'admin';
    booking.cancelReason = req.body.reason || 'Cancelled by admin';
    // Company-side cancel = full refund
    if (booking.paymentStatus === 'paid') {
      booking.paymentStatus = 'refunded';
    }
    await booking.save();

    sendResponse(res, 200, 'Booking cancelled', booking);
  } catch (error) {
    next(error);
  }
};

// Payment Management
exports.getAllPayments = async (req, res, next) => {
  try {
    const { method, status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (method) filter.method = method;
    if (status) filter.status = status;

    const payments = await Payment.find(filter)
      .populate('bookingId')
      .populate('userId', 'name phone email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Payment.countDocuments(filter);

    sendResponse(res, 200, 'Payments fetched', { payments, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

// Withdrawal Management
exports.getWithdrawals = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const withdrawals = await Withdrawal.find(filter)
      .populate('partnerId', 'name phone email bankDetails upiId')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Withdrawal.countDocuments(filter);

    sendResponse(res, 200, 'Withdrawals fetched', { withdrawals, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

exports.updateWithdrawal = async (req, res, next) => {
  try {
    const { status, transactionId, rejectionReason } = req.body;
    const update = { status };
    if (transactionId) update.transactionId = transactionId;
    if (rejectionReason) update.rejectionReason = rejectionReason;

    const withdrawal = await Withdrawal.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!withdrawal) return sendError(res, 404, 'Withdrawal not found');

    // If rejected, refund the balance
    if (status === 'rejected') {
      await Partner.findByIdAndUpdate(withdrawal.partnerId, {
        $inc: { walletBalance: withdrawal.amount },
      });
    }

    sendResponse(res, 200, 'Withdrawal updated', withdrawal);
  } catch (error) {
    next(error);
  }
};

// Notification
exports.sendNotification = async (req, res, next) => {
  try {
    const notification = await Notification.create(req.body);

    // Send push notification to target
    const { title, body, targetType, targetId } = req.body;
    if (targetType === 'all') {
      // Send push in batches to avoid loading 50K+ tokens into memory
      const BATCH_SIZE = 500;
      const pushData = { title, body, data: { type: 'admin_notification' } };

      for (const Model of [User, Partner]) {
        let skip = 0;
        let batch;
        do {
          batch = await Model.find({ fcmToken: { $ne: '' } }, 'fcmToken')
            .skip(skip)
            .limit(BATCH_SIZE)
            .lean();
          const tokens = batch.map((u) => u.fcmToken).filter(Boolean);
          if (tokens.length > 0) {
            sendPushToMany(tokens, pushData);
          }
          skip += BATCH_SIZE;
        } while (batch.length === BATCH_SIZE);
      }
    } else if (targetId) {
      const Model = targetType === 'partner' ? Partner : User;
      const target = await Model.findById(targetId, 'fcmToken');
      if (target?.fcmToken) {
        sendPushNotification(target.fcmToken, { title, body, data: { type: 'admin_notification' } });
      }
    }

    sendResponse(res, 201, 'Notification sent', notification);
  } catch (error) {
    next(error);
  }
};

exports.getNotifications = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find().sort('-createdAt').skip(skip).limit(limit).lean();
    const total = await Notification.countDocuments();

    sendResponse(res, 200, 'Notifications fetched', {
      notifications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

// Time Slot Management
exports.getSlots = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const filter = {};
    let dateStart, dateEnd;
    if (month && year) {
      dateStart = new Date(year, month - 1, 1);
      dateEnd = new Date(year, month, 0, 23, 59, 59, 999);
      filter.date = { $gte: dateStart, $lte: dateEnd };
    }

    const slots = await TimeSlot.find(filter).sort('date').lean();

    // Aggregate actual booking counts from Booking collection for the date range
    const bookingMatch = { status: { $nin: ['cancelled'] } };
    if (dateStart && dateEnd) {
      bookingMatch.slotDate = { $gte: dateStart, $lte: dateEnd };
    }

    const bookingCounts = await Booking.aggregate([
      { $match: bookingMatch },
      { $group: { _id: { date: '$slotDate', time: '$slotTime' }, count: { $sum: 1 } } },
    ]);

    // Build lookup: "YYYY-MM-DD|HH:MM" -> count
    const countMap = {};
    const datesWithBookings = new Set();
    for (const b of bookingCounts) {
      const dateKey = new Date(b._id.date).toISOString().split('T')[0];
      countMap[`${dateKey}|${b._id.time}`] = b.count;
      datesWithBookings.add(dateKey);
    }

    // Build lookup of existing TimeSlot dates
    const existingDates = new Set();
    for (const slot of slots) {
      existingDates.add(new Date(slot.date).toISOString().split('T')[0]);
    }

    // Generate default slot entries for dates that have bookings but no TimeSlot doc
    for (const dateKey of datesWithBookings) {
      if (!existingDates.has(dateKey)) {
        const defaultSlotEntries = [];
        for (let h = 8; h <= 19; h++) {
          const time = `${h.toString().padStart(2, '0')}:00`;
          defaultSlotEntries.push({
            time,
            maxBookings: 5,
            currentBookings: countMap[`${dateKey}|${time}`] || 0,
            isBlocked: false,
          });
        }
        slots.push({
          _id: null,
          date: new Date(dateKey),
          slots: defaultSlotEntries,
          isHoliday: false,
          holidayReason: '',
        });
      }
    }

    // Merge actual counts into existing TimeSlot data
    for (const slot of slots) {
      const dateKey = new Date(slot.date).toISOString().split('T')[0];
      for (const s of slot.slots) {
        s.currentBookings = countMap[`${dateKey}|${s.time}`] || 0;
      }
    }

    // Re-sort after adding generated entries
    slots.sort((a, b) => new Date(a.date) - new Date(b.date));

    sendResponse(res, 200, 'Slots fetched', slots);
  } catch (error) {
    next(error);
  }
};

exports.updateSlot = async (req, res, next) => {
  try {
    const { date, slots, isHoliday, holidayReason } = req.body;
    // Use UTC date range to avoid local-vs-UTC timezone mismatch
    const dayStart = new Date(date + 'T00:00:00.000Z');
    const dayEnd = new Date(date + 'T23:59:59.999Z');

    // Get actual booking counts so admin edits don't overwrite them
    const bookingCounts = await Booking.aggregate([
      {
        $match: {
          slotDate: { $gte: dayStart, $lte: dayEnd },
          status: { $nin: ['cancelled'] },
        },
      },
      {
        $group: {
          _id: '$slotTime',
          count: { $sum: 1 },
        },
      },
    ]);
    const countMap = {};
    for (const b of bookingCounts) {
      countMap[b._id] = b.count;
    }

    // Preserve actual currentBookings
    const slotsWithCounts = slots.map((s) => ({
      ...s,
      currentBookings: countMap[s.time] || 0,
    }));

    const timeSlot = await TimeSlot.findOneAndUpdate(
      { date: { $gte: dayStart, $lte: dayEnd } },
      { date: dayStart, slots: slotsWithCounts, isHoliday, holidayReason },
      { new: true, upsert: true }
    );

    sendResponse(res, 200, 'Slot updated', timeSlot);
  } catch (error) {
    next(error);
  }
};

// Settings
exports.getSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    sendResponse(res, 200, 'Settings fetched', settings);
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();
    Object.assign(settings, req.body);
    await settings.save();
    sendResponse(res, 200, 'Settings updated', settings);
  } catch (error) {
    next(error);
  }
};

// Analytics
exports.getAnalytics = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // 30-day booking trend
    const bookingTrend = await Booking.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', count: 1, _id: 0 } },
    ]);

    // Revenue by day (last 30 days)
    const revenueTrend = await Booking.aggregate([
      { $match: { paymentStatus: 'paid', completedAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
          revenue: { $sum: '$finalAmount' },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', revenue: 1, _id: 0 } },
    ]);

    // Status breakdown
    const statusBreakdown = await Booking.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { status: '$_id', count: 1, _id: 0 } },
    ]);

    // Top 5 partners by earnings
    const topPartners = await Partner.find({ isDeleted: { $ne: true } })
      .select('name totalEarnings averageRating totalReviews')
      .sort('-totalEarnings')
      .limit(5)
      .lean();

    sendResponse(res, 200, 'Analytics fetched', {
      bookingTrend,
      revenueTrend,
      statusBreakdown,
      topPartners,
    });
  } catch (error) {
    next(error);
  }
};

// Reviews
const Review = require('../models/Review');

exports.getReviews = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, rating } = req.query;
    const filter = {};
    if (rating) filter.rating = Number(rating);

    const reviews = await Review.find(filter)
      .populate('userId', 'name email')
      .populate('partnerId', 'name email')
      .populate('bookingId', 'slotDate slotTime')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Review.countDocuments(filter);

    sendResponse(res, 200, 'Reviews fetched', {
      reviews,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return sendError(res, 404, 'Review not found');

    // Recalculate partner average rating
    const stats = await Review.aggregate([
      { $match: { partnerId: review.partnerId } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    const Partner = require('../models/Partner');
    if (stats.length > 0) {
      await Partner.findByIdAndUpdate(review.partnerId, {
        averageRating: Math.round(stats[0].avg * 10) / 10,
        totalReviews: stats[0].count,
      });
    } else {
      await Partner.findByIdAndUpdate(review.partnerId, {
        averageRating: 0,
        totalReviews: 0,
      });
    }

    sendResponse(res, 200, 'Review deleted');
  } catch (error) {
    next(error);
  }
};
