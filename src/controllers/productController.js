const Product = require('../models/Product');
const { sendResponse, sendError } = require('../utils/response');

// @desc    Get all products (public, with optional category filter & pagination)
// @route   GET /api/products
exports.getProducts = async (req, res, next) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };

    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const products = await Product.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(Number(limit));

    const total = await Product.countDocuments(filter);

    sendResponse(res, 200, 'Products fetched', {
      products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single product by ID (public)
// @route   GET /api/products/:id
exports.getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return sendError(res, 404, 'Product not found');
    sendResponse(res, 200, 'Product fetched', product);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all products for admin (includes inactive)
// @route   GET /api/admin/products
exports.getProductsAdmin = async (req, res, next) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const products = await Product.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(Number(limit));

    const total = await Product.countDocuments(filter);

    sendResponse(res, 200, 'Products fetched', {
      products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a product (admin only)
// @route   POST /api/products
exports.createProduct = async (req, res, next) => {
  try {
    const product = await Product.create(req.body);
    sendResponse(res, 201, 'Product created', product);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a product (admin only)
// @route   PUT /api/products/:id
exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!product) return sendError(res, 404, 'Product not found');
    sendResponse(res, 200, 'Product updated', product);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a product (admin only)
// @route   DELETE /api/products/:id
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return sendError(res, 404, 'Product not found');
    sendResponse(res, 200, 'Product deleted');
  } catch (error) {
    next(error);
  }
};
