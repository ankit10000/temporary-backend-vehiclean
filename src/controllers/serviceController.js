const Service = require('../models/Service');
const { sendResponse, sendError } = require('../utils/response');

exports.getServices = async (req, res, next) => {
  try {
    const { category } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    const services = await Service.find(filter).sort('name').limit(100).lean();
    sendResponse(res, 200, 'Services fetched', services);
  } catch (error) {
    next(error);
  }
};

exports.getServiceById = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return sendError(res, 404, 'Service not found');
    sendResponse(res, 200, 'Service fetched', service);
  } catch (error) {
    next(error);
  }
};
