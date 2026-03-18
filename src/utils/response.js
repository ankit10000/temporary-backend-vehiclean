const sendResponse = (res, statusCode, message, data = null) => {
  const response = { success: statusCode < 400, message };
  if (data !== null) response.data = data;
  return res.status(statusCode).json(response);
};

const sendError = (res, statusCode, message, errors = null) => {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

module.exports = { sendResponse, sendError };
