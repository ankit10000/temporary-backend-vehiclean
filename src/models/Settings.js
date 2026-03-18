const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    supportPhone: { type: String, default: '' },
    supportEmail: { type: String, default: '' },
    cancellationCharges: { type: Number, default: 0 },
    defaultCommission: { type: Number, default: 20 },
    maintenanceMode: { type: Boolean, default: false },
    termsUrl: { type: String, default: '' },
    privacyUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
