const Banner = require('../models/Banner');
const { sendResponse } = require('../utils/response');

exports.getActiveBanners = async (req, res, next) => {
  try {
    const { type } = req.query;
    const filter = { isActive: true };
    if (type) filter.type = type;
    const banners = await Banner.find(filter)
      .populate('serviceId', 'name price')
      .sort('-createdAt')
      .limit(50)
      .lean();
    sendResponse(res, 200, 'Banners fetched', banners);
  } catch (error) {
    next(error);
  }
};
