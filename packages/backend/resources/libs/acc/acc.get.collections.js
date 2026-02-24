const axios = require("axios");

function normalizeAccProjectId(projectId) {
  const raw = String(projectId || "").trim();
  if (raw.startsWith("urn:adsk.workspace:prod.project:")) {
    return raw.split(":").pop();
  }
  return raw.replace(/^b\./i, "");
}

async function fetchCollections(token, projectId) {
  const pid = normalizeAccProjectId(projectId);
  const results = [];
  

  let url = `https://developer.api.autodesk.com/construction/sheets/v1/projects/${pid}/collections?limit=100`;

  try {
    while (url) {
      const { data } = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (Array.isArray(data?.results)) {
        results.push(...data.results);
      }

      const nextUrl = data?.pagination?.nextUrl;
      if (!nextUrl) break;

      url = nextUrl.startsWith("http")
        ? nextUrl
        : `https://developer.api.autodesk.com${nextUrl}`;
    }
    return results;
  } catch (err) {
    console.error("Error fetching collections:", err.response?.data || err.message);
    return []; 
  }
}

module.exports = { fetchCollections };