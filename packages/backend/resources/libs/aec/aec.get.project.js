const axios = require("axios");
const AEC_GRAPHQL_URL = "https://developer.api.autodesk.com/aec/graphql";

async function fetchProjects(token, hubId) {
  if (!token) throw new Error("Missing APS access token");
  if (!hubId) throw new Error("Missing hubId");

  const baseFields = `
    pagination { cursor }
    results {
      id
      name
      alternativeIdentifiers { dataManagementAPIProjectId }
    }
  `;

  const queryFirst = `
    query GetProjects($hubId: ID!) {
      projects(hubId: $hubId) { ${baseFields} }
    }
  `;

  const queryNext = `
    query GetProjects($hubId: ID!, $cursor: String!) {
      projects(hubId: $hubId, pagination: { cursor: $cursor }) { ${baseFields} }
    }
  `;

  const all = [];
  const seenCursors = new Set();
  let cursor = null;

  while (true) {
    const query = cursor ? queryNext : queryFirst;
    const variables = cursor ? { hubId, cursor } : { hubId };

    const { data } = await axios.post(
      AEC_GRAPHQL_URL,
      { query, variables },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    const gqlErrors = data?.errors;
    if (Array.isArray(gqlErrors) && gqlErrors.length) {
      throw new Error(gqlErrors[0]?.message || "AEC GraphQL error");
    }

    const page = data?.data?.projects;
    const results = page?.results || [];
    all.push(...results);

    const nextCursor = page?.pagination?.cursor;
    if (!nextCursor) break;
    if (seenCursors.has(nextCursor)) break; 
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return all;
}

module.exports = { fetchProjects };