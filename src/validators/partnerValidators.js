const { body, param } = require('express-validator');

exports.toggleStatusRules = [
  body('isOnline').optional().isBoolean().withMessage('isOnline must be a boolean'),
];

exports.updateWorkingHoursRules = [
  body('start').matches(/^\d{2}:\d{2}$/).withMessage('Start must be HH:MM format'),
  body('end').matches(/^\d{2}:\d{2}$/).withMessage('End must be HH:MM format'),
];

exports.updateRadiusRules = [
  body('radius').isInt({ min: 1, max: 50 }).withMessage('Radius must be 1-50 km'),
];

exports.updateLocationRules = [
  body('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
];

exports.requestWithdrawalRules = [
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
];

exports.markNotificationReadRules = [
  param('id').isMongoId().withMessage('Valid notification ID is required'),
];
