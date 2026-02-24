const axios = require("axios");

const APS_CLIENT_ID = process.env.APS_CLIENT_ID;
const APS_CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
const APS_CALLBACK_URL = process.env.APS_CALLBACK_URL;

function validateApsConfig() {
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET || !APS_CALLBACK_URL) {
    throw new Error(
      "Missing APS_CLIENT_ID, APS_CLIENT_SECRET, or APS_CALLBACK_URL in environment"
    );
  }
}

function buildBasicAuthHeader(clientId, clientSecret) {
  const credentials = `${clientId}:${clientSecret}`;
  const encoded = Buffer.from(credentials).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Exchanges a three-legged authorization code for an APS token.
 * @param {string} code Authorization code from the OAuth callback.
 * @returns {Promise<Object>} Token response.
 */
async function GetAPSThreeLeggedToken(code) {
  validateApsConfig();

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: String(code || ""),
      redirect_uri: String(APS_CALLBACK_URL || ""),
      scope:
        "account:read data:read data:write data:create viewables:read bucket:read",
    });

    const { data } = await axios.post(
      "https://developer.api.autodesk.com/authentication/v2/token",
      body.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: buildBasicAuthHeader(APS_CLIENT_ID, APS_CLIENT_SECRET),
        },
      }
    );

    return data;
  } catch (error) {
    const details = error?.response?.data || error?.message;
    console.error("GetAPSThreeLeggedToken failed:", details);
    throw new Error("Failed to get APS three-legged token");
  }
}

/**
 * Retrieves a two-legged (client credentials) APS token.
 * @returns {Promise<string>} Access token.
 */
async function GetAPSToken() {
  validateApsConfig();

  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "data:read data:create data:write",
    });

    const { data } = await axios.post(
      "https://developer.api.autodesk.com/authentication/v2/token",
      body.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: buildBasicAuthHeader(APS_CLIENT_ID, APS_CLIENT_SECRET),
        },
      }
    );

    return data.access_token;
  } catch (error) {
    const details = error?.response?.data || error?.message;
    console.error("GetAPSToken failed:", details);
    throw new Error("Failed to get APS token");
  }
}

/**
 * Retrieves user profile with roles and access levels from ACC for a specific project
 * @param {string} accessToken - User's 3-legged access token
 * @param {string} projectId - ACC project ID
 * @param {string} userId - User's Autodesk ID
 * @returns {Promise<Object>} User profile with roles and accessLevels
 */
async function getACCProjectUser(accessToken, projectId, userId) {
  try {
    const response = await axios.get(
      `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        params: {
          fields: "accessLevels,roles,roleIds,status",
        },
      }
    );

    return response.data;
  } catch (error) {
    const details = error?.response?.data || error?.message;
    console.error("getACCProjectUser failed:", details);
    throw new Error("Failed to retrieve user access levels from ACC");
  }
}

module.exports = { GetAPSThreeLeggedToken, GetAPSToken, getACCProjectUser };
