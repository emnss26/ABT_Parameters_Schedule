const axios = require("axios");

function normalizeAccProjectId(projectId) {
  const value = String(projectId || "");
  if (value.startsWith("urn:adsk.workspace:prod.project:")) {
    return value.split(":").pop();
  }
  return value.replace(/^b\./i, "");
}

// Retry wrapper used for large datasets and transient APS failures.
async function fetchWithRetry(url, token, retries = 3, delay = 1000) {
  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  } catch (err) {
    const status = err?.response?.status;
    if (retries > 0 && [429, 500, 502, 503].includes(status)) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, token, retries - 1, delay * 2);
    }
    throw err;
  }
}

async function fetchVersionApprovalStatuses(token, projectId, versionId) {
  const accProjectId = normalizeAccProjectId(projectId);
  const url = `https://developer.api.autodesk.com/construction/reviews/v1/projects/${accProjectId}/versions/${encodeURIComponent(versionId)}/approval-statuses`;

  try {
    const data = await fetchWithRetry(url, token);
    return Array.isArray(data?.results) ? data.results : [];
  } catch (err) {
    if (err?.response?.status === 404) return [];
    return [];
  }
}

function summarizeApprovalStatuses(statuses = []) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return { status: "NOT_IN_REVIEW", reviewId: null, stepName: null, updatedAt: null };
  }

  // Sort by most recently updated approval event.
  const sorted = [...statuses].sort((a, b) => {
    const aTimestamp = a.attributes?.updatedAt || a.attributes?.createdAt || "";
    const bTimestamp = b.attributes?.updatedAt || b.attributes?.createdAt || "";
    return String(bTimestamp).localeCompare(String(aTimestamp));
  });

  const latest = sorted[0];
  return {
    status: latest.attributes?.status || null,
    reviewId: latest.relationships?.review?.data?.id || null,
    stepName: latest.attributes?.stepName || null,
    updatedAt: latest.attributes?.updatedAt || latest.attributes?.createdAt || null,
  };
}

module.exports = {
  fetchVersionApprovalStatuses,
  summarizeApprovalStatuses,
  normalizeAccProjectId,
};
