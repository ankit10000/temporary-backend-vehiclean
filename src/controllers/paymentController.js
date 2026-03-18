const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { sendResponse, sendError } = require('../utils/response');
const { assignPartnerAndNotify } = require('../utils/partnerAssignment');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Razorpay order
exports.createOrder = async (req, res, next) => {
  try {
    const { bookingId, amount } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) return sendError(res, 404, 'Booking not found');

    const options = {
      amount: amount * 100, // Razorpay expects paise
      currency: 'INR',
      receipt: `booking_${bookingId}`,
    };

    const order = await razorpay.orders.create(options);

    const payment = await Payment.create({
      bookingId,
      userId: req.user.id,
      amount,
      method: 'online',
      razorpayOrderId: order.id,
    });

    sendResponse(res, 200, 'Order created', {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      paymentId: payment._id,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    next(error);
  }
};

// Verify payment
exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const sign = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest('hex');

    if (expectedSign !== razorpaySignature) {
      return sendError(res, 400, 'Payment verification failed');
    }

    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId },
      { razorpayPaymentId, razorpaySignature, status: 'paid' },
      { new: true }
    );

    if (!payment) {
      return sendError(res, 404, 'Payment record not found');
    }

    await Booking.findByIdAndUpdate(payment.bookingId, { paymentStatus: 'paid' });

    // Assign partner and notify now that payment is confirmed
    const booking = await Booking.findById(payment.bookingId);
    const populated = await assignPartnerAndNotify(req.app, payment.bookingId, {
      lat: booking?.address?.lat,
      lng: booking?.address?.lng,
    });

    sendResponse(res, 200, 'Payment verified', { payment, booking: populated });
  } catch (error) {
    next(error);
  }
};
