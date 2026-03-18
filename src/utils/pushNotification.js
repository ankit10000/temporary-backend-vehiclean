const { Expo } = require('expo-server-sdk');

const expo = new Expo();

/**
 * Send a push notification to a single Expo push token.
 */
const sendPushNotification = async (pushToken, { title, body, data }) => {
  if (!pushToken || !Expo.isExpoPushToken(pushToken)) {
    console.warn('[Push] Invalid Expo push token:', pushToken);
    return;
  }

  const message = {
    to: pushToken,
    sound: 'default',
    title,
    body,
    data: data || {},
    priority: 'high',
  };

  // Use channelId for booking alerts on Android
  if (data?.type && (data.type.includes('booking') || data.type === 'new_booking' || data.type === 'partner_assigned')) {
    message.channelId = 'booking_alerts_v3';
    message.sound = 'booking_alert_long.wav';
  }

  try {
    const [result] = await expo.sendPushNotificationsAsync([message]);
    if (result.status === 'ok') {
      console.log('[Push] Sent successfully');
    } else {
      console.error('[Push] Error:', result.message);
    }
  } catch (err) {
    console.error('[Push] Error sending:', err.message);
  }
};

/**
 * Send push notifications to multiple Expo push tokens.
 */
const sendPushToMany = async (pushTokens, { title, body, data }) => {
  const validTokens = pushTokens.filter((t) => t && Expo.isExpoPushToken(t));
  if (validTokens.length === 0) return;

  const isBooking = data?.type && (data.type.includes('booking') || data.type === 'new_booking' || data.type === 'partner_assigned');

  const messages = validTokens.map((token) => ({
    to: token,
    sound: isBooking ? 'booking_alert_long.wav' : 'default',
    title,
    body,
    data: data || {},
    priority: 'high',
    ...(isBooking && { channelId: 'booking_alerts_v3' }),
  }));

  const chunks = expo.chunkPushNotifications(messages);
  let successCount = 0;
  let failureCount = 0;

  for (const chunk of chunks) {
    try {
      const results = await expo.sendPushNotificationsAsync(chunk);
      results.forEach((r) => {
        if (r.status === 'ok') successCount++;
        else failureCount++;
      });
    } catch (err) {
      console.error('[Push] Chunk send failed:', err.message);
      failureCount += chunk.length;
    }
  }

  console.log(`[Push] Batch: ${successCount} sent, ${failureCount} failed`);
};

module.exports = { sendPushNotification, sendPushToMany };
