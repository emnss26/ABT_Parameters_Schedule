const axios = require("axios")

const DM_BASE_URL = "https://developer.api.autodesk.com/data/v1"

/**
 * Recursively lists all subfolders starting from a given folder in a project.
 * Notes:
 * - Uses Data Management "folder contents" endpoint
 * - Traverses nested folders depth-first
 *
 * @param {string} token APS access token
 * @param {string} projectId Data Management project id (usually "b.{guid}")
 * @param {string} folderId Root folder id to start from
 * @returns {Promise<Array<{ id: string, name: string }>>} Flat list of folders (id + name)
 */
async function listFoldersRecursively(token, projectId, folderId) {
  if (!token) throw new Error("Missing APS access token")
  if (!projectId) throw new Error("Missing projectId")
  if (!folderId) throw new Error("Missing folderId")

  const headers = { Authorization: `Bearer ${token}` }
  const results = []

  const fetchFolderContents = async (currentFolderId) => {
    const url = `${DM_BASE_URL}/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(
      currentFolderId
    )}/contents`

    const { data } = await axios.get(url, { headers })
    return Array.isArray(data?.data) ? data.data : []
  }

  const walk = async (currentFolderId) => {
    const items = await fetchFolderContents(currentFolderId)
    const folders = items.filter((item) => item?.type === "folders")

    for (const folder of folders) {
      results.push({
        id: folder.id,
        name: folder?.attributes?.displayName || folder?.attributes?.name || "",
      })

      await walk(folder.id)
    }
  }

  try {
    await walk(folderId)
    return results
  } catch (error) {
    console.error(
      "Error listing folders recursively:",
      error?.response?.data || error?.message || error
    )
    throw error
  }
}

module.exports = { listFoldersRecursively }
