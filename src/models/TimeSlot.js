const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    slots: [
      {
        time: { type: String, required: true },
        maxBookings: { type: Number, default: 5 },
        currentBookings: { type: Number, default: 0 },
        isBlocked: { type: Boolean, default: false },
      },
    ],
    isHoliday: { type: Boolean, default: false },
    holidayReason: { type: String, default: '' },
  },
  { timestamps: true }
);

timeSlotSchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.model('TimeSlot', timeSlotSchema);
