const {
  fetchModelParametersByCategory,
} = require("../../libs/aec/aec.get.model.parameters.by.category")

const GetAECModelParametersByCategory = async (req, res, next) => {
  const token = req.cookies?.access_token
  const { projectId } = req.params
  const modelId = String(req.query?.modelId || "").trim()
  const category = String(req.query?.category || "Walls").trim()

  if (!token) {
    const err = new Error("Authorization token is required")
    err.status = 401
    err.code = "Unauthorized"
    return next(err)
  }

  if (!projectId) {
    const err = new Error("Project ID is required")
    err.status = 400
    err.code = "MissingProjectId"
    return next(err)
  }

  if (!modelId) {
    const err = new Error("Query param 'modelId' is required")
    err.status = 400
    err.code = "MissingModelId"
    return next(err)
  }

  if (!category) {
    const err = new Error("Query param 'category' is required")
    err.status = 400
    err.code = "MissingCategory"
    return next(err)
  }

  try {
    const result = await fetchModelParametersByCategory(token, projectId, modelId, category)

    return res.status(200).json({
      success: true,
      message: "Model parameters retrieved successfully",
      data: result,
      error: null,
    })
  } catch (err) {
    err.code = err.code || "AECModelParametersFetchFailed"
    return next(err)
  }
}

module.exports = { GetAECModelParametersByCategory }
