const jwt = require("jsonwebtoken");
const axios = require("axios");

const APS_BASE_URL = process.env.AUTODESK_BASE_URL || "https://developer.api.autodesk.com";
const TRUSTED_JWT_ALGORITHMS = new Set(["RS256"]);
const TOKEN_VALIDATION_CACHE = new Map();
const MAX_CACHE_TTL_SECONDS = 5 * 60;
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

const toText = (value) => String(value ?? "").trim();
const nowInSeconds = () => Math.floor(Date.now() / 1000);

const buildTokenError = (message, { code = "TokenInvalid", status = 401, cause = null } = {}) => {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (cause) error.cause = cause;
  return error;
};

const getCachedPayload = (token) => {
  const cached = TOKEN_VALIDATION_CACHE.get(token);
  if (!cached) return null;
  if (cached.expiresAt <= nowInSeconds()) {
    TOKEN_VALIDATION_CACHE.delete(token);
    return null;
  }
  return cached.payload;
};

const cachePayload = (token, payload) => {
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp) || exp <= 0) return;

  const ttlSeconds = Math.min(MAX_CACHE_TTL_SECONDS, Math.max(exp - nowInSeconds() - 30, 0));
  if (ttlSeconds <= 0) return;

  TOKEN_VALIDATION_CACHE.set(token, {
    payload,
    expiresAt: nowInSeconds() + ttlSeconds,
  });
};

const fetchApsUserProfile = async (token) => {
  const { data } = await axios.get(`${APS_BASE_URL}/userprofile/v1/users/@me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data || {};
};

const decodeJwtPayload = (token) => {
  const decodedToken = jwt.decode(token, { complete: true });
  const payload = decodedToken?.payload;
  const header = decodedToken?.header;

  if (!payload || typeof payload !== "object") {
    throw buildTokenError("Invalid token format");
  }

  const algorithm = toText(header?.alg);
  if (algorithm && !TRUSTED_JWT_ALGORITHMS.has(algorithm)) {
    throw buildTokenError("Unsupported token algorithm");
  }

  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp)) {
    throw buildTokenError("Token is missing expiration");
  }

  if (exp <= nowInSeconds()) {
    throw buildTokenError("Token has expired", { code: "TokenExpired", status: 401 });
  }

  return {
    payload,
    decodedSub: toText(payload?.sub),
  };
};

const buildValidatedPayload = (payload = {}, profile = {}) => {
  const profileUserId = toText(profile?.userId || profile?.uid);
  const decodedSub = toText(payload?.sub);

  if (decodedSub && profileUserId && decodedSub !== profileUserId) {
    throw buildTokenError("Token subject mismatch");
  }

  return {
    ...payload,
    sub: decodedSub || profileUserId || null,
    email: payload?.email || profile?.emailId || profile?.email || null,
    name:
      payload?.name ||
      profile?.displayName ||
      profile?.userName ||
      `${toText(profile?.firstName)} ${toText(profile?.lastName)}`.trim() ||
      null,
  };
};

const isTransientUpstreamError = (error) => {
  const upstreamStatus = Number(error?.response?.status);
  if (upstreamStatus >= 500 && upstreamStatus < 600) return true;

  const networkCode = toText(error?.code).toUpperCase();
  if (TRANSIENT_NETWORK_ERROR_CODES.has(networkCode)) return true;

  return Boolean(!upstreamStatus && error?.request);
};

const decodeIssuedApsTokenPayload = (token) => {
  const rawToken = toText(token);
  if (!rawToken) {
    throw buildTokenError("Missing token", { code: "MissingToken", status: 401 });
  }

  const { payload } = decodeJwtPayload(rawToken);
  const validatedPayload = buildValidatedPayload(payload, {
    userId: payload?.sub,
    emailId: payload?.email,
    displayName: payload?.name,
  });

  return validatedPayload;
};

/**
 * Validates an APS access token against Autodesk and only trusts a decoded
 * payload after the token was accepted by APS userprofile.
 *
 * @param {string} token
 * @returns {Promise<Object>}
 */
async function verifyAPSToken(token) {
  const rawToken = toText(token);
  if (!rawToken) {
    throw buildTokenError("Missing token", { code: "MissingToken", status: 401 });
  }

  const cachedPayload = getCachedPayload(rawToken);
  if (cachedPayload) return cachedPayload;

  try {
    const { payload } = decodeJwtPayload(rawToken);
    const profile = await fetchApsUserProfile(rawToken);
    const validatedPayload = buildValidatedPayload(payload, profile);
    cachePayload(rawToken, validatedPayload);
    return validatedPayload;
  } catch (error) {
    if (error?.code === "TokenExpired" || error?.code === "TokenInvalid") {
      throw error;
    }

    const upstreamStatus = Number(error?.response?.status);
    if (upstreamStatus === 401 || upstreamStatus === 403) {
      throw buildTokenError("Invalid token", { code: "TokenInvalid", status: 401, cause: error });
    }

    if (isTransientUpstreamError(error)) {
      throw buildTokenError("Token validation temporarily unavailable", {
        code: "TokenValidationUnavailable",
        status: 503,
        cause: error,
      });
    }

    throw buildTokenError(`Invalid token: ${error.message}`, {
      code: "TokenInvalid",
      status: 401,
      cause: error,
    });
  }
}

module.exports = { verifyAPSToken, decodeIssuedApsTokenPayload };
