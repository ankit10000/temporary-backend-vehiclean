const express = require('express');
const router = express.Router();
const {
  userRegister,
  userLogin,
  partnerRegister,
  partnerLogin,
  adminLogin,
  changePassword,
  getProfile,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { protect, attachUser } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  userRegisterRules,
  loginRules,
  partnerRegisterRules,
  changePasswordRules,
  forgotPasswordRules,
  resetPasswordRules,
} = require('../validators/authValidators');

// User auth
router.post('/user/register', userRegisterRules, validate, userRegister);
router.post('/user/login', loginRules, validate, userLogin);

// Partner auth
router.post('/partner/register', partnerRegisterRules, validate, partnerRegister);
router.post('/partner/login', loginRules, validate, partnerLogin);

// Admin auth
router.post('/admin/login', loginRules, validate, adminLogin);

// Password reset (public)
router.post('/forgot-password', forgotPasswordRules, validate, forgotPassword);
router.post('/reset-password', resetPasswordRules, validate, resetPassword);

// Protected routes
router.post('/change-password', protect, changePasswordRules, validate, changePassword);
router.get('/profile', protect, attachUser, getProfile);

module.exports = router;
