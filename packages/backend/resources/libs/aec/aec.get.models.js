const axios = require("axios")
const { logGraphQlResponseSize } = require("../../../utils/monitoring/graphql.response.size.logger")

const AEC_GRAPHQL_URL = "https://developer.api.autodesk.com/aec/graphql"

const normalizeProjectId = (value) => {
  const raw = String(value || "").trim()
  if (!raw) return ""
  if (!raw.includes("%")) return raw

  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

const extractApsMessage = (error) => {
  const fromErrors = error?.response?.data?.errors?.[0]?.message
  const fromMessage = error?.response?.data?.message
  return fromErrors || fromMessage || error?.message || "AEC GraphQL request failed"
}

const buildFetchError = (error) => {
  const err = new Error(extractApsMessage(error))
  err.status = error?.status || error?.statusCode || error?.response?.status || 500
  err.code = "AECModelsFetchFailed"
  return err
}

const graphQlPost = async (token, query, variables) => {
  const { data } = await axios.post(
    AEC_GRAPHQL_URL,
    { query, variables },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  logGraphQlResponseSize({
    provider: "AEC",
    query,
    payload: data,
  })

  const gqlErrors = data?.errors
  if (Array.isArray(gqlErrors) && gqlErrors.length) {
    const err = new Error(gqlErrors[0]?.message || "AEC GraphQL error")
    err.status = 400
    throw err
  }

  return data?.data || {}
}

const fetchModelsWithFields = async (token, projectId, resultsFields) => {
  const queryFirst = `
    query GetElementGroupsByProject($projectId: ID!) {
      elementGroupsByProject(projectId: $projectId) {
        pagination { cursor pageSize }
        results {
          ${resultsFields}
        }
      }
    }
  `

  const queryNext = `
    query GetElementGroupsByProject($projectId: ID!, $cursor: String!) {
      elementGroupsByProject(projectId: $projectId, pagination: { cursor: $cursor }) {
        pagination { cursor pageSize }
        results {
          ${resultsFields}
        }
      }
    }
  `

  const results = []
  const seenCursors = new Set()
  let cursor = null

  while (true) {
    const query = cursor ? queryNext : queryFirst
    const variables = cursor ? { projectId, cursor } : { projectId }
    const gqlData = await graphQlPost(token, query, variables)

    const payload = gqlData?.elementGroupsByProject
    const page = Array.isArray(payload?.results) ? payload.results : []
    if (page.length) results.push(...page)

    const nextCursor = payload?.pagination?.cursor || null
    if (!nextCursor || seenCursors.has(nextCursor)) break

    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  return results
}

/**
 * Fetch element groups (models) for a given AEC project.
 * Uses cursor-based pagination until no cursor is returned.
 *
 * @param {string} token APS access token
 * @param {string} projectId AEC project ID
 * @returns {Promise<Array>} List of element groups (models)
 */
async function fetchModels(token, projectId) {
  if (!token) throw new Error("Missing APS access token")
  if (!projectId) throw new Error("Missing projectId")

  const normalizedProjectId = normalizeProjectId(projectId)
  const fullFields = `
    name
    id
    alternativeIdentifiers {
      fileUrn
      fileVersionUrn
    }
  `
  const minimalFields = `
    name
    id
  `

  // console.log(fullFields)

  try {
    return await fetchModelsWithFields(token, normalizedProjectId, fullFields)
  } catch (error) {
    const message = extractApsMessage(error)
    const hasAltIdentifierSchemaIssue =
      /alternativeIdentifiers/i.test(message) &&
      /(cannot query field|unknown field|does not exist|schema)/i.test(message)

    if (!hasAltIdentifierSchemaIssue) {
      console.error("Error fetching AEC models:", error?.response?.data || error?.message || error)
      throw buildFetchError(error)
    }

    try {
      return await fetchModelsWithFields(token, normalizedProjectId, minimalFields)
    } catch (fallbackError) {
      console.error(
        "Error fetching AEC models (fallback):",
        fallbackError?.response?.data || fallbackError?.message || fallbackError
      )
      throw buildFetchError(fallbackError)
    }
  }
}

module.exports = { fetchModels }

