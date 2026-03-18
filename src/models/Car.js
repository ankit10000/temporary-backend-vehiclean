const mongoose = require('mongoose');

const carSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    make: { type: String, required: [true, 'Car make is required'], trim: true },
    model: { type: String, required: [true, 'Car model is required'], trim: true },
    year: { type: Number },
    registrationNo: { type: String, required: [true, 'Registration number is required'], trim: true },
    color: { type: String, default: '' },
    image: { type: String, default: '' },
  },
  { timestamps: true }
);

carSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Car', carSchema);
