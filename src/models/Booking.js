const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    carId: { type: mongoose.Schema.Types.ObjectId, ref: 'Car', required: true },
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    slotDate: { type: Date, required: [true, 'Slot date is required'] },
    slotTime: { type: String, required: [true, 'Slot time is required'] },
    status: {
      type: String,
      enum: ['awaiting_payment', 'pending', 'assigned', 'accepted', 'started', 'in_progress', 'completed', 'cancelled'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['cod', 'online'],
      required: [true, 'Payment method is required'],
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refund_pending', 'refunded'],
      default: 'pending',
    },
    amount: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true, min: 0 },
    promoCode: { type: String, default: '' },
    beforePhotos: [{ type: String }],
    afterPhotos: [{ type: String }],
    address: {
      full: { type: String, default: '' },
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
    },
    rejectedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Partner' }],
    assignedAt: { type: Date },
    cancelReason: { type: String, default: '' },
    cancelledBy: { type: String, enum: ['user', 'partner', 'admin', ''], default: '' },
    completedAt: { type: Date },
    refundTransactionId: { type: String, default: '' },
    refundedAt: { type: Date },
  },
  { timestamps: true }
);

bookingSchema.index({ userId: 1, status: 1 });
bookingSchema.index({ partnerId: 1, status: 1 });
bookingSchema.index({ slotDate: 1, slotTime: 1, status: 1 }); // Slot availability checks
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ partnerId: 1, completedAt: -1 });         // Earnings aggregation
bookingSchema.index({ userId: 1, createdAt: -1 });              // User booking history

module.exports = mongoose.model('Booking', bookingSchema);
