const express = require('express');
const router = express.Router();
const { createOrder, verifyPayment } = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

router.post('/create-order', protect, authorize('user'), createOrder);
router.post('/verify', protect, authorize('user'), verifyPayment);

module.exports = router;
