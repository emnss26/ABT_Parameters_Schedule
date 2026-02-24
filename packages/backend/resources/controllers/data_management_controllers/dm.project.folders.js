const { fetchFolderTree } = require("../../../utils/dm/dm.folderTree")

const GetDMProjectFolders = async (req, res, next) => {
  const { projectId } = req.params; // ID de GraphQL (urn:adsk...)
  const { dmId } = req.query;       // ID de Data Management (b.xxxx...)
  const token = req.cookies?.access_token;

  console.log("ProjetId dmg", dmId)

  if (!token) {
    const err = new Error("Authorization token is required");
    err.status = 401;
    return next(err);
  }

  try {
    // Priorizamos el dmId que viene del frontend. 
    // Si no viene, intentamos convertir el projectId (fallback).
    const targetId = dmId ;

    console.log(`📂 Fetching Folder Tree via REST for: ${targetId}`);

    const folderTree = await fetchFolderTree(token, targetId);

    console.log("Folder Tree", folderTree)

    return res.status(200).json({
      success: true,
      message: "Folder tree retrieved successfully (REST)",
      data: { folderTree },
      error: null,
    })
  } catch (err) {
    console.error("Tree Fetch Error:", err);
    err.code = err.code || "FolderTreeError";
    return next(err);
  }
}

module.exports = { GetDMProjectFolders }