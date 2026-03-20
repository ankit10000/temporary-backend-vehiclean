const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  listFAQs,
  adminListFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  createTicket,
  listUserTickets,
  getTicketById,
  adminListTickets,
  replyToTicket,
} = require('../controllers/supportController');

// Public FAQ
router.get('/faqs', listFAQs);

// User support tickets
router.post('/tickets', protect, authorize('user'), createTicket);
router.get('/tickets/me', protect, authorize('user'), listUserTickets);
router.get('/tickets/:id', protect, getTicketById);

// Admin FAQ CRUD
router.get('/admin/faqs', protect, authorize('admin'), adminListFAQs);
router.post('/admin/faqs', protect, authorize('admin'), createFAQ);
router.put('/admin/faqs/:id', protect, authorize('admin'), updateFAQ);
router.delete('/admin/faqs/:id', protect, authorize('admin'), deleteFAQ);

// Admin ticket management
router.get('/admin/tickets', protect, authorize('admin'), adminListTickets);
router.patch('/admin/tickets/:id', protect, authorize('admin'), replyToTicket);

module.exports = router;
