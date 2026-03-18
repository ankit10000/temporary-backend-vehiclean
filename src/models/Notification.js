const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    type: { type: String, default: 'general' },
    targetType: { type: String, enum: ['user', 'partner', 'all'], default: 'all' },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sentAt: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // Auto-delete after 30 days

module.exports = mongoose.model('Notification', notificationSchema);
