const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { upload } = require('../config/cloudinary');
const { updateProfileRules, updateLocationRules, checkAvailabilityRules, markNotificationReadRules, savePushTokenRules } = require('../validators/userValidators');
const { updateLocation, updateProfile, updateBankDetails, checkAvailability, getNotifications, markNotificationRead, savePushToken, uploadAvatar, deleteAccount, listAddresses, addAddress, updateAddress, deleteAddress } = require('../controllers/userController');

router.put('/profile', protect, authorize('user'), updateProfileRules, validate, updateProfile);
router.put('/avatar', protect, authorize('user'), upload.single('avatar'), uploadAvatar);
router.put('/location', protect, authorize('user'), updateLocationRules, validate, updateLocation);
router.get('/check-availability', protect, authorize('user'), checkAvailabilityRules, validate, checkAvailability);
router.post('/push-token', protect, authorize('user'), savePushTokenRules, validate, savePushToken);
router.patch('/bank-details', protect, authorize('user'), updateBankDetails);
router.get('/notifications', protect, authorize('user'), getNotifications);
router.patch('/notifications/:id/read', protect, authorize('user'), markNotificationReadRules, validate, markNotificationRead);
router.delete('/account', protect, authorize('user'), deleteAccount);

// Address book
router.get('/addresses', protect, authorize('user'), listAddresses);
router.post('/addresses', protect, authorize('user'), addAddress);
router.put('/addresses/:addressId', protect, authorize('user'), updateAddress);
router.delete('/addresses/:addressId', protect, authorize('user'), deleteAddress);

module.exports = router;
