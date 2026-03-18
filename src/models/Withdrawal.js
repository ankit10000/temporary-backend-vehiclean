const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'paid'],
      default: 'pending',
    },
    transactionId: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true }
);

withdrawalSchema.index({ partnerId: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
