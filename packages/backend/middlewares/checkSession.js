const axios = require("axios")
const config = require("../config")
const { verifyAPSToken } = require("../utils/auth_utils/jwt.utils")
const {
  REFRESH_SESSION_COOKIE_NAME,
  getRemainingRefreshSessionMs,
  verifyRefreshSession,
} = require("../utils/auth_utils/refresh.session.utils")

const buildCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production"

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
    path: "/",
  }
}

const buildAccessTokenMaxAge = (remainingRefreshSessionMs) =>
  Math.min(60 * 60 * 1000, Math.max(Number(remainingRefreshSessionMs) || 0, 0))

const clearSessionCookies = (res, cookieOptions) => {
  res.clearCookie("access_token", cookieOptions)
  res.clearCookie("refresh_token", cookieOptions)
  res.clearCookie(REFRESH_SESSION_COOKIE_NAME, cookieOptions)
}

async function checkSession(req, res, next) {
  const accessToken = req.cookies?.access_token
  const refreshToken = req.cookies?.refresh_token
  const refreshSessionToken = req.cookies?.[REFRESH_SESSION_COOKIE_NAME]
  const cookieOptions = buildCookieOptions()

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
        // Access token is invalid or expired; continue with refresh flow.
      }
    }

    // Access token missing/expired: attempt refresh using refresh token.
    if (refreshToken) {
      if (!refreshSessionToken) {
        clearSessionCookies(res, cookieOptions)
        return res.status(401).json({ message: "Session expired. Please log in again." })
      }

      const refreshSession = verifyRefreshSession(refreshSessionToken)
      const remainingRefreshSessionMs = getRemainingRefreshSessionMs(refreshSession)
      if (remainingRefreshSessionMs <= 0) {
        clearSessionCookies(res, cookieOptions)
        return res.status(401).json({ message: "Session expired. Please log in again." })
      }

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

      res.cookie("access_token", newAccessToken, {
        ...cookieOptions,
        maxAge: buildAccessTokenMaxAge(remainingRefreshSessionMs),
      })

      const effectiveRefreshToken = newRefreshToken || refreshToken
      res.cookie("refresh_token", effectiveRefreshToken, {
        ...cookieOptions,
        maxAge: remainingRefreshSessionMs,
      })
      res.cookie(REFRESH_SESSION_COOKIE_NAME, refreshSessionToken, {
        ...cookieOptions,
        maxAge: remainingRefreshSessionMs,
      })

      // Ensure downstream handlers use the fresh tokens within this same request.
      req.cookies.access_token = newAccessToken
      req.cookies.refresh_token = effectiveRefreshToken
      req.cookies[REFRESH_SESSION_COOKIE_NAME] = refreshSessionToken

      req.user = await verifyAPSToken(newAccessToken)
      return next()
    }

    return res.status(401).json({ message: "Session expired. Please log in again." })
  } catch (err) {
    console.error("Session Refresh Failed:", err.response?.data || err.message)

    clearSessionCookies(res, cookieOptions)

    return res.status(401).json({ message: "Invalid session. Please log in." })
  }
}

module.exports = checkSession


