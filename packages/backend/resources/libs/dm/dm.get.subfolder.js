// resources/libs/dm/dm.get.subfolder.js
const axios = require("axios");
const https = require("https");

// keepAlive reduce overhead de miles de requests
const http = axios.create({
  timeout: 30000,
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 }),
});

async function fetchSubFoldersRest(token, projectId, folderId) {
  let url =
    `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${folderId}/contents` +
    `?filter[type]=folders&page[limit]=100&page[number]=0`;

  const out = [];

  try {
    while (url) {
      const { data } = await http.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const foldersOnly = (data.data || []).filter((i) => i.type === "folders");
      out.push(
        ...foldersOnly.map((folder) => ({
          id: folder.id,
          name: folder.attributes.displayName || folder.attributes.name,
          objectCount: folder.attributes.objectCount || 0,
          type: "folders",
        }))
      );

      // JSON:API links.next suele venir aquí
      const next = data.links?.next;
      url =
        typeof next === "string"
          ? next
          : next?.href || next?.url || null;
    }

    return out;
  } catch (error) {
    if (error.response?.status === 404) return [];
    if (error.response?.status === 429) throw error;

    console.warn(`Error fetching contents for folder ${folderId}: ${error.message}`);
    return [];
  }
}

module.exports = { fetchSubFoldersRest };
