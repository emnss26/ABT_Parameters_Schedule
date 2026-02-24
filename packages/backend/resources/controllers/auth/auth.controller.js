const axios = require("axios")

const {
  GetAPSThreeLeggedToken,
  GetAPSToken,
} = require("../../../utils/auth_utils/auth.utils")

const frontendUrl = process.env.FRONTEND_URL

const buildCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production"

  return {
    httpOnly: true,
    secure: isProduction, // HTTPS required in production
    sameSite: isProduction ? "None" : "Lax", // allow cross-site cookies in prod
    path: "/",
  }
}

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

    res.cookie("access_token", token.access_token, {
      ...cookieOptions,
      maxAge: 60 * 60 * 1000, // 1h
    })

    res.cookie("refresh_token", token.refresh_token, cookieOptions)

    console.log("Three-legged token set in cookies.")

    return res.redirect(`${frontendUrl}/aec-projects`)
  } catch (err) {
    err.code = err.code || "TokenRetrievalFailed"
    return next(err)
  }
}

const GetToken = async (req, res, next) => {
  try {
    const token = await GetAPSToken()

    if (!token) {
      const err = new Error("Failed to retrieve APS token")
      err.status = 500
      err.code = "TokenRetrievalFailed"
      return next(err)
    }

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
