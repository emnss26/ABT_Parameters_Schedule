const axios = require("axios")

const AEC_GRAPHQL_URL = "https://developer.api.autodesk.com/aec/graphql"

/**
 * Fetch all AEC hubs via GraphQL pagination (cursor-based).
 *
 * @param {string} token APS access token
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
async function fetchHubs(token) {
  if (!token) throw new Error("Missing APS access token")

  const query = `
    query GetHubs($cursor: String) {
      hubs(pagination: { cursor: $cursor }) {
        pagination { cursor }
        results { id name }
      }
    }
  `

  const hubs = []
  let cursor = null

  console.log("Hubs", hubs)

  try {
    while (true) {
      const { data } = await axios.post(
        AEC_GRAPHQL_URL,
        { query, variables: { cursor } },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      )

      const gqlErrors = data?.errors
      if (Array.isArray(gqlErrors) && gqlErrors.length) {
        throw new Error(gqlErrors[0]?.message || "AEC GraphQL error")
      }

      const batch = data?.data?.hubs?.results || []
      if (Array.isArray(batch) && batch.length) hubs.push(...batch)

      cursor = data?.data?.hubs?.pagination?.cursor || null
      if (!cursor) break
    }

    return hubs
  } catch (error) {
    console.error("Error fetching AEC hubs:", error?.message || error)
    throw error
  }
}

module.exports = { fetchHubs }
