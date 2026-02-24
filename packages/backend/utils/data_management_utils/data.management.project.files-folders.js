const { getRootFolderId } = require("../../resources/libs/data.management.get.root.folder.js");
const { listFoldersRecursively } = require("../../resources/libs/data.management.get.folders-files.js");

/**
 * Returns a recursive list of folders starting from the project's "Project Files" root folder.
 *
 * @param {string} token APS access token.
 * @param {string} hubId Data Management hub/account id.
 * @param {string} projectId Data Management project id (e.g., b.{guid} or raw guid depending on your caller).
 * @returns {Promise<Array<{id: string, name: string}>>} Flattened folder list.
 */
async function GetProjectFilesFolders(token, hubId, projectId) {
  try {
    const rootFolderId = await getRootFolderId(token, hubId, projectId);
    const folders = await listFoldersRecursively(token, projectId, rootFolderId);
    return folders;
  } catch (error) {
    const details = error?.response?.data || error?.message;
    console.error("GetProjectFilesFolders failed:", details);
    throw error;
  }
}

module.exports = { GetProjectFilesFolders };
