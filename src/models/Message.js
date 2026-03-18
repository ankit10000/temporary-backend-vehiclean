const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  senderRole: { type: String, enum: ['user', 'partner'], required: true },
  text: { type: String, required: true, maxlength: 1000 },
}, { timestamps: true });

messageSchema.index({ bookingId: 1, createdAt: 1 });
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // Auto-delete after 90 days

module.exports = mongoose.model('Message', messageSchema);
