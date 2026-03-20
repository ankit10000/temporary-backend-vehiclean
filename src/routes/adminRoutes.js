const express = require('express');
const router = express.Router();
const admin = require('../controllers/adminController');
const product = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const validate = require('../middleware/validate');
const {
  updatePartnerStatusRules,
  updatePartnerCommissionRules,
  updatePartnerBookingLimitsRules,
  verifyPartnerDocumentRules,
  createServiceRules,
  createPromoRules,
  assignPartnerRules,
  updateWithdrawalRules,
  sendNotificationRules,
} = require('../validators/adminValidators');

router.use(protect, authorize('admin'));

// Dashboard
router.get('/dashboard', admin.getDashboardStats);
router.get('/analytics', admin.getAnalytics);

// Users
router.get('/users', admin.getUsers);
router.patch('/users/:id/toggle-block', admin.toggleBlockUser);
router.delete('/users/:id', admin.deleteUser);

// Partners
router.get('/partners', admin.getPartners);
router.get('/partners/:id', admin.getPartnerById);
router.patch('/partners/:id/status', updatePartnerStatusRules, validate, admin.updatePartnerStatus);
router.patch('/partners/:id/commission', updatePartnerCommissionRules, validate, admin.updatePartnerCommission);
router.patch('/partners/:id/booking-limits', updatePartnerBookingLimitsRules, validate, admin.updatePartnerBookingLimits);
router.patch('/partners/:id/documents/:docType/verify', verifyPartnerDocumentRules, validate, admin.verifyPartnerDocument);

// Services
router.get('/services', admin.getAllServices);
router.post('/services', createServiceRules, validate, admin.createService);
router.put('/services/:id', admin.updateService);
router.delete('/services/:id', admin.deleteService);

// Promo Codes
router.get('/promos', admin.getPromos);
router.post('/promos', createPromoRules, validate, admin.createPromo);
router.put('/promos/:id', admin.updatePromo);
router.delete('/promos/:id', admin.deletePromo);

// Banners
router.get('/banners', admin.getBanners);
router.post('/banners', upload.single('image'), admin.createBanner);
router.put('/banners/:id', upload.single('image'), admin.updateBanner);
router.delete('/banners/:id', admin.deleteBanner);

// Bookings
router.get('/bookings', admin.getAllBookings);
router.patch('/bookings/:id/assign', assignPartnerRules, validate, admin.assignPartner);
router.patch('/bookings/:id/cancel', admin.adminCancelBooking);

// Refunds
router.get('/refunds', admin.getRefunds);
router.patch('/refunds/:id', admin.processRefund);

// Payments
router.get('/payments', admin.getAllPayments);

// Withdrawals
router.get('/withdrawals', admin.getWithdrawals);
router.patch('/withdrawals/:id', updateWithdrawalRules, validate, admin.updateWithdrawal);

// Notifications
router.get('/notifications', admin.getNotifications);
router.post('/notifications', sendNotificationRules, validate, admin.sendNotification);

// Slots
router.get('/slots', admin.getSlots);
router.post('/slots', admin.updateSlot);

// Products
router.get('/products', product.getProductsAdmin);
router.post('/products', product.createProduct);
router.put('/products/:id', product.updateProduct);
router.delete('/products/:id', product.deleteProduct);

// Reviews
router.get('/reviews', admin.getReviews);
router.delete('/reviews/:id', admin.deleteReview);

// Settings
router.get('/settings', admin.getSettings);
router.patch('/settings', admin.updateSettings);

module.exports = router;
