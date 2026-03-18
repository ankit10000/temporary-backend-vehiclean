const { body, param } = require('express-validator');

exports.updatePartnerStatusRules = [
  param('id').isMongoId().withMessage('Valid partner ID is required'),
  body('status').isIn(['approved', 'rejected', 'suspended']).withMessage('Invalid status'),
];

exports.updatePartnerCommissionRules = [
  param('id').isMongoId().withMessage('Valid partner ID is required'),
  body('commission').isFloat({ min: 0, max: 100 }).withMessage('Commission must be 0-100'),
];

exports.createServiceRules = [
  body('name').trim().notEmpty().withMessage('Service name is required'),
  body('price').isFloat({ gt: 0 }).withMessage('Price must be greater than 0'),
  body('category').trim().notEmpty().withMessage('Category is required'),
];

exports.createPromoRules = [
  body('code').trim().notEmpty().withMessage('Promo code is required'),
  body('discountType').isIn(['percentage', 'flat']).withMessage('Invalid discount type'),
  body('discountValue').isFloat({ gt: 0 }).withMessage('Discount value must be greater than 0'),
];

exports.assignPartnerRules = [
  param('id').isMongoId().withMessage('Valid booking ID is required'),
  body('partnerId').isMongoId().withMessage('Valid partner ID is required'),
];

exports.updateWithdrawalRules = [
  param('id').isMongoId().withMessage('Valid withdrawal ID is required'),
  body('status').isIn(['approved', 'rejected', 'paid']).withMessage('Status must be approved, rejected or paid'),
];

exports.updatePartnerBookingLimitsRules = [
  param('id').isMongoId().withMessage('Valid partner ID is required'),
  body('minBookings').isInt({ min: 0 }).withMessage('minBookings must be an integer >= 0'),
  body('maxBookings').isInt({ min: 1 }).withMessage('maxBookings must be an integer >= 1'),
];

exports.verifyPartnerDocumentRules = [
  param('id').isMongoId().withMessage('Valid partner ID is required'),
  param('docType').isIn(['aadhaar', 'pan', 'bankDetails', 'photo', 'drivingLicense']).withMessage('Invalid document type'),
  body('status').isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected'),
  body('rejectionReason')
    .if(body('status').equals('rejected'))
    .trim()
    .notEmpty()
    .withMessage('Rejection reason is required when rejecting a document'),
];

exports.sendNotificationRules = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('body').trim().notEmpty().withMessage('Body is required'),
  body('targetType').isIn(['all', 'user', 'partner']).withMessage('Invalid target type'),
];
