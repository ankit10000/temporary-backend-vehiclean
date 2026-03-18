const Notification = require('../models/Notification');
const Partner = require('../models/Partner');
const User = require('../models/User');
const { sendPushNotification, sendPushToMany } = require('./pushNotification');

/**
 * Helper: get io from either an Express app or a req object.
 */
function getIo(appOrReq) {
  if (!appOrReq) return null;
  // If it's an Express app (has .get as a function that works with settings)
  if (typeof appOrReq.get === 'function') {
    // Could be app or req — try app.get('io') first
    const io = appOrReq.get('io');
    if (io) return io;
    // If it's req, try req.app.get('io')
    if (appOrReq.app && typeof appOrReq.app.get === 'function') {
      return appOrReq.app.get('io') || null;
    }
  }
  return null;
}

/**
 * Send a notification — saves to DB and emits via socket.io
 * @param {object} appOrReq - Express app or request object
 * @param {object} options
 */
const sendNotification = async (appOrReq, options) => {
  const { title, body, type, targetType, targetId, data } = options;

  const notification = await Notification.create({
    title,
    body,
    type,
    targetType,
    targetId,
  });

  const io = getIo(appOrReq);
  if (io) {
    io.to(`${targetType}_${targetId}`).emit('notification', {
      _id: notification._id,
      title,
      body,
      type,
      sentAt: notification.sentAt,
      data: data || {},
    });
  }

  // Send push notification
  try {
    const Model = targetType === 'partner' ? Partner : User;
    const target = await Model.findById(targetId, 'fcmToken');
    if (target?.fcmToken) {
      sendPushNotification(target.fcmToken, { title, body, data: { type, ...(data || {}) } });
    }
  } catch (err) {
    console.error('[Push] Lookup failed:', err.message);
  }

  return notification;
};

/**
 * Notify all online approved partners about an available booking
 * @param {object} appOrReq - Express app or request object
 * @param {object} options
 * @param {string} [options.excludePartnerId] - single partner to skip
 * @param {string[]} [options.excludePartnerIds] - array of partner IDs to skip
 */
const notifyAllPartners = async (appOrReq, options) => {
  const { title, body, type, excludePartnerId, excludePartnerIds } = options;

  const query = { status: 'approved', isActive: true, isOnline: true };

  // Build $nin from both single and array excludes
  const excludeSet = new Set();
  if (excludePartnerId) excludeSet.add(excludePartnerId.toString());
  if (excludePartnerIds) {
    for (const id of excludePartnerIds) excludeSet.add(id.toString());
  }
  if (excludeSet.size > 0) {
    query._id = { $nin: Array.from(excludeSet) };
  }

  const partners = await Partner.find(query, '_id fcmToken');
  const io = getIo(appOrReq);
  const pushTokens = [];

  for (const partner of partners) {
    const notification = await Notification.create({
      title,
      body,
      type,
      targetType: 'partner',
      targetId: partner._id,
    });

    if (io) {
      io.to(`partner_${partner._id}`).emit('notification', {
        _id: notification._id,
        title,
        body,
        type,
        sentAt: notification.sentAt,
      });
    }

    if (partner.fcmToken) {
      pushTokens.push(partner.fcmToken);
    }
  }

  if (pushTokens.length > 0) {
    sendPushToMany(pushTokens, { title, body, data: { type } });
  }
};

/**
 * Emit a rich booking_alert socket event to all online approved partners (no DB save)
 * @param {object} appOrReq - Express app or request object
 * @param {object} opts
 * @param {string} [opts.excludePartnerId] - single partner to skip
 * @param {string[]} [opts.excludePartnerIds] - array of partner IDs to skip
 * @param {number} [opts.timeoutSeconds] - countdown seconds sent to clients
 */
const emitBookingAlert = async (appOrReq, { booking, excludePartnerId, excludePartnerIds, timeoutSeconds }) => {
  const query = { status: 'approved', isActive: true, isOnline: true };

  const excludeSet = new Set();
  if (excludePartnerId) excludeSet.add(excludePartnerId.toString());
  if (excludePartnerIds) {
    for (const id of excludePartnerIds) excludeSet.add(id.toString());
  }
  if (excludeSet.size > 0) {
    query._id = { $nin: Array.from(excludeSet) };
  }

  const partners = await Partner.find(query, '_id');
  const io = getIo(appOrReq);
  if (!io) {
    console.log('[BookingAlert] No io instance — skipping emit');
    return;
  }

  const payload = {
    bookingId: booking._id,
    serviceName: booking.serviceId?.name || 'Car Wash',
    customerName: booking.userId?.name || 'Customer',
    carMake: booking.carId?.make || '',
    carModel: booking.carId?.model || '',
    slotDate: booking.slotDate,
    slotTime: booking.slotTime,
    finalAmount: booking.finalAmount || booking.amount || 0,
    address: booking.address?.full || '',
  };
  if (timeoutSeconds != null) payload.timeoutSeconds = timeoutSeconds;

  console.log(`[BookingAlert] Emitting booking_alert to ${partners.length} partners`);
  for (const partner of partners) {
    io.to(`partner_${partner._id}`).emit('booking_alert', payload);
  }
};

/**
 * Emit a rich booking_alert socket event to a single partner (no DB save)
 * @param {object} appOrReq - Express app or request object
 * @param {object} opts
 * @param {number} [opts.timeoutSeconds] - countdown seconds sent to client
 */
const emitBookingAlertToPartner = (appOrReq, { booking, partnerId, timeoutSeconds }) => {
  const io = getIo(appOrReq);
  if (!io) {
    console.log('[BookingAlert] No io instance — skipping emit');
    return;
  }

  const payload = {
    bookingId: booking._id,
    serviceName: booking.serviceId?.name || 'Car Wash',
    customerName: booking.userId?.name || 'Customer',
    carMake: booking.carId?.make || '',
    carModel: booking.carId?.model || '',
    slotDate: booking.slotDate,
    slotTime: booking.slotTime,
    finalAmount: booking.finalAmount || booking.amount || 0,
    address: booking.address?.full || '',
  };
  if (timeoutSeconds != null) payload.timeoutSeconds = timeoutSeconds;

  console.log(`[BookingAlert] Emitting booking_alert to partner: ${partnerId}`);
  io.to(`partner_${partnerId}`).emit('booking_alert', payload);
};

module.exports = { sendNotification, notifyAllPartners, emitBookingAlert, emitBookingAlertToPartner };
