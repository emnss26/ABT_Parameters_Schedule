const axios = require("axios")

const AEC_GRAPHQL_URL = "https://developer.api.autodesk.com/aec/graphql"

/**
 * Fetch top-level folders for an AEC project (GraphQL).
 */
async function fetchTopFoldersGraphql(token, projectId) {
  if (!token) throw new Error("Missing APS access token")
  if (!projectId) throw new Error("Missing projectId")

  const query = `
    query GetFoldersByProject($projectId: ID!) {
      foldersByProject(projectId: $projectId) {
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
      { query, variables: { projectId } },
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

    return data?.data?.foldersByProject?.results || []
  } catch (error) {
    console.error("Error fetching top-level folders:", error?.response?.data || error?.message || error)
    throw error
  }
}

module.exports = { fetchTopFoldersGraphql }