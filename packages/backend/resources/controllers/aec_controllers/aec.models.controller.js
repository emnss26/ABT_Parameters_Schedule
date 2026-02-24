const { fetchModels } = require("../../libs/aec/aec.get.models.js")

const GetAECModels = async (req, res, next) => {
  const { projectId } = req.params
  const token = req.cookies?.access_token
  
  if (!token) {
    const err = new Error("Authorization token is required")
    err.status = 401
    err.code = "Unauthorized"
    return next(err)
  }

  try {
    const models = await fetchModels(token, projectId)

    console.log(models)
    return res.status(200).json({
      success: true,
      message: "Models retrieved successfully",
      data: { models },
      error: null,
    })
  } catch (err) {
    err.code = err.code || "AECModelsFetchFailed"
    return next(err)
  }
}

module.exports = { GetAECModels }

