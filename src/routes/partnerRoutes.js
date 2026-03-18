const express = require('express');
const router = express.Router();
const {
  toggleStatus,
  updateWorkingHours,
  updateRadius,
  updateLocation,
  updateProfile,
  uploadDocuments,
  submitKYC,
  getEarnings,
  getEarningsSummary,
  requestWithdrawal,
  getWithdrawals,
  getNotifications,
  markNotificationRead,
  savePushToken,
} = require('../controllers/partnerController');
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const validate = require('../middleware/validate');
const {
  toggleStatusRules,
  updateWorkingHoursRules,
  updateRadiusRules,
  updateLocationRules,
  requestWithdrawalRules,
  markNotificationReadRules,
} = require('../validators/partnerValidators');

router.use(protect, authorize('partner'));

router.patch('/toggle-status', toggleStatusRules, validate, toggleStatus);
router.patch('/working-hours', updateWorkingHoursRules, validate, updateWorkingHours);
router.patch('/radius', updateRadiusRules, validate, updateRadius);
router.patch('/location', updateLocationRules, validate, updateLocation);
router.patch('/profile', updateProfile);
router.post('/documents', upload.any(), uploadDocuments);
router.post('/documents/submit', submitKYC);
router.get('/earnings', getEarnings);
router.get('/earnings/summary', getEarningsSummary);
router.post('/withdrawals', requestWithdrawalRules, validate, requestWithdrawal);
router.get('/withdrawals', getWithdrawals);
router.post('/push-token', savePushToken);
router.get('/notifications', getNotifications);
router.patch('/notifications/:id/read', markNotificationReadRules, validate, markNotificationRead);

module.exports = router;
