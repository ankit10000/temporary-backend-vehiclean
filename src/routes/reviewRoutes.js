const express = require('express');
const router = express.Router();
const { createReview, getPartnerReviews, getBookingReview, getAllReviews } = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createReviewRules } = require('../validators/reviewValidators');

router.post('/', protect, authorize('user'), createReviewRules, validate, createReview);
router.get('/partner/:partnerId', getPartnerReviews);
router.get('/booking/:bookingId', protect, getBookingReview);
router.get('/admin/all', protect, authorize('admin'), getAllReviews);

module.exports = router;
