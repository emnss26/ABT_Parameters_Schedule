const axios = require("axios")

// Endpoint base para Data Management API
const DM_BASE_URL = "https://developer.api.autodesk.com/project/v1/hubs"
const hubId = process.env.RAWHUBID
/**
 * Obtiene las carpetas raíz usando REST API.
 * Documentación: https://aps.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-topFolders-GET/
 */
async function fetchTopFoldersRest(token, projectId) {
  if (!token) throw new Error("Missing APS access token")
  
  // Aseguramos que el ID empiece con "b."
  const cleanProjectId = projectId

  //console.log("Inciando HUB ID", hubId)
  //console.log("clean project Id", cleanProjectId)

  try {
    const url = `${DM_BASE_URL}/${hubId}/projects/${cleanProjectId}/topFolders`;
    
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Mapeamos la respuesta JSON:API de Autodesk a un formato limpio
    return (data.data || []).map(folder => ({
      id: folder.id,
      name: folder.attributes.displayName || folder.attributes.name, // REST usa displayName
      objectCount: folder.attributes.objectCount || 0,
      type: 'folders',
      children: [] // Preparamos el array de hijos
    }));

  } catch (error) {
    console.error("Error fetching Top Folders (REST):", error.response?.data || error.message);
    throw error;
  }
}

module.exports = { fetchTopFoldersRest }