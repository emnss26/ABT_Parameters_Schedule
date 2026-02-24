const axios = require("axios")

const APS_BASE =
  process.env.AUTODESK_BASE_URL || "https://developer.api.autodesk.com"

const GetUserProfile = async (req, res, next) => {
  try {
    const token = req.cookies?.access_token

    if (!token) {
      const err = new Error("Missing access token")
      err.status = 401
      err.code = "Unauthorized"
      return next(err)
    }

    const { data } = await axios.get(`${APS_BASE}/userprofile/v1/users/@me`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    const name =
      data.displayName ||
      data.userName ||
      `${data.firstName || ""} ${data.lastName || ""}`.trim()

    const payload = {
      id: data.userId || data.uid || null,
      email: data.emailId || data.email || null,
      name: name || null,
    }

    // Prevent caching sensitive profile data
    res.set("Cache-Control", "no-store")

    return res.status(200).json({
      success: true,
      message: "User profile retrieved",
      data: payload,
      error: null,
    })
  } catch (err) {
    const status = err?.response?.status || 500

    if (status === 401) {
      err.status = 401
      err.code = "Unauthorized"
      err.message = "Token expired or invalid"
      return next(err)
    }

    err.code = err.code || "ProfileFetchFailed"
    return next(err)
  }
}

module.exports = { GetUserProfile }
