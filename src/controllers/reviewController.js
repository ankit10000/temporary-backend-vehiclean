const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Partner = require('../models/Partner');
const { sendResponse, sendError } = require('../utils/response');

// @desc    Create a review for a completed booking
// @route   POST /api/reviews
// @access  User
exports.createReview = async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;
    const userId = req.user.id;

    // Check if booking exists
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return sendError(res, 404, 'Booking not found');
    }

    // Check booking belongs to this user
    if (booking.userId.toString() !== userId) {
      return sendError(res, 403, 'You can only review your own bookings');
    }

    // Check booking is completed
    if (booking.status !== 'completed') {
      return sendError(res, 400, 'You can only review completed bookings');
    }

    // Check if a partner was assigned
    if (!booking.partnerId) {
      return sendError(res, 400, 'No partner assigned to this booking');
    }

    // Check if already reviewed
    const existingReview = await Review.findOne({ bookingId });
    if (existingReview) {
      return sendError(res, 400, 'You have already reviewed this booking');
    }

    // Create review
    const review = await Review.create({
      bookingId,
      userId,
      partnerId: booking.partnerId,
      rating,
      comment: comment || '',
    });

    // Update partner's averageRating and totalReviews using aggregation
    const stats = await Review.aggregate([
      { $match: { partnerId: booking.partnerId } },
      {
        $group: {
          _id: '$partnerId',
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    if (stats.length > 0) {
      await Partner.findByIdAndUpdate(booking.partnerId, {
        averageRating: Math.round(stats[0].averageRating * 10) / 10,
        totalReviews: stats[0].totalReviews,
      });
    }

    return sendResponse(res, 201, 'Review submitted successfully', review);
  } catch (error) {
    console.error('Create review error:', error);
    return sendError(res, 500, 'Failed to submit review');
  }
};

// @desc    Get reviews for a partner (public, paginated)
// @route   GET /api/reviews/partner/:partnerId
// @access  Public
exports.getPartnerReviews = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ partnerId })
        .populate('userId', 'name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments({ partnerId }),
    ]);

    return sendResponse(res, 200, 'Partner reviews fetched', {
      reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get partner reviews error:', error);
    return sendError(res, 500, 'Failed to fetch reviews');
  }
};

// @desc    Get review for a specific booking
// @route   GET /api/reviews/booking/:bookingId
// @access  Protected
exports.getBookingReview = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const review = await Review.findOne({ bookingId })
      .populate('userId', 'name avatar')
      .populate('partnerId', 'name avatar');

    if (!review) {
      return sendResponse(res, 200, 'No review found', null);
    }

    return sendResponse(res, 200, 'Booking review fetched', review);
  } catch (error) {
    console.error('Get booking review error:', error);
    return sendError(res, 500, 'Failed to fetch review');
  }
};

// @desc    Get all reviews (Admin)
// @route   GET /api/reviews/admin/all
// @access  Admin
exports.getAllReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find()
        .populate('userId', 'name email')
        .populate('partnerId', 'name email')
        .populate('bookingId', 'serviceId slotDate status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(),
    ]);

    return sendResponse(res, 200, 'All reviews fetched', {
      reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get all reviews error:', error);
    return sendError(res, 500, 'Failed to fetch reviews');
  }
};
