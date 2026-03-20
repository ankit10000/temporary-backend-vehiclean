const express = require('express');
const router = express.Router();
const {
  getAvailableSlots,
  createBooking,
  getUserBookings,
  getBookingById,
  cancelBooking,
  rescheduleBooking,
  getPartnerBookings,
  respondToBooking,
  updateJobStatus,
  uploadPhotos,
  validatePromoCode,
} = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const validate = require('../middleware/validate');
const {
  createBookingRules,
  cancelBookingRules,
  respondToBookingRules,
  updateJobStatusRules,
  validatePromoRules,
} = require('../validators/bookingValidators');

// Public
router.get('/slots/:date', getAvailableSlots);

// User routes
router.post('/', protect, authorize('user'), createBookingRules, validate, createBooking);
router.get('/user', protect, authorize('user'), getUserBookings);
router.post('/validate-promo', protect, authorize('user'), validatePromoRules, validate, validatePromoCode);

// Partner routes
router.get('/partner', protect, authorize('partner'), getPartnerBookings);
router.patch('/:id/respond', protect, authorize('partner'), respondToBookingRules, validate, respondToBooking);
router.patch('/:id/status', protect, authorize('partner'), updateJobStatusRules, validate, updateJobStatus);
router.post('/:id/photos', protect, authorize('partner'), upload.array('photos', 5), uploadPhotos);

// Shared
router.get('/:id', protect, getBookingById);
router.patch('/:id/cancel', protect, cancelBookingRules, validate, cancelBooking);
router.patch('/:id/reschedule', protect, authorize('user'), rescheduleBooking);

module.exports = router;
