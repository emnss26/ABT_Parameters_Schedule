const config = require("../config");

function errorHandler(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;
  const isProduction = config.env === "production";

  console.error("API ERROR");
  console.error("URL:", req.method, req.originalUrl);
  console.error("STATUS:", statusCode);
  console.error("CODE:", err.code);
  console.error("MESSAGE:", err.message);
  console.error("STACK:\n", err.stack);

  if (res.headersSent) return next(err);

  const clientMessage = isProduction ? "Internal Server Error" : err.message || "Request failed";
  const clientError = {
    code: err.code || (statusCode >= 500 ? "INTERNAL_ERROR" : null),
  };

  if (!isProduction && err.name) {
    clientError.name = err.name;
  }

  if (!isProduction && err.details !== undefined) {
    clientError.details = err.details;
  }

  res.status(statusCode).json({
    success: false,
    message: clientMessage,
    data: null,
    error: clientError,
  });
}

module.exports = errorHandler;
