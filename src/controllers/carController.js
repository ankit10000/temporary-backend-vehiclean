const Car = require('../models/Car');
const { sendResponse, sendError } = require('../utils/response');

exports.addCar = async (req, res, next) => {
  try {
    const car = await Car.create({ ...req.body, userId: req.user.id });
    sendResponse(res, 201, 'Car added successfully', car);
  } catch (error) {
    next(error);
  }
};

exports.getUserCars = async (req, res, next) => {
  try {
    const cars = await Car.find({ userId: req.user.id }).sort('-createdAt').limit(20).lean();
    sendResponse(res, 200, 'Cars fetched', cars);
  } catch (error) {
    next(error);
  }
};

exports.deleteCar = async (req, res, next) => {
  try {
    const car = await Car.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!car) return sendError(res, 404, 'Car not found');
    sendResponse(res, 200, 'Car deleted successfully');
  } catch (error) {
    next(error);
  }
};

exports.updateCar = async (req, res, next) => {
  try {
    const car = await Car.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!car) return sendError(res, 404, 'Car not found');
    sendResponse(res, 200, 'Car updated successfully', car);
  } catch (error) {
    next(error);
  }
};
