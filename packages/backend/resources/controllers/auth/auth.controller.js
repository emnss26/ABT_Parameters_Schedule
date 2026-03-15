const {
  GetAPSThreeLeggedToken,
  GetAPSToken,
} = require("../../../utils/auth_utils/auth.utils")
const {
  REFRESH_SESSION_COOKIE_NAME,
  getRemainingRefreshSessionMs,
  issueRefreshSession,
} = require("../../../utils/auth_utils/refresh.session.utils")

const frontendUrl = process.env.FRONTEND_URL
const VIEWER_FRONTEND_TOKEN_SCOPE = "viewables:read data:read"

const buildCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production"

  return {
    httpOnly: true,
    secure: isProduction, // HTTPS required in production
    sameSite: isProduction ? "None" : "Lax", // allow cross-site cookies in prod
    path: "/",
  }
}

const buildAccessTokenMaxAge = (remainingRefreshSessionMs) =>
  Math.min(60 * 60 * 1000, Math.max(Number(remainingRefreshSessionMs) || 0, 0))

const GetThreeLegged = async (req, res, next) => {
  const { code } = req.query

  if (!code) {
    const err = new Error("Authorization code is required")
    err.status = 400
    err.code = "ValidationError"
    return next(err)
  }

  try {
    const token = await GetAPSThreeLeggedToken(code)

    if (!token) {
      const err = new Error("Failed to retrieve APS token")
      err.status = 500
      err.code = "TokenRetrievalFailed"
      return next(err)
    }

    const cookieOptions = buildCookieOptions()
    const refreshSession = issueRefreshSession()
    const refreshSessionMaxAge = getRemainingRefreshSessionMs(refreshSession.payload)

    res.cookie("access_token", token.access_token, {
      ...cookieOptions,
      maxAge: buildAccessTokenMaxAge(refreshSessionMaxAge),
    })

    if (token.refresh_token) {
      res.cookie("refresh_token", token.refresh_token, {
        ...cookieOptions,
        maxAge: refreshSessionMaxAge,
      })
    }
    res.cookie(REFRESH_SESSION_COOKIE_NAME, refreshSession.token, {
      ...cookieOptions,
      maxAge: refreshSessionMaxAge,
    })

    return res.redirect(`${frontendUrl}/aec-projects`)
  } catch (err) {
    err.code = err.code || "TokenRetrievalFailed"
    return next(err)
  }
}

const GetToken = async (req, res, next) => {
  try {
    const token = await GetAPSToken({ scope: VIEWER_FRONTEND_TOKEN_SCOPE })

    if (!token) {
      const err = new Error("Failed to retrieve APS token")
      err.status = 500
      err.code = "TokenRetrievalFailed"
      return next(err)
    }

    res.set("Cache-Control", "no-store")

    return res.status(200).json({
      success: true,
      message: "Token generated correctly",
      data: { access_token: token },
      error: null,
    })
  } catch (err) {
    err.code = err.code || "TokenError"
    return next(err)
  }
}

const PostLogout = async (req, res, next) => {
  try {
    const cookieOptions = buildCookieOptions()

    // Keep behavior compatible: in production this clears secure/None cookies;
    // in dev it clears Lax/non-secure cookies as well.
    res.clearCookie("access_token", cookieOptions)
    res.clearCookie("refresh_token", cookieOptions)
    res.clearCookie(REFRESH_SESSION_COOKIE_NAME, cookieOptions)

    return res.status(200).json({
      success: true,
      message: "Logged out",
      data: null,
      error: null,
    })
  } catch (err) {
    err.code = err.code || "LogoutError"
    return next(err)
  }
}

module.exports = {
  GetThreeLegged,
  GetToken,
  PostLogout,
}

