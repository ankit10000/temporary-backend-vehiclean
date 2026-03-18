const express = require('express');
const router = express.Router();
const { getServices, getServiceById } = require('../controllers/serviceController');

router.get('/', getServices);
router.get('/:id', getServiceById);

module.exports = router;
