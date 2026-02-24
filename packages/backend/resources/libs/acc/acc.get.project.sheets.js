const axios = require("axios");

function normalizeAccProjectId(projectId) {
  const raw = String(projectId || "").trim();
  if (raw.startsWith("urn:adsk.workspace:prod.project:")) {
    return raw.split(":").pop();
  }
  return raw.replace(/^b\./i, "");
}

/**
 * Helper interno para manejar la paginación de cualquier endpoint de ACC (Sheets o Collections).
 */
async function fetchPaginatedData(token, initialUrl) {
  let url = initialUrl;
  const results = [];

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
  } catch (err) {
    console.warn(`⚠️ Warning fetching page: ${err.message}`);
  }
  return results;
}

/**
 * Fetch ALL sheets (drawings) from ACC.
 */
async function fetchProjectSheets(token, projectId, limit = 200, queryParams = "") {
  const pid = normalizeAccProjectId(projectId);

  if (queryParams && queryParams.trim() !== "") {
      const url = `https://developer.api.autodesk.com/construction/sheets/v1/projects/${pid}/sheets?currentOnly=true&limit=${limit}${queryParams}`;
      return await fetchPaginatedData(token, url);
  }

  const allSheets = [];

  const globalUrl = `https://developer.api.autodesk.com/construction/sheets/v1/projects/${pid}/sheets?currentOnly=true&limit=${limit}`;
  const globalSheets = await fetchPaginatedData(token, globalUrl);
  allSheets.push(...globalSheets);

  try {
    
    const colUrl = `https://developer.api.autodesk.com/construction/sheets/v1/projects/${pid}/collections?limit=100`;
    const collections = await fetchPaginatedData(token, colUrl);

    if (collections.length > 0) {
    
        const promises = collections.map(col => {
            const sheetUrl = `https://developer.api.autodesk.com/construction/sheets/v1/projects/${pid}/sheets?currentOnly=true&limit=${limit}&collectionId=${col.id}`;
            return fetchPaginatedData(token, sheetUrl);
        });

        const collectionsResults = await Promise.all(promises);
        
        collectionsResults.forEach(sheets => {
            if (sheets.length) allSheets.push(...sheets);
        });
    }
  } catch (e) {
      console.warn("⚠️ Error auto-scanning collections (ignoring):", e.message);
  }

  const uniqueSheets = Array.from(new Map(allSheets.map(item => [item.id, item])).values());

  return uniqueSheets;
}

module.exports = {
  fetchProjectSheets,
  normalizeAccProjectId,
};