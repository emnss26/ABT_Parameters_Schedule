const axios = require("axios")

const DM_PROJECT_BASE_URL = "https://developer.api.autodesk.com/project/v1"

/**
 * Fetches a Data Management hub by its hubId.
 *
 * @param {string} token APS access token
 * @param {string} hubId Hub id (e.g. "b.{guid}")
 * @returns {Promise<Object>} Hub object (data.data) or empty object
 */
async function fetchDataManagementHubId(token, hubId) {
  if (!token) throw new Error("Missing APS access token")
  if (!hubId) throw new Error("Missing hubId")

  const url = `${DM_PROJECT_BASE_URL}/hubs/${encodeURIComponent(hubId)}`

  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    return data?.data || {}
  } catch (error) {
    console.error(
      "Error fetching Data Management hub:",
      error?.response?.data || error?.message || error
    )
    throw error
  }
}

module.exports = { fetchDataManagementHubId }
