const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Service name is required'], trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: [true, 'Price is required'], min: 0 },
    duration: { type: Number, required: [true, 'Duration is required'], min: 0 },
    image: { type: String, default: '' },
    category: { type: String, default: 'general', trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceSchema.index({ isActive: 1, category: 1 });

module.exports = mongoose.model('Service', serviceSchema);
