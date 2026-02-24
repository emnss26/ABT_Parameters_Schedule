const jwt = require("jsonwebtoken")
const axios = require("axios")
const config = require("../config")
const { verifyAPSToken } = require("../utils/auth_utils/jwt.utils")

async function checkSession(req, res, next) {
  const accessToken = req.cookies?.access_token
  const refreshToken = req.cookies?.refresh_token

  if (!accessToken && !refreshToken) {
    return res.status(401).json({ message: "No active session. Please log in." })
  }

  try {
    // If access token exists and is not about to expire, proceed.
    if (accessToken) {
      try {
        const decoded = await verifyAPSToken(accessToken)

        if (decoded?.exp) {
          const now = Math.floor(Date.now() / 1000)
          const safetyMarginSeconds = 10

          if (decoded.exp > now + safetyMarginSeconds) {
            req.user = decoded
            return next()
          }
        }
      } catch (tokenError) {
        // Token inválido o expirado, intentar refresh
        console.log("Access token invalid:", tokenError.message)
      }
    }

    // Access token missing/expired: attempt refresh using refresh token.
    if (refreshToken) {
      console.log("Session: Token expired or missing. Attempting refresh...")

      const params = new URLSearchParams()
      params.append("client_id", config.aps.clientId)
      params.append("client_secret", config.aps.clientSecret)
      params.append("grant_type", "refresh_token")
      params.append("refresh_token", refreshToken)

      const response = await axios.post(
        `${config.aps.baseUrl}/authentication/v2/token`,
        params,
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      )

      const { access_token: newAccessToken, refresh_token: newRefreshToken } = response.data

      const isProduction = process.env.NODE_ENV === "production"
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "None" : "Lax",
        path: "/",
      }

      res.cookie("access_token", newAccessToken, { ...cookieOptions, maxAge: 3600000 })

      if (newRefreshToken) {
        res.cookie("refresh_token", newRefreshToken, cookieOptions)
      }

      // Ensure downstream handlers use the fresh tokens within this same request.
      req.cookies.access_token = newAccessToken
      if (newRefreshToken) req.cookies.refresh_token = newRefreshToken

      req.user = await verifyAPSToken(newAccessToken)
      return next()
    }

    return res.status(401).json({ message: "Session expired. Please log in again." })
  } catch (err) {
    console.error("Session Refresh Failed:", err.response?.data || err.message)

    res.clearCookie("access_token")
    res.clearCookie("refresh_token")

    return res.status(401).json({ message: "Invalid session. Please log in." })
  }
}

module.exports = checkSession
