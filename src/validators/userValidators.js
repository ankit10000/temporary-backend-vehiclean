const { body, param, query } = require('express-validator');

exports.updateProfileRules = [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('phone').optional().matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit phone is required'),
  body('city').optional().trim().isLength({ min: 2, max: 50 }).withMessage('City must be 2-50 characters'),
];

exports.updateLocationRules = [
  body('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
];

exports.checkAvailabilityRules = [
  query('serviceId').isMongoId().withMessage('Valid service ID is required'),
  query('date').isISO8601().withMessage('Valid date is required'),
];

exports.markNotificationReadRules = [
  param('id').isMongoId().withMessage('Valid notification ID is required'),
];

exports.savePushTokenRules = [
  body('pushToken').notEmpty().withMessage('Push token is required'),
];
