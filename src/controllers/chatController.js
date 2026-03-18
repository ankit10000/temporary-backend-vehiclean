const Message = require('../models/Message');
const Booking = require('../models/Booking');
const { sendResponse, sendError } = require('../utils/response');

// @desc    Get messages for a booking (paginated, latest first)
// @route   GET /api/chat/:bookingId
// @access  Private (user or partner of the booking)
const getMessages = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return sendError(res, 404, 'Booking not found');
    }

    // Validate the requesting user is either the booking's userId or partnerId
    const userId = req.user.id;
    const isUser = booking.userId.toString() === userId;
    const isPartner = booking.partnerId && booking.partnerId.toString() === userId;

    if (!isUser && !isPartner) {
      return sendError(res, 403, 'You are not authorized to view these messages');
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find({ bookingId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Message.countDocuments({ bookingId });

    sendResponse(res, 200, 'Messages fetched successfully', {
      messages: messages.reverse(), // Return in chronological order
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('[Chat] getMessages error:', error.message);
    sendError(res, 500, 'Failed to fetch messages');
  }
};

// @desc    Send a message in a booking chat
// @route   POST /api/chat/:bookingId
// @access  Private (user or partner of the booking)
const sendMessage = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return sendError(res, 400, 'Message text is required');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return sendError(res, 404, 'Booking not found');
    }

    // Validate the sender is part of the booking
    const senderId = req.user.id;
    const senderRole = req.user.role;
    const isUser = senderRole === 'user' && booking.userId.toString() === senderId;
    const isPartner = senderRole === 'partner' && booking.partnerId && booking.partnerId.toString() === senderId;

    if (!isUser && !isPartner) {
      return sendError(res, 403, 'You are not authorized to send messages in this booking');
    }

    const message = await Message.create({
      bookingId,
      senderId,
      senderRole,
      text: text.trim(),
    });

    // Emit socket event to the booking room
    const io = req.app.get('io');
    if (io) {
      io.to(`booking_${bookingId}`).emit('new_message', message);
    }

    sendResponse(res, 201, 'Message sent successfully', message);
  } catch (error) {
    console.error('[Chat] sendMessage error:', error.message);
    sendError(res, 500, 'Failed to send message');
  }
};

module.exports = { getMessages, sendMessage };
