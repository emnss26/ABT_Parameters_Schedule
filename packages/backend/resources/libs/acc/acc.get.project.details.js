const axios = require("axios");

/**
 * Obtiene los detalles de un proyecto específico desde ACC Admin API.
 * Documentación: https://aps.autodesk.com/en/docs/acc/v1/reference/http/projects-project_id-GET/
 * * @param {string} token - Token de acceso APS.
 * @param {string} projectId - ID del proyecto (UUID sin prefijo "b.").
 * @returns {Promise<Object>} - Objeto con los detalles del proyecto.
 */
async function fetchAccProjectDetails(token, projectId) {
  if (!token) throw new Error("Missing APS access token");
  if (!projectId) throw new Error("Missing projectId");

  const cleanProjectId = projectId.startsWith("b.") ? projectId.substring(2) : projectId;

  const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${cleanProjectId}`;

  try {
    const { data } = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      }
    });

    return data;
  } catch (error) {
    console.warn(`⚠️ Error fetching ACC Project Details for ${cleanProjectId}:`, error.response?.data || error.message);
    return null;
  }
}

module.exports = { fetchAccProjectDetails };