const cron = require('node-cron');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { sendPushNotification } = require('../utils/pushNotification');
const Notification = require('../models/Notification');

/**
 * Booking Reminder Cron Job
 * Runs every 15 minutes. Finds bookings happening in the next 30 minutes
 * and sends a push notification to the user if not already reminded.
 */
const startBookingReminderCron = (app) => {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      // Find bookings that are today + in active status
      const dayStart = new Date(todayStr + 'T00:00:00.000Z');
      const dayEnd = new Date(todayStr + 'T23:59:59.999Z');

      const activeBookings = await Booking.find({
        slotDate: { $gte: dayStart, $lte: dayEnd },
        status: { $in: ['pending', 'assigned', 'accepted'] },
        reminderSent: { $ne: true },
      })
        .populate('userId', 'name fcmToken')
        .populate('serviceId', 'name')
        .lean();

      if (activeBookings.length === 0) return;

      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      let sentCount = 0;
      for (const booking of activeBookings) {
        const [h, m] = booking.slotTime.split(':').map(Number);
        const slotMinutes = h * 60 + m;
        const diff = slotMinutes - currentMinutes;

        // Send reminder if booking is between 15-45 min away
        if (diff > 0 && diff <= 45) {
          const user = booking.userId;
          if (!user?.fcmToken) continue;

          const serviceName = booking.serviceId?.name || 'car wash';
          const title = 'Booking Reminder';
          const body = `Your ${serviceName} is scheduled in ~${diff} minutes at ${booking.slotTime}. Get ready!`;

          // Send push
          await sendPushNotification(user.fcmToken, {
            title,
            body,
            data: { type: 'booking_reminder', bookingId: booking._id.toString() },
          });

          // Save notification to DB
          await Notification.create({
            title,
            body,
            type: 'booking_reminder',
            targetType: 'user',
            targetId: user._id,
          });

          // Emit via socket if available
          const io = app?.get?.('io');
          if (io) {
            io.to(`user_${user._id}`).emit('notification', {
              title,
              body,
              type: 'booking_reminder',
              data: { bookingId: booking._id.toString() },
            });
          }

          // Mark as reminded so we don't send again
          await Booking.updateOne({ _id: booking._id }, { $set: { reminderSent: true } });
          sentCount++;
        }
      }

      if (sentCount > 0) {
        console.log(`[Cron] Sent ${sentCount} booking reminder(s)`);
      }
    } catch (err) {
      console.error('[Cron] Booking reminder error:', err.message);
    }
  });

  console.log('[Cron] Booking reminder cron scheduled (every 15 min)');
};

module.exports = { startBookingReminderCron };
