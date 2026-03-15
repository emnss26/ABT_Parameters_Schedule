const jwt = require("jsonwebtoken");
const axios = require("axios");

const APS_BASE_URL = process.env.AUTODESK_BASE_URL || "https://developer.api.autodesk.com";
const TRUSTED_JWT_ALGORITHMS = new Set(["RS256"]);
const TOKEN_VALIDATION_CACHE = new Map();
const MAX_CACHE_TTL_SECONDS = 5 * 60;

const toText = (value) => String(value ?? "").trim();
const nowInSeconds = () => Math.floor(Date.now() / 1000);

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
    throw new Error("Missing token");
  }

  const cachedPayload = getCachedPayload(rawToken);
  if (cachedPayload) return cachedPayload;

  try {
    const decodedToken = jwt.decode(rawToken, { complete: true });
    const payload = decodedToken?.payload;
    const header = decodedToken?.header;

    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid token format");
    }

    const algorithm = toText(header?.alg);
    if (algorithm && !TRUSTED_JWT_ALGORITHMS.has(algorithm)) {
      throw new Error("Unsupported token algorithm");
    }

    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp)) {
      throw new Error("Token is missing expiration");
    }

    if (exp <= nowInSeconds()) {
      throw new Error("Token has expired");
    }

    const profile = await fetchApsUserProfile(rawToken);
    const profileUserId = toText(profile?.userId || profile?.uid);
    const decodedSub = toText(payload?.sub);

    if (decodedSub && profileUserId && decodedSub !== profileUserId) {
      throw new Error("Token subject mismatch");
    }

    const validatedPayload = {
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

    cachePayload(rawToken, validatedPayload);
    return validatedPayload;
  } catch (error) {
    if (error.message === "Token has expired") {
      throw error;
    }

    const upstreamStatus = Number(error?.response?.status);
    if (upstreamStatus === 401 || upstreamStatus === 403) {
      throw new Error("Invalid token");
    }

    throw new Error(`Invalid token: ${error.message}`);
  }
}

module.exports = { verifyAPSToken };
