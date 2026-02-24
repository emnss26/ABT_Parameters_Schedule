const axios = require("axios")

const PROJECT_API_BASE_URL = "https://developer.api.autodesk.com/project/v1"

const PROJECT_FILES_NAMES = new Set([
  "project files",
  "archivos de proyecto",
])

/**
 * Retrieves the root folder id (usually "Project Files") for a given project.
 *
 * @param {string} token APS access token
 * @param {string} accountId Hub/account id (e.g. "b.{guid}")
 * @param {string} projectId Project id (e.g. "b.{guid}" or raw guid depending on endpoint usage)
 * @returns {Promise<string>} Root folder id
 */
async function getRootFolderId(token, accountId, projectId) {
  if (!token) throw new Error("Missing APS access token")
  if (!accountId) throw new Error("Missing accountId (hub id)")
  if (!projectId) throw new Error("Missing projectId")

  const url = `${PROJECT_API_BASE_URL}/hubs/${encodeURIComponent(
    accountId
  )}/projects/${encodeURIComponent(projectId)}/topFolders`

  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  const topFolders = Array.isArray(data?.data) ? data.data : []
  if (topFolders.length === 0) throw new Error("No top folders found")

  const rootFolder =
    topFolders.find((f) => {
      const name = String(f?.attributes?.displayName || "").trim().toLowerCase()
      return PROJECT_FILES_NAMES.has(name)
    }) || topFolders[0]

  return rootFolder.id
}

module.exports = { getRootFolderId }
