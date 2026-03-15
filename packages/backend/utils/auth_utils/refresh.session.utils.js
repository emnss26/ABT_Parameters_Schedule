const jwt = require("jsonwebtoken")
const config = require("../../config")

const REFRESH_SESSION_COOKIE_NAME = "refresh_session"
const REFRESH_SESSION_TTL_MS = 24 * 60 * 60 * 1000
const REFRESH_SESSION_TOKEN_TYPE = "refresh-session"

const toInt = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

const getRefreshSessionSecret = () => {
  const secret = String(process.env.SESSION_COOKIE_SECRET || config.aps.clientSecret || "").trim()
  if (!secret) throw new Error("Missing refresh session secret")
  return secret
}

const buildRefreshSessionPayload = (sessionStartedAt = Date.now(), absoluteExpiresAt = 0) => {
  const safeStartedAt = toInt(sessionStartedAt) || Date.now()
  const safeAbsoluteExpiresAt =
    toInt(absoluteExpiresAt) > safeStartedAt
      ? toInt(absoluteExpiresAt)
      : safeStartedAt + REFRESH_SESSION_TTL_MS

  return {
    typ: REFRESH_SESSION_TOKEN_TYPE,
    sessionStartedAt: safeStartedAt,
    absoluteExpiresAt: safeAbsoluteExpiresAt,
  }
}

const signRefreshSessionPayload = (payload) =>
  jwt.sign(payload, getRefreshSessionSecret(), {
    algorithm: "HS256",
  })

const issueRefreshSession = ({ sessionStartedAt, absoluteExpiresAt } = {}) => {
  const payload = buildRefreshSessionPayload(sessionStartedAt, absoluteExpiresAt)
  return {
    payload,
    token: signRefreshSessionPayload(payload),
  }
}

const verifyRefreshSession = (token) => {
  const payload = jwt.verify(String(token || ""), getRefreshSessionSecret(), {
    algorithms: ["HS256"],
  })

  if (!payload || payload.typ !== REFRESH_SESSION_TOKEN_TYPE) {
    throw new Error("Invalid refresh session payload")
  }

  const absoluteExpiresAt = toInt(payload.absoluteExpiresAt)
  const sessionStartedAt = toInt(payload.sessionStartedAt)

  if (!absoluteExpiresAt || !sessionStartedAt || absoluteExpiresAt <= sessionStartedAt) {
    throw new Error("Invalid refresh session window")
  }

  if (absoluteExpiresAt <= Date.now()) {
    throw new Error("Refresh session expired")
  }

  return {
    typ: REFRESH_SESSION_TOKEN_TYPE,
    sessionStartedAt,
    absoluteExpiresAt,
  }
}

const getRemainingRefreshSessionMs = (payload) => {
  const absoluteExpiresAt = toInt(payload?.absoluteExpiresAt)
  if (!absoluteExpiresAt) return 0
  return Math.max(0, absoluteExpiresAt - Date.now())
}

module.exports = {
  REFRESH_SESSION_COOKIE_NAME,
  REFRESH_SESSION_TTL_MS,
  getRemainingRefreshSessionMs,
  issueRefreshSession,
  verifyRefreshSession,
}
