const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Product name is required'], trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: [true, 'Price is required'], min: 0 },
    mrp: { type: Number },
    image: { type: String, default: '' },
    category: { type: String, required: true, trim: true },
    brand: { type: String, default: '' },
    inStock: { type: Boolean, default: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('Product', productSchema);
