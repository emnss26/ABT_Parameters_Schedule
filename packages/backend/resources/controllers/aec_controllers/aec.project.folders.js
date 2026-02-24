const { fetchFolderTree } = require("../../../utils/aec_utils/aec.folderTree")

const GetAECProjectFolders = async (req, res, next) => {
  const { projectId } = req.params
  const token = req.cookies?.access_token

  console.log("Inciando get folders ", projectId)
  
  if (!token) {
    const err = new Error("Authorization token is required")
    err.status = 401
    err.code = "Unauthorized"
    return next(err)
  }

  try {
    const folderTree = await fetchFolderTree(token, projectId)

    console.log("folders", folderTree)

    return res.status(200).json({
      success: true,
      message: "Folder tree retrieved successfully",
      data: { folderTree },
      error: null,
    })
  } catch (err) {
    err.code = err.code || "AECFolderTreeFetchFailed"
    return next(err)
  }
}

module.exports = { GetAECProjectFolders }
