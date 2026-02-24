const axios = require("axios")

const DM_BASE_URL = "https://developer.api.autodesk.com/data/v1"

/**
 * Fetches all items from a folder (including subfolders) and returns only file items.
 * - Handles pagination per folder
 * - Traverses subfolders recursively
 *
 * @param {string} token APS access token
 * @param {string} projectId Data Management project id (usually "b.{guid}")
 * @param {string} folderId Folder id
 * @returns {Promise<Array>} List of DM "items" (files), with include=versions
 */
async function fetchFolderContents(token, projectId, folderId) {
  if (!token) throw new Error("Missing APS access token")
  if (!projectId) throw new Error("Missing projectId")
  if (!folderId) throw new Error("Missing folderId")

  const headers = { Authorization: `Bearer ${token}` }
  const results = []

  const fetchFolderPage = async (url) => {
    const { data } = await axios.get(url, { headers })
    const items = Array.isArray(data?.data) ? data.data : []
    const nextUrl = data?.links?.next?.href || null
    return { items, nextUrl }
  }

  const walkFolder = async (currentFolderId) => {
    let nextUrl = `${DM_BASE_URL}/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(
      currentFolderId
    )}/contents?include=versions`

    const folderItems = []

    while (nextUrl) {
      const page = await fetchFolderPage(nextUrl)
      folderItems.push(...page.items)
      nextUrl = page.nextUrl
    }

    for (const item of folderItems) {
      if (item?.type === "folders") {
        await walkFolder(item.id)
        continue
      }

      if (item?.type === "items") {
        results.push(item)
      }
    }
  }

  try {
    await walkFolder(folderId)
    return results
  } catch (error) {
    console.error(
      `Error fetching folder contents (folderId=${folderId}):`,
      error?.response?.data || error?.message || error
    )
    throw error
  }
}

module.exports = { fetchFolderContents }
