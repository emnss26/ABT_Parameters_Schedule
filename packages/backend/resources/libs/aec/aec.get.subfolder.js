const axios = require("axios")

const AEC_GRAPHQL_URL = "https://developer.api.autodesk.com/aec/graphql"

/**
 * Fetch subfolders inside a specific folder in an AEC project (GraphQL).
 *
 * @param {string} token APS access token
 * @param {string} projectId AEC project ID
 * @param {string} folderId Parent folder ID
 * @returns {Promise<Array>} Subfolders list
 */
async function fetchSubFolders(token, projectId, folderId) {
  if (!token) throw new Error("Missing APS access token")
  if (!projectId) throw new Error("Missing projectId")
  if (!folderId) throw new Error("Missing folderId")

  const query = `
    query GetFoldersByFolder($projectId: ID!, $folderId: ID!) {
      foldersByFolder(projectId: $projectId, folderId: $folderId) {
        results {
          id
          name
          objectCount
        }
      }
    }
  `

  try {
    const { data } = await axios.post(
      AEC_GRAPHQL_URL,
      { query, variables: { projectId, folderId } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    )

    const gqlErrors = data?.errors
    if (Array.isArray(gqlErrors) && gqlErrors.length) {
      throw new Error(gqlErrors.map((e) => e?.message).filter(Boolean).join("\n") || "AEC GraphQL error")
    }

    return data?.data?.foldersByFolder?.results || []
  } catch (error) {
    console.error("Error fetching subfolders:", error?.response?.data || error?.message || error)
    throw error
  }
}

module.exports = { fetchSubFolders }
