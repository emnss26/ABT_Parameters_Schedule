function checkGlobalResetAccess(req, res, next) {
  const providedKey = String(req.headers["x-reset-key"] || "").trim();
  const expectedKey = String(process.env.GLOBAL_RESET_KEY || "").trim();

  if (!expectedKey) {
    return res.status(403).json({
      success: false,
      message: "Global reset is disabled",
      data: null,
      error: { code: "GlobalResetDisabled" },
    });
  }

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(403).json({
      success: false,
      message: "Invalid reset key",
      data: null,
      error: { code: "InvalidResetKey" },
    });
  }

  return next();
}

module.exports = checkGlobalResetAccess;
