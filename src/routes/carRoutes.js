const express = require('express');
const router = express.Router();
const { addCar, getUserCars, deleteCar, updateCar } = require('../controllers/carController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('user'));

router.route('/').get(getUserCars).post(addCar);
router.route('/:id').put(updateCar).delete(deleteCar);

module.exports = router;
