const jwt = require("jsonwebtoken");

/**
 * Decodes an APS JWT and validates expiration only.
 * APS tokens are treated as trusted tokens from Autodesk in this flow.
 *
 * @param {string} token
 * @returns {Promise<Object>}
 */
async function verifyAPSToken(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded) {
      throw new Error("Invalid token format");
    }

    if (decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp <= now) {
        throw new Error("Token has expired");
      }
    }

    return decoded;
  } catch (error) {
    if (error.message === "Token has expired") {
      throw error;
    }
    throw new Error(`Invalid token: ${error.message}`);
  }
}

module.exports = { verifyAPSToken };
