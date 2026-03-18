const { body, param } = require('express-validator');

exports.createReviewRules = [
  body('bookingId').isMongoId().withMessage('Valid booking ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('comment').optional().isLength({ max: 500 }).withMessage('Comment max 500 characters'),
];
