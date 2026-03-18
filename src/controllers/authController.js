const User = require('../models/User');
const Partner = require('../models/Partner');
const Admin = require('../models/Admin');
const { generateToken } = require('../utils/jwt');
const { sendResponse, sendError } = require('../utils/response');

// User Register
exports.userRegister = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return sendError(res, 400, 'User with this email or phone already exists');
    }

    const user = await User.create({ name, email, phone, password });
    const token = generateToken({ id: user._id, role: 'user' });

    sendResponse(res, 201, 'Registration successful', {
      token,
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone, city: user.city, address: user.address },
    });
  } catch (error) {
    next(error);
  }
};

// User Login
exports.userLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, isDeleted: { $ne: true } });
    if (!user) {
      return sendError(res, 401, 'Invalid email or password');
    }

    if (user.isBlocked) {
      return sendError(res, 403, 'Your account has been blocked');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const token = generateToken({ id: user._id, role: 'user' });

    sendResponse(res, 200, 'Login successful', {
      token,
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone, avatar: user.avatar, city: user.city, address: user.address },
    });
  } catch (error) {
    next(error);
  }
};

// Partner Register
exports.partnerRegister = async (req, res, next) => {
  try {
    const { name, email, phone, password, city } = req.body;

    const existingPartner = await Partner.findOne({ $or: [{ email }, { phone }] });
    if (existingPartner) {
      return sendError(res, 400, 'Partner with this email or phone already exists');
    }

    const partner = await Partner.create({ name, email, phone, password, city });
    const token = generateToken({ id: partner._id, role: 'partner' });

    sendResponse(res, 201, 'Registration successful. Awaiting admin approval.', {
      token,
      partner: {
        id: partner._id,
        name: partner.name,
        email: partner.email,
        phone: partner.phone,
        status: partner.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Partner Login
exports.partnerLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const partner = await Partner.findOne({ email, isDeleted: { $ne: true } });
    if (!partner) {
      return sendError(res, 401, 'Invalid email or password');
    }

    if (!partner.isActive) {
      return sendError(res, 403, 'Your account has been suspended');
    }

    const isMatch = await partner.comparePassword(password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const token = generateToken({ id: partner._id, role: 'partner' });

    sendResponse(res, 200, 'Login successful', {
      token,
      partner: {
        id: partner._id,
        name: partner.name,
        email: partner.email,
        phone: partner.phone,
        status: partner.status,
        isOnline: partner.isOnline,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Admin Login
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const token = generateToken({ id: admin._id, role: 'admin' });

    sendResponse(res, 200, 'Login successful', {
      token,
      admin: { id: admin._id, email: admin.email, name: admin.name },
    });
  } catch (error) {
    next(error);
  }
};

// Change Password (any role)
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { id, role } = req.user;

    let user;
    if (role === 'user') user = await User.findById(id);
    else if (role === 'partner') user = await Partner.findById(id);
    else if (role === 'admin') user = await Admin.findById(id);

    if (!user) return sendError(res, 404, 'User not found');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return sendError(res, 400, 'Current password is incorrect');

    user.password = newPassword;
    await user.save();

    sendResponse(res, 200, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

// Forgot Password — sends OTP to email (simulated — logs OTP for now)
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email, role } = req.body;
    const userRole = role === 'partner' ? 'partner' : 'user';

    const Model = userRole === 'partner' ? Partner : User;
    const account = await Model.findOne({ email });

    if (!account) {
      return sendError(res, 404, 'No account found with this email');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    account.resetOtp = otp;
    account.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await account.save({ validateModifiedOnly: true });

    // TODO: Send OTP via email service (Nodemailer, SendGrid, etc.)
    console.log(`[Auth] Password reset OTP for ${email}: ${otp}`);

    sendResponse(res, 200, 'OTP sent to your email', { email });
  } catch (error) {
    next(error);
  }
};

// Reset Password — verify OTP and set new password
exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword, role } = req.body;
    const userRole = role === 'partner' ? 'partner' : 'user';

    const Model = userRole === 'partner' ? Partner : User;
    const account = await Model.findOne({
      email,
      resetOtp: otp,
      resetOtpExpires: { $gt: new Date() },
    });

    if (!account) {
      return sendError(res, 400, 'Invalid or expired OTP');
    }

    account.password = newPassword;
    account.resetOtp = undefined;
    account.resetOtpExpires = undefined;
    await account.save();

    sendResponse(res, 200, 'Password reset successful');
  } catch (error) {
    next(error);
  }
};

// Get Profile
exports.getProfile = async (req, res, next) => {
  try {
    sendResponse(res, 200, 'Profile fetched', req.profile);
  } catch (error) {
    next(error);
  }
};
