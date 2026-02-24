const axios = require("axios")

/**
 * Normalize an ACC project id for Construction Reviews API.
 * Supports:
 * - "urn:adsk.workspace:prod.project:{uuid}"
 * - "b.{uuid}"
 * - "{uuid}"
 *
 * @param {string} projectId
 * @returns {string}
 */
function normalizeAccProjectId(projectId) {
  const s = String(projectId || "")
  if (s.startsWith("urn:adsk.workspace:prod.project:")) return s.split(":").pop()
  return s.replace(/^b\./i, "")
}

/**
 * Fetch a single review by id from ACC Construction Reviews.
 *
 * Note: If you want to silently ignore 404s, handle that in the caller.
 *
 * @param {string} token APS access token
 * @param {string} projectId Project URN/GUID/b.{guid}
 * @param {string} reviewId Review id
 * @returns {Promise<object|null>}
 */
async function fetchReviewById(token, projectId, reviewId) {
  if (!token) throw new Error("Missing APS access token")
  if (!projectId) throw new Error("Missing projectId")
  if (!reviewId) throw new Error("Missing reviewId")

  const pid = normalizeAccProjectId(projectId)
  const url = `https://developer.api.autodesk.com/construction/reviews/v1/projects/${pid}/reviews/${encodeURIComponent(
    reviewId
  )}`

  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return data || null
  } catch (error) {
    console.error(
      "Error fetching review by ID:",
      error?.response?.data || error?.message || error
    )
    throw error
  }
}

module.exports = { fetchReviewById, normalizeAccProjectId }
