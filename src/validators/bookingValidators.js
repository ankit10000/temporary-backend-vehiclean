const { body, param } = require('express-validator');

exports.createBookingRules = [
  body('carId').isMongoId().withMessage('Valid car ID is required'),
  body('serviceId').isMongoId().withMessage('Valid service ID is required'),
  body('slotDate').notEmpty().withMessage('Slot date is required'),
  body('slotTime').notEmpty().withMessage('Slot time is required'),
  body('address').notEmpty().withMessage('Address is required'),
];

exports.cancelBookingRules = [
  param('id').isMongoId().withMessage('Valid booking ID is required'),
];

exports.respondToBookingRules = [
  param('id').isMongoId().withMessage('Valid booking ID is required'),
  body('action').isIn(['accept', 'reject']).withMessage('Action must be accept or reject'),
];

exports.updateJobStatusRules = [
  param('id').isMongoId().withMessage('Valid booking ID is required'),
  body('status').isIn(['started', 'in_progress', 'completed']).withMessage('Invalid status'),
];

exports.validatePromoRules = [
  body('code').trim().notEmpty().withMessage('Promo code is required'),
  body('amount').isNumeric().withMessage('Amount must be a number'),
];
