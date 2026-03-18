const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Partner = require('../models/Partner');
const { sendNotification, notifyAllPartners, emitBookingAlert, emitBookingAlertToPartner } = require('./notification');
const { startAssignmentTimeout, clearAssignmentTimeout, TIMEOUT_MS } = require('./assignmentTimeout');

const TIMEOUT_SECONDS = Math.round(TIMEOUT_MS / 1000);

/**
 * Find the next eligible partner closest to the booking location,
 * respecting each partner's own serviceRadius and excluding already-rejected partners.
 *
 * @param {string} bookingId
 * @param {number} lat - booking latitude
 * @param {number} lng - booking longitude
 * @param {string} city - booking city (fallback)
 * @param {string[]} excludeIds - partner IDs to exclude (rejectedBy + current)
 * @returns {{ partner: object, distanceKm: number } | null}
 */
async function findNextEligiblePartner(bookingId, lat, lng, city, excludeIds = []) {
  const excludeObjectIds = excludeIds.map((id) => new mongoose.Types.ObjectId(id));

  // Build daily booking count map for eligible partners
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const baseMatch = {
    status: 'approved',
    isActive: true,
    isOnline: true,
    isDeleted: { $ne: true },
  };
  if (excludeObjectIds.length > 0) {
    baseMatch._id = { $nin: excludeObjectIds };
  }

  // Try geo-based search first if we have coordinates
  if (lat && lng) {
    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'calculatedDistance', // in meters
          spherical: true,
          query: baseMatch,
        },
      },
      // Filter: calculatedDistance <= partner.serviceRadius * 1000
      {
        $addFields: {
          maxDistanceMeters: { $multiply: ['$serviceRadius', 1000] },
        },
      },
      {
        $match: {
          $expr: { $lte: ['$calculatedDistance', '$maxDistanceMeters'] },
        },
      },
      // Lookup daily booking counts for each partner
      {
        $lookup: {
          from: 'bookings',
          let: { pid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$partnerId', '$$pid'] },
                    { $not: { $in: ['$status', ['cancelled', 'awaiting_payment']] } },
                    { $gte: ['$slotDate', todayStart] },
                    { $lte: ['$slotDate', todayEnd] },
                  ],
                },
              },
            },
            { $count: 'count' },
          ],
          as: 'dailyBookings',
        },
      },
      {
        $addFields: {
          dailyCount: {
            $ifNull: [{ $arrayElemAt: ['$dailyBookings.count', 0] }, 0],
          },
        },
      },
      // Filter out partners who have reached their daily limit
      {
        $match: {
          $expr: { $lt: ['$dailyCount', { $ifNull: ['$maxBookings', 10] }] },
        },
      },
      // Sort by distance (closest first) — $geoNear already sorts, but be explicit
      { $sort: { calculatedDistance: 1 } },
      { $limit: 1 },
      { $project: { _id: 1, name: 1, phone: 1, calculatedDistance: 1 } },
    ];

    const results = await Partner.aggregate(pipeline);
    if (results.length > 0) {
      const p = results[0];
      return {
        partner: { _id: p._id, name: p.name, phone: p.phone },
        distanceKm: Math.round((p.calculatedDistance / 1000) * 10) / 10,
      };
    }
  }

  // Fallback: city match (excluding rejected), then any online partner
  const eligiblePartners = await Partner.find(baseMatch, '_id maxBookings').lean();
  const dailyCountsByPartner = await Booking.aggregate([
    {
      $match: {
        partnerId: { $in: eligiblePartners.map((p) => p._id) },
        status: { $nin: ['cancelled', 'awaiting_payment'] },
        slotDate: { $gte: todayStart, $lte: todayEnd },
      },
    },
    { $group: { _id: '$partnerId', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  for (const entry of dailyCountsByPartner) {
    countMap[entry._id.toString()] = entry.count;
  }
  const eligibleIds = eligiblePartners
    .filter((p) => (countMap[p._id.toString()] || 0) < (p.maxBookings ?? 10))
    .map((p) => p._id);

  if (eligibleIds.length === 0) return null;

  const fallbackQuery = { _id: { $in: eligibleIds } };
  if (city) {
    fallbackQuery.city = { $regex: new RegExp(`^${city.trim()}$`, 'i') };
  }

  let partner = await Partner.findOne(fallbackQuery, '_id name phone').sort({ totalEarnings: 1 });
  if (!partner && city) {
    // Try without city filter
    partner = await Partner.findOne({ _id: { $in: eligibleIds } }, '_id name phone').sort({ totalEarnings: 1 });
  }

  if (partner) {
    return { partner: { _id: partner._id, name: partner.name, phone: partner.phone }, distanceKm: null };
  }

  return null;
}

/**
 * Find an available partner, assign them to the booking, and send notifications.
 * If no partner found, broadcast to all online partners.
 *
 * @param {object} app - Express app instance (NOT req — so timeouts can call this)
 * @param {string} bookingId - Booking ObjectId
 * @param {object} [opts] - Optional { lat, lng, city }
 * @returns {object} populated booking
 */
async function assignPartnerAndNotify(app, bookingId, opts = {}) {
  const { lat, lng, city } = opts;

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error('Booking not found');

  const excludeIds = (booking.rejectedBy || []).map((id) => id.toString());

  // Use booking address coords if not passed explicitly
  const searchLat = lat || booking.address?.lat;
  const searchLng = lng || booking.address?.lng;

  const result = await findNextEligiblePartner(bookingId, searchLat, searchLng, city, excludeIds);

  if (result) {
    const { partner, distanceKm } = result;

    // Atomic update to prevent race conditions
    const updated = await Booking.findOneAndUpdate(
      { _id: bookingId, status: { $in: ['pending', 'assigned'] } },
      {
        $set: {
          partnerId: partner._id,
          status: 'assigned',
          assignedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updated) {
      // Booking status changed (e.g. cancelled) — don't proceed
      return Booking.findById(bookingId)
        .populate('carId')
        .populate('serviceId')
        .populate('partnerId', 'name phone')
        .populate('userId', 'name phone');
    }

    const populated = await Booking.findById(bookingId)
      .populate('carId')
      .populate('serviceId')
      .populate('partnerId', 'name phone')
      .populate('userId', 'name phone');

    // Start 2-min timeout for this assignment
    startAssignmentTimeout(app, bookingId);

    console.log(`[PartnerAssignment] Assigned partner ${partner.name} (${distanceKm != null ? distanceKm + 'km' : 'city match'}) to booking ${bookingId}`);

    // Notify user
    sendNotification(app, {
      title: 'Partner Assigned',
      body: `${partner.name} has been assigned to your booking.`,
      type: 'partner_assigned',
      targetType: 'user',
      targetId: populated.userId._id.toString(),
    });
    // Notify assigned partner
    sendNotification(app, {
      title: 'New Booking Assigned',
      body: `You have a new ${populated.serviceId?.name || 'car wash'} booking at ${populated.slotTime}.`,
      type: 'new_booking',
      targetType: 'partner',
      targetId: partner._id.toString(),
    });
    emitBookingAlertToPartner(app, {
      booking: populated,
      partnerId: partner._id.toString(),
      timeoutSeconds: TIMEOUT_SECONDS,
    });

    return populated;
  }

  // No partner found — broadcast to all (excluding rejected ones)
  await Booking.findByIdAndUpdate(bookingId, {
    partnerId: null,
    status: 'pending',
    assignedAt: null,
  });

  const populated = await Booking.findById(bookingId)
    .populate('carId')
    .populate('serviceId')
    .populate('partnerId', 'name phone')
    .populate('userId', 'name phone');

  console.log(`[PartnerAssignment] No eligible partner found for booking ${bookingId} — broadcasting`);

  notifyAllPartners(app, {
    title: 'New Booking Available',
    body: `A new ${populated.serviceId?.name || 'car wash'} booking is available at ${populated.slotTime}. Accept it now!`,
    type: 'new_booking',
    excludePartnerIds: excludeIds,
  });
  emitBookingAlert(app, {
    booking: populated,
    excludePartnerIds: excludeIds,
    timeoutSeconds: TIMEOUT_SECONDS,
  });

  return populated;
}

/**
 * Cascade to the next partner after a rejection or timeout.
 * Called by timeout handler or reject action.
 *
 * @param {object} app - Express app instance
 * @param {string} bookingId
 */
async function cascadeToNextPartner(app, bookingId) {
  // Guard: booking must still be in 'assigned' status
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status !== 'assigned') {
    console.log(`[Cascade] Booking ${bookingId} is no longer assigned (status: ${booking?.status}) — skipping`);
    return;
  }

  const oldPartnerId = booking.partnerId?.toString();

  // Emit cancellation to old partner
  if (oldPartnerId) {
    const io = app.get('io');
    if (io) {
      io.to(`partner_${oldPartnerId}`).emit('booking_alert_cancelled', { bookingId: booking._id });
    }
  }

  console.log(`[Cascade] Cascading booking ${bookingId} to next partner (old: ${oldPartnerId || 'none'})`);

  // Assign next partner
  await assignPartnerAndNotify(app, bookingId, {
    lat: booking.address?.lat,
    lng: booking.address?.lng,
    city: booking.city,
  });
}

module.exports = { assignPartnerAndNotify, cascadeToNextPartner, findNextEligiblePartner };
