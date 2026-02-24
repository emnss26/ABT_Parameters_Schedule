const { GetProjectFilesFolders } = require("../../../utils/data_management_utils/data.management.project.files-folders.js")
const { GetProjectReviews } = require("../../../utils/data_management_utils/data.management.project.reviews.utils.js")

const HUB_ID = process.env.APS_HUB_ID

const GetFileRevisionStatus = async (req, res, next) => {
  const { projectId } = req.params
  const token = req.cookies?.access_token
  const altProjectId = req.headers["x-alt-project-id"]

  if (!token) {
    const err = new Error("Authorization token is required")
    err.status = 401
    err.code = "Unauthorized"
    return next(err)
  }

  if (!HUB_ID) {
    const err = new Error("APS_HUB_ID env var is required")
    err.status = 500
    err.code = "MissingHubId"
    return next(err)
  }

  if (!altProjectId) {
    const err = new Error("Alternative Project ID is required")
    err.status = 400
    err.code = "MissingAltProjectId"
    return next(err)
  }

  try {
    const projectFilesFolders = await GetProjectFilesFolders(token, HUB_ID, altProjectId)

    if (!Array.isArray(projectFilesFolders)) {
      const err = new Error("Unexpected projectFilesFolders format")
      err.status = 500
      err.code = "InvalidProjectFilesFolders"
      return next(err)
    }

    const projectReviews = await GetProjectReviews(token, altProjectId)

    if (!Array.isArray(projectReviews)) {
      const err = new Error("Unexpected projectReviews format")
      err.status = 500
      err.code = "InvalidProjectReviews"
      return next(err)
    }

    return res.status(200).json({
      success: true,
      message: "Project reviews retrieved successfully",
      data: { projectFilesFolders, projectReviews },
      error: null,
    })
  } catch (err) {
    err.code = err.code || "ProjectReviewFetchFailed"
    return next(err)
  }
}

module.exports = { GetFileRevisionStatus }
