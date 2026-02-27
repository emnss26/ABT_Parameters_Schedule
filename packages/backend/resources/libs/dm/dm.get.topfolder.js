const axios = require("axios");

const DM_BASE_URL = "https://developer.api.autodesk.com/project/v1/hubs";
const hubId = process.env.RAWHUBID;

/**
 * Fetch root folders for a Data Management project using the REST API.
 * Docs: https://aps.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-topFolders-GET/
 */
async function fetchTopFoldersRest(token, projectId) {
  if (!token) throw new Error("Missing APS access token");

  const cleanProjectId = projectId;

  try {
    const url = `${DM_BASE_URL}/${hubId}/projects/${cleanProjectId}/topFolders`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return (data.data || []).map((folder) => ({
      id: folder.id,
      name: folder.attributes.displayName || folder.attributes.name,
      objectCount: folder.attributes.objectCount || 0,
      type: "folders",
      children: [],
    }));
  } catch (error) {
    console.error("Error fetching top folders (REST):", error.response?.data || error.message);
    throw error;
  }
}

module.exports = { fetchTopFoldersRest };
