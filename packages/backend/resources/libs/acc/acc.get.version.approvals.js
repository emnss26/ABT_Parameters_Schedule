const axios = require("axios");

function normalizeAccProjectId(projectId) {
  const s = String(projectId || "");
  if (s.startsWith("urn:adsk.workspace:prod.project:")) {
    return s.split(":").pop();
  }
  return s.replace(/^b\./i, "");
}

// --- FUNCIÓN DE FETCH CON RETRY (Vital para listas grandes) ---
async function fetchWithRetry(url, token, retries = 3, delay = 1000) {
  try {
    const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
    return data;
  } catch (err) {
    if (retries > 0 && err.response && [429, 500, 502, 503].includes(err.response.status)) {
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(url, token, retries - 1, delay * 2);
    }
    throw err;
  }
}

async function fetchVersionApprovalStatuses(token, projectId, versionId) {
  const accProjectId = normalizeAccProjectId(projectId);
  const url = `https://developer.api.autodesk.com/construction/reviews/v1/projects/${accProjectId}/versions/${encodeURIComponent(versionId)}/approval-statuses`;

  try {
    // Usamos fetchWithRetry en lugar de axios directo
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
  // Ordenar por fecha descendente
  const sorted = [...statuses].sort((a, b) => {
    const aT = a.attributes?.updatedAt || a.attributes?.createdAt || "";
    const bT = b.attributes?.updatedAt || b.attributes?.createdAt || "";
    return String(bT).localeCompare(String(aT));
  });
  const s = sorted[0];
  return {
    status: s.attributes?.status || null,
    reviewId: s.relationships?.review?.data?.id || null,
    stepName: s.attributes?.stepName || null,
    updatedAt: s.attributes?.updatedAt || s.attributes?.createdAt || null,
  };
}

module.exports = {
  fetchVersionApprovalStatuses,
  summarizeApprovalStatuses,
  normalizeAccProjectId
};