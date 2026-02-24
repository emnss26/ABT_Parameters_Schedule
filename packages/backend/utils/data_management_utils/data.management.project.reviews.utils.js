const axios = require("axios");

/**
 * Fetches all review workflows for an ACC project.
 *
 * @param {string} token APS access token.
 * @param {string} projectId ACC project GUID (or already-normalized id expected by Reviews API).
 * @returns {Promise<Array>} Review list.
 */
async function GetProjectReviews(token, projectId) {
  const url = `https://developer.api.autodesk.com/construction/reviews/v1/projects/${projectId}/reviews`;

  try {
    const { data } = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return Array.isArray(data?.results) ? data.results : [];
  } catch (error) {
    const details = error?.response?.data || error?.message;
    console.error("GetProjectReviews failed:", details);
    throw new Error("Failed to fetch project reviews");
  }
}

module.exports = { GetProjectReviews };
