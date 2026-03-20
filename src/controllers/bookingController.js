const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const PromoCode = require('../models/PromoCode');
const TimeSlot = require('../models/TimeSlot');
const Partner = require('../models/Partner');
const { sendResponse, sendError } = require('../utils/response');
const { sendNotification, notifyAllPartners, emitBookingAlert, emitBookingAlertToPartner } = require('../utils/notification');
const { withTransaction } = require('../utils/transaction');
const { assignPartnerAndNotify, cascadeToNextPartner } = require('../utils/partnerAssignment');
const { clearAssignmentTimeout } = require('../utils/assignmentTimeout');

// Get available slots for a date
exports.getAvailableSlots = async (req, res, next) => {
  try {
    const { date } = req.params; // "YYYY-MM-DD"

    // Use date range to avoid local-vs-UTC timezone mismatch
    const dayStart = new Date(date + 'T00:00:00.000Z');
    const dayEnd = new Date(date + 'T23:59:59.999Z');

    let timeSlot = await TimeSlot.findOne({
      date: { $gte: dayStart, $lte: dayEnd },
    }).lean();

    if (!timeSlot) {
      // Generate default slots if none exist
      const defaultSlots = [];
      for (let h = 8; h <= 19; h++) {
        defaultSlots.push({
          time: `${h.toString().padStart(2, '0')}:00`,
          maxBookings: 5,
          currentBookings: 0,
          isBlocked: false,
        });
      }
      timeSlot = { date: dayStart, slots: defaultSlots, isHoliday: false };
    }

    if (timeSlot.isHoliday) {
      return sendResponse(res, 200, 'This date is a holiday', {
        isHoliday: true,
        reason: timeSlot.holidayReason || 'Holiday',
        slots: [],
      });
    }

    // Get actual booking counts from Booking collection for accuracy
    const bookingCounts = await Booking.aggregate([
      {
        $match: {
          slotDate: { $gte: dayStart, $lte: dayEnd },
          status: { $nin: ['cancelled', 'awaiting_payment'] },
        },
      },
      { $group: { _id: '$slotTime', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    for (const b of bookingCounts) {
      countMap[b._id] = b.count;
    }

    // Check if requested date is today — filter out past time slots
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const isToday = date === todayStr;

    // Return ALL slots with status so user app can show full picture
    const allSlots = timeSlot.slots.map((s) => {
      const booked = countMap[s.time] || 0;
      const available = s.isBlocked ? 0 : Math.max(0, s.maxBookings - booked);
      let status = 'available';
      if (s.isBlocked) status = 'blocked';
      else if (booked >= s.maxBookings) status = 'full';

      // If today, mark slots as blocked if less than 1 hour from now
      if (isToday) {
        const [slotH, slotM] = s.time.split(':').map(Number);
        const slotMinutes = slotH * 60 + slotM;
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        if (slotMinutes <= currentMinutes + 60) {
          status = 'blocked';
        }
      }

      return { time: s.time, available: status === 'blocked' ? 0 : available, booked, maxBookings: s.maxBookings, status };
    });

    sendResponse(res, 200, 'Slots fetched', { isHoliday: false, slots: allSlots });
  } catch (error) {
    next(error);
  }
};

// Create booking (with optional transaction for atomicity)
exports.createBooking = async (req, res, next) => {
  try {
    const { carId, serviceId, slotDate, slotTime, paymentMethod, amount, promoCode, address, city, lat, lng } = req.body;

    // Validate: booking not more than 7 days in advance
    const now = new Date();
    const bookingDate = new Date(slotDate.slice(0, 10) + 'T00:00:00');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const maxDate = new Date(todayStart);
    maxDate.setDate(maxDate.getDate() + 7);
    if (bookingDate < todayStart) {
      return sendError(res, 400, 'Cannot book for a past date');
    }
    if (bookingDate >= maxDate) {
      return sendError(res, 400, 'Pre-booking is only allowed for the next 7 days');
    }

    // Validate: booking must be at least 1 hour from now for today
    const todayStr = now.toISOString().split('T')[0];
    if (slotDate.slice(0, 10) === todayStr) {
      const [slotH, slotM] = slotTime.split(':').map(Number);
      const slotMinutes = slotH * 60 + slotM;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      if (slotMinutes <= currentMinutes + 60) {
        return sendError(res, 400, 'Booking must be at least 1 hour from the current time');
      }
    }

    const result = await withTransaction(async (session) => {
      const opts = session ? { session } : {};
      let discount = 0;
      let finalAmount = amount;

      // Apply promo code atomically
      if (promoCode) {
        const promo = await PromoCode.findOneAndUpdate(
          {
            code: promoCode.toUpperCase(),
            isActive: true,
            validFrom: { $lte: new Date() },
            validTo: { $gte: new Date() },
            $or: [{ maxUses: 0 }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }],
            minOrder: { $lte: amount },
          },
          { $inc: { usedCount: 1 } },
          { new: true, ...opts }
        );

        if (promo) {
          if (promo.discountType === 'flat') {
            discount = promo.discountValue;
          } else {
            discount = (amount * promo.discountValue) / 100;
            if (promo.maxDiscount > 0) discount = Math.min(discount, promo.maxDiscount);
          }
          finalAmount = amount - discount;
        }
      }

      // Validate slot availability
      const dayStart = new Date(slotDate.slice(0, 10) + 'T00:00:00.000Z');
      const dayEnd = new Date(slotDate.slice(0, 10) + 'T23:59:59.999Z');

      let timeSlotQuery = TimeSlot.findOne({ date: { $gte: dayStart, $lte: dayEnd } }).lean();
      if (session) timeSlotQuery = timeSlotQuery.session(session);
      const timeSlot = await timeSlotQuery;

      if (timeSlot?.isHoliday) {
        throw Object.assign(new Error('This date is a holiday. Bookings are not available.'), { statusCode: 400 });
      }

      let slotConfig;
      if (timeSlot) {
        slotConfig = timeSlot.slots.find((s) => s.time === slotTime);
      }
      if (!slotConfig) {
        const hour = parseInt(slotTime.split(':')[0], 10);
        if (hour >= 8 && hour <= 19) {
          slotConfig = { time: slotTime, maxBookings: 5, isBlocked: false };
        }
      }

      if (!slotConfig) throw Object.assign(new Error('Invalid time slot'), { statusCode: 400 });
      if (slotConfig.isBlocked) throw Object.assign(new Error('This time slot is blocked'), { statusCode: 400 });

      let countQuery = Booking.countDocuments({
        slotDate: { $gte: dayStart, $lte: dayEnd },
        slotTime,
        status: { $nin: ['cancelled', 'awaiting_payment'] },
      });
      if (session) countQuery = countQuery.session(session);
      const existingCount = await countQuery;

      if (existingCount >= slotConfig.maxBookings) {
        throw Object.assign(new Error('This time slot is fully booked. Please choose another slot.'), { statusCode: 400 });
      }

      const isOnline = paymentMethod === 'online';

      const bookingData = {
        userId: req.user.id,
        carId,
        serviceId,
        slotDate,
        slotTime,
        paymentMethod,
        amount,
        discount,
        finalAmount,
        promoCode: promoCode || '',
        address,
        partnerId: null,
        status: isOnline ? 'awaiting_payment' : 'pending',
      };

      let booking;
      if (session) {
        [booking] = await Booking.create([bookingData], { session });
      } else {
        booking = await Booking.create(bookingData);
      }

      if (!isOnline) {
        await TimeSlot.findOneAndUpdate(
          { date: { $gte: dayStart, $lte: dayEnd }, 'slots.time': slotTime },
          { $inc: { 'slots.$.currentBookings': 1 } },
          opts
        );
      }

      return { booking, isOnline };
    });

    // For online payments: return booking as awaiting_payment, no partner assignment yet
    if (result.isOnline) {
      const populated = await Booking.findById(result.booking._id)
        .populate('carId')
        .populate('serviceId')
        .populate('userId', 'name phone');
      return sendResponse(res, 201, 'Booking created. Complete payment to confirm.', populated);
    }

    // For COD: assign partner and notify
    const populated = await assignPartnerAndNotify(req.app, result.booking._id, { lat, lng, city });

    sendResponse(res, 201, 'Booking created successfully', populated);
  } catch (error) {
    if (error.statusCode) return sendError(res, error.statusCode, error.message);
    next(error);
  }
};

// Get user bookings
exports.getUserBookings = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { userId: req.user.id };
    if (status) filter.status = status;

    const bookings = await Booking.find(filter)
      .populate('carId', 'make model registrationNo color')
      .populate('serviceId', 'name price duration')
      .populate('partnerId', 'name phone avatar')
      .sort('-createdAt')
      .limit(100)
      .lean();

    sendResponse(res, 200, 'Bookings fetched', bookings);
  } catch (error) {
    next(error);
  }
};

// Get booking by ID
exports.getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('carId')
      .populate('serviceId')
      .populate('partnerId', 'name phone avatar')
      .populate('userId', 'name phone');

    if (!booking) return sendError(res, 404, 'Booking not found');
    sendResponse(res, 200, 'Booking fetched', booking);
  } catch (error) {
    next(error);
  }
};

// Cancel booking
exports.cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return sendError(res, 404, 'Booking not found');

    // User can only cancel if partner has not accepted yet
    if (!['awaiting_payment', 'pending', 'assigned'].includes(booking.status)) {
      return sendError(res, 400, 'Cannot cancel booking after partner has accepted');
    }

    clearAssignmentTimeout(booking._id);

    booking.status = 'cancelled';
    booking.cancelReason = req.body.reason || '';
    booking.cancelledBy = req.user.role;
    // Mark refund pending if user had paid (admin will process the actual refund)
    if (booking.paymentStatus === 'paid') {
      booking.paymentStatus = 'refund_pending';
    }
    await booking.save();

    sendResponse(res, 200, 'Booking cancelled successfully', booking);
  } catch (error) {
    next(error);
  }
};

// Partner bookings
exports.getPartnerBookings = async (req, res, next) => {
  try {
    const { status, date } = req.query;
    const partner = await Partner.findById(req.user.id);

    // Show bookings assigned to this partner + unassigned pending bookings (if partner is online)
    const filter = {
      $or: [
        { partnerId: req.user.id },
        ...(partner?.isOnline ? [{ partnerId: null, status: 'pending' }] : []),
      ],
    };
    if (status) filter.status = status;
    if (date) {
      const start = new Date(date + 'T00:00:00.000Z');
      const end = new Date(date + 'T23:59:59.999Z');
      filter.slotDate = { $gte: start, $lte: end };
    }

    const bookings = await Booking.find(filter)
      .populate('carId', 'make model registrationNo color')
      .populate('serviceId', 'name price duration')
      .populate('userId', 'name phone avatar')
      .sort('-createdAt')
      .limit(100)
      .lean();

    sendResponse(res, 200, 'Bookings fetched', bookings);
  } catch (error) {
    next(error);
  }
};

// Partner: Accept/Reject booking (atomic to prevent race conditions)
exports.respondToBooking = async (req, res, next) => {
  try {
    const { action } = req.body; // 'accept' or 'reject'

    if (action === 'accept') {
      // Atomic accept: find booking + check daily limit in one step
      const partnerDoc = await Partner.findById(req.user.id).lean();
      const maxBookings = partnerDoc?.maxBookings ?? 10;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Count current bookings — this is a read, the real guard is the atomic update below
      const todayCount = await Booking.countDocuments({
        _id: { $ne: req.params.id },
        partnerId: partnerDoc._id,
        status: { $nin: ['cancelled', 'awaiting_payment'] },
        slotDate: { $gte: todayStart, $lte: todayEnd },
      });
      if (todayCount >= maxBookings) {
        return sendError(res, 400, 'You have reached your daily booking limit. Contact admin to increase it.');
      }

      // Atomic accept: only succeed if booking is still pending/assigned to this partner
      // findOneAndUpdate is atomic — two concurrent accepts on the same booking: only one wins
      const booking = await Booking.findOneAndUpdate(
        {
          _id: req.params.id,
          $or: [
            { partnerId: req.user.id, status: 'assigned' },
            { partnerId: null, status: 'pending' },
          ],
        },
        { $set: { partnerId: req.user.id, status: 'accepted' } },
        { new: true }
      );

      if (!booking) {
        return sendError(res, 400, 'Booking is no longer available or already taken');
      }

      // Clear assignment timeout since partner accepted
      clearAssignmentTimeout(booking._id);

      // Notify user when partner accepts
      const partner = await Partner.findById(req.user.id, 'name');
      sendNotification(req, {
        title: 'Partner Accepted',
        body: `${partner?.name || 'A partner'} has accepted your booking.`,
        type: 'partner_assigned',
        targetType: 'user',
        targetId: booking.userId.toString(),
      });
      // Dismiss alert overlay on other partners who were alerted (not all clients)
      const io = req.app.get('io');
      if (io) {
        // Emit only to partner rooms, not to user clients
        const onlinePartners = await Partner.find(
          { isOnline: true, _id: { $ne: req.user.id } },
          '_id'
        ).lean();
        for (const p of onlinePartners) {
          io.to(`partner_${p._id}`).emit('booking_alert_cancelled', { bookingId: booking._id });
        }
      }

      return sendResponse(res, 200, 'Booking accepted', booking);
    } else {
      // Reject: add partner to rejectedBy and cascade to next
      const booking = await Booking.findOneAndUpdate(
        {
          _id: req.params.id,
          $or: [
            { partnerId: req.user.id },
            { partnerId: null, status: 'pending' },
          ],
        },
        { $addToSet: { rejectedBy: req.user.id } },
        { new: true }
      );

      if (!booking) return sendError(res, 404, 'Booking not found');

      // Clear existing timeout before cascading
      clearAssignmentTimeout(booking._id);

      // Cascade to next eligible partner
      await cascadeToNextPartner(req.app, booking._id.toString());

      return sendResponse(res, 200, 'Booking rejected', booking);
    }
  } catch (error) {
    next(error);
  }
};

// Partner: Update job status (transaction for completion earnings)
exports.updateJobStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return sendError(res, 404, 'Booking not found');

    if (booking.partnerId?.toString() !== req.user.id) {
      return sendError(res, 403, 'Not authorized');
    }

    const validTransitions = {
      accepted: ['started'],
      started: ['in_progress'],
      in_progress: ['completed'],
    };

    if (!validTransitions[booking.status]?.includes(status)) {
      return sendError(res, 400, `Cannot change status from ${booking.status} to ${status}`);
    }

    if (status === 'completed') {
      // Use transaction for atomic booking completion + earnings update
      await withTransaction(async (session) => {
        const opts = session ? { session } : {};
        booking.status = 'completed';
        booking.completedAt = new Date();
        if (booking.paymentMethod === 'cod') {
          booking.paymentStatus = 'paid';
        }
        await booking.save(opts);

        let partner;
        if (session) {
          partner = await Partner.findById(req.user.id).session(session);
        } else {
          partner = await Partner.findById(req.user.id);
        }
        const earning = booking.finalAmount * ((100 - partner.commission) / 100);
        partner.totalBookings += 1;
        partner.totalEarnings += earning;
        partner.walletBalance += earning;
        await partner.save(opts);
      });
    } else {
      booking.status = status;
      await booking.save();
    }

    // Notify user about status change
    const statusMessages = {
      started: { title: 'Service Started', body: 'Your car wash has started!' },
      in_progress: { title: 'In Progress', body: 'Your car is being cleaned right now.' },
      completed: { title: 'Service Completed', body: 'Your car wash is done!' },
    };

    const msg = statusMessages[status];
    if (msg) {
      sendNotification(req, {
        title: msg.title,
        body: msg.body,
        type: 'booking_update',
        targetType: 'user',
        targetId: booking.userId.toString(),
        data: { bookingId: booking._id },
      });
    }

    sendResponse(res, 200, 'Status updated', booking);
  } catch (error) {
    next(error);
  }
};

// Upload before/after photos
exports.uploadPhotos = async (req, res, next) => {
  try {
    const { type } = req.body; // 'before' or 'after'
    const booking = await Booking.findById(req.params.id);
    if (!booking) return sendError(res, 404, 'Booking not found');

    const urls = req.files.map((f) => f.path);

    if (type === 'before') {
      booking.beforePhotos.push(...urls);
    } else {
      booking.afterPhotos.push(...urls);
    }

    await booking.save();
    sendResponse(res, 200, 'Photos uploaded', booking);
  } catch (error) {
    next(error);
  }
};

// Reschedule booking (change date/time)
exports.rescheduleBooking = async (req, res, next) => {
  try {
    const { slotDate, slotTime } = req.body;
    if (!slotDate || !slotTime) {
      return sendError(res, 400, 'New date and time are required');
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return sendError(res, 404, 'Booking not found');

    // Only allow reschedule for pending/assigned bookings
    if (!['pending', 'assigned'].includes(booking.status)) {
      return sendError(res, 400, 'Cannot reschedule booking in current status');
    }

    // Validate new date is not in the past and within 7 days
    const now = new Date();
    const newDate = new Date(slotDate.slice(0, 10) + 'T00:00:00');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const maxDate = new Date(todayStart);
    maxDate.setDate(maxDate.getDate() + 7);

    if (newDate < todayStart) {
      return sendError(res, 400, 'Cannot reschedule to a past date');
    }
    if (newDate >= maxDate) {
      return sendError(res, 400, 'Can only reschedule within the next 7 days');
    }

    // Validate slot availability
    const dayStart = new Date(slotDate.slice(0, 10) + 'T00:00:00.000Z');
    const dayEnd = new Date(slotDate.slice(0, 10) + 'T23:59:59.999Z');

    const existingCount = await Booking.countDocuments({
      _id: { $ne: booking._id },
      slotDate: { $gte: dayStart, $lte: dayEnd },
      slotTime,
      status: { $nin: ['cancelled', 'awaiting_payment'] },
    });

    const timeSlot = await TimeSlot.findOne({ date: { $gte: dayStart, $lte: dayEnd } }).lean();
    let maxBookings = 5;
    if (timeSlot) {
      const slotConfig = timeSlot.slots.find((s) => s.time === slotTime);
      if (slotConfig?.isBlocked) {
        return sendError(res, 400, 'This time slot is blocked');
      }
      if (slotConfig) maxBookings = slotConfig.maxBookings;
    }

    if (existingCount >= maxBookings) {
      return sendError(res, 400, 'This time slot is fully booked');
    }

    booking.slotDate = slotDate;
    booking.slotTime = slotTime;
    await booking.save();

    const populated = await Booking.findById(booking._id)
      .populate('carId')
      .populate('serviceId')
      .populate('partnerId', 'name phone avatar');

    sendResponse(res, 200, 'Booking rescheduled successfully', populated);
  } catch (error) {
    next(error);
  }
};

// Apply promo code (validate)
exports.validatePromoCode = async (req, res, next) => {
  try {
    const { code, amount } = req.body;

    const promo = await PromoCode.findOne({
      code: code.toUpperCase(),
      isActive: true,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() },
    });

    if (!promo) return sendError(res, 404, 'Invalid or expired promo code');
    if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
      return sendError(res, 400, 'Promo code usage limit reached');
    }
    if (amount < promo.minOrder) {
      return sendError(res, 400, `Minimum order amount is ₹${promo.minOrder}`);
    }

    let discount;
    if (promo.discountType === 'flat') {
      discount = promo.discountValue;
    } else {
      discount = (amount * promo.discountValue) / 100;
      if (promo.maxDiscount > 0) discount = Math.min(discount, promo.maxDiscount);
    }

    sendResponse(res, 200, 'Promo code applied', {
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discount: Math.round(discount),
      finalAmount: amount - Math.round(discount),
    });
  } catch (error) {
    next(error);
  }
};
