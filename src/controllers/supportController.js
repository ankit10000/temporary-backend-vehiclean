const FAQ = require('../models/FAQ');
const SupportTicket = require('../models/SupportTicket');
const { sendResponse, sendError } = require('../utils/response');

// ── FAQ (Public) ──

exports.listFAQs = async (req, res, next) => {
  try {
    const faqs = await FAQ.find({ isActive: true }).sort('order').lean();
    sendResponse(res, 200, 'FAQs fetched', faqs);
  } catch (error) {
    next(error);
  }
};

// ── FAQ (Admin CRUD) ──

exports.adminListFAQs = async (req, res, next) => {
  try {
    const faqs = await FAQ.find().sort('order').lean();
    sendResponse(res, 200, 'FAQs fetched', faqs);
  } catch (error) {
    next(error);
  }
};

exports.createFAQ = async (req, res, next) => {
  try {
    const { question, answer, category, order } = req.body;
    const faq = await FAQ.create({ question, answer, category, order });
    sendResponse(res, 201, 'FAQ created', faq);
  } catch (error) {
    next(error);
  }
};

exports.updateFAQ = async (req, res, next) => {
  try {
    const faq = await FAQ.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!faq) return sendError(res, 404, 'FAQ not found');
    sendResponse(res, 200, 'FAQ updated', faq);
  } catch (error) {
    next(error);
  }
};

exports.deleteFAQ = async (req, res, next) => {
  try {
    const faq = await FAQ.findByIdAndDelete(req.params.id);
    if (!faq) return sendError(res, 404, 'FAQ not found');
    sendResponse(res, 200, 'FAQ deleted');
  } catch (error) {
    next(error);
  }
};

// ── Support Tickets (User) ──

exports.createTicket = async (req, res, next) => {
  try {
    const { subject, description, category, bookingId } = req.body;
    const ticket = await SupportTicket.create({
      userId: req.user.id,
      subject,
      description,
      category,
      bookingId: bookingId || null,
    });
    sendResponse(res, 201, 'Support ticket created', ticket);
  } catch (error) {
    next(error);
  }
};

exports.listUserTickets = async (req, res, next) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user.id })
      .sort('-createdAt')
      .limit(50)
      .lean();
    sendResponse(res, 200, 'Tickets fetched', tickets);
  } catch (error) {
    next(error);
  }
};

exports.getTicketById = async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('userId', 'name email phone')
      .populate('bookingId', 'slotDate slotTime status');
    if (!ticket) return sendError(res, 404, 'Ticket not found');
    sendResponse(res, 200, 'Ticket fetched', ticket);
  } catch (error) {
    next(error);
  }
};

// ── Support Tickets (Admin) ──

exports.adminListTickets = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const tickets = await SupportTicket.find(filter)
      .populate('userId', 'name email phone')
      .sort('-createdAt')
      .limit(100)
      .lean();
    sendResponse(res, 200, 'Tickets fetched', tickets);
  } catch (error) {
    next(error);
  }
};

exports.replyToTicket = async (req, res, next) => {
  try {
    const { adminReply, status } = req.body;
    const update = {};
    if (adminReply) {
      update.adminReply = adminReply;
      update.repliedAt = new Date();
    }
    if (status) update.status = status;

    const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('userId', 'name email phone');
    if (!ticket) return sendError(res, 404, 'Ticket not found');
    sendResponse(res, 200, 'Ticket updated', ticket);
  } catch (error) {
    next(error);
  }
};
