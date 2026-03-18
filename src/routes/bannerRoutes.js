const express = require('express');
const router = express.Router();
const { getActiveBanners } = require('../controllers/bannerController');

router.get('/', getActiveBanners);

module.exports = router;
