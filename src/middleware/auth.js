const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');
const User = require('../models/User');
const Partner = require('../models/Partner');
const Admin = require('../models/Admin');

const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return sendError(res, 401, 'Not authorized, no token');
    }

    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return sendError(res, 401, 'Not authorized, token invalid');
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return sendError(res, 403, 'Not authorized for this action');
    }
    next();
  };
};

const attachUser = async (req, res, next) => {
  try {
    const { id, role } = req.user;
    let user;

    if (role === 'user') {
      user = await User.findById(id).select('-password');
    } else if (role === 'partner') {
      user = await Partner.findById(id).select('-password');
    } else if (role === 'admin') {
      user = await Admin.findById(id).select('-password');
    }

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    if (user.isDeleted) {
      return sendError(res, 403, 'Your account has been deactivated');
    }

    if (role === 'user' && user.isBlocked) {
      return sendError(res, 403, 'Your account has been blocked');
    }

    req.profile = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { protect, authorize, attachUser };
