const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Banner title is required'], trim: true },
    description: { type: String, default: '', trim: true },
    image: { type: String, required: [true, 'Banner image is required'] },
    type: { type: String, enum: ['home', 'offer', 'popup'], default: 'home' },
    price: { type: Number, default: 0 },
    directPayment: { type: Boolean, default: false },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
    isActive: { type: Boolean, default: true },
    link: { type: String, default: '' },
  },
  { timestamps: true }
);

bannerSchema.index({ isActive: 1, type: 1 });

module.exports = mongoose.model('Banner', bannerSchema);
