const axios = require("axios");
const { logGraphQlResponseSize } = require("../../../utils/monitoring/graphql.response.size.logger");
const AEC_GRAPHQL_URL = "https://developer.api.autodesk.com/aec/graphql";

const buildProjectsFields = () => `
  pagination { cursor }
  results {
    id
    name
    alternativeIdentifiers { dataManagementAPIProjectId }
  }
`;

const buildProjectsQuery = ({ withCursor = false } = {}) => `
  query GetProjects($hubId: ID!${withCursor ? ", $cursor: String!" : ""}) {
    projects(${withCursor ? "hubId: $hubId, pagination: { cursor: $cursor }" : "hubId: $hubId"}) { ${buildProjectsFields()} }
  }
`;

const requestProjectsPage = async ({ token, hubId, cursor = null }) => {
  const query = buildProjectsQuery({ withCursor: Boolean(cursor) });
  const variables = cursor ? { hubId, cursor } : { hubId };

  const { data } = await axios.post(
    AEC_GRAPHQL_URL,
    { query, variables },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );

  logGraphQlResponseSize({
    provider: "AEC",
    query,
    payload: data,
  });

  const gqlErrors = data?.errors;
  if (Array.isArray(gqlErrors) && gqlErrors.length) {
    throw new Error(gqlErrors[0]?.message || "AEC GraphQL error");
  }

  const page = data?.data?.projects;
  return {
    results: page?.results || [],
    nextCursor: page?.pagination?.cursor || null,
  };
};

async function fetchProjects(token, hubId) {
  if (!token) throw new Error("Missing APS access token");
  if (!hubId) throw new Error("Missing hubId");

  const all = [];
  const seenCursors = new Set();
  let cursor = null;

  while (true) {
    const { results, nextCursor } = await requestProjectsPage({ token, hubId, cursor });
    all.push(...results);

    if (!nextCursor) break;
    if (seenCursors.has(nextCursor)) break; 
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return all;
}

async function fetchProjectById(token, hubId, projectId) {
  if (!token) throw new Error("Missing APS access token");
  if (!hubId) throw new Error("Missing hubId");
  if (!projectId) throw new Error("Missing projectId");

  const normalizedProjectId = String(projectId).trim();
  const seenCursors = new Set();
  let cursor = null;

  while (true) {
    const { results, nextCursor } = await requestProjectsPage({ token, hubId, cursor });
    const matchedProject =
      (results || []).find((project) => String(project?.id || "").trim() === normalizedProjectId) || null;

    if (matchedProject) return matchedProject;
    if (!nextCursor) break;
    if (seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return null;
}

module.exports = { fetchProjects, fetchProjectById };
