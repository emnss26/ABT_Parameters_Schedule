const axios = require("axios");

/**
 * Fetches available Autodesk hubs for the authenticated user.
 * @param {string} token APS access token.
 * @returns {Promise<Array>} List of hubs.
 */
async function fetchHubs(token) {
  if (!token) {
    throw new Error("Access token is required to fetch hubs");
  }

  try {
    const { data } = await axios.get(
      "https://developer.api.autodesk.com/project/v1/hubs",
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return Array.isArray(data?.data) ? data.data : [];
  } catch (error) {
    const details = error?.response?.data || error?.message;
    console.error("fetchHubs failed:", details);
    throw new Error("Failed to retrieve hubs");
  }
}

module.exports = { fetchHubs };
