const knex = require("knex")(require("../../../knexfile").development)

/**
 * DELETE /aec/:projectId/reset
 * Clears only the working data for a single project.
 */
const ResetProjectData = async (req, res, next) => {
  const { projectId } = req.params

  if (!projectId) {
    const err = new Error("Project ID is required")
    err.status = 400
    err.code = "ValidationError"
    return next(err)
  }

  try {
    await knex("model_selection").where({ project_id: projectId }).del()
    await knex("plan_folder_selection").where({ project_id: projectId }).del()
    await knex("user_plans").where({ project_id: projectId }).del()

    return res.json({
      success: true,
      message: `Project ${projectId} cleared`,
      data: null,
      error: null,
    })
  } catch (err) {
    err.code = err.code || "ResetError"
    return next(err)
  }
}

/**
 * DELETE /aec/_all/reset
 * Clears ALL working DB tables (use with care).
 */
const ResetAllData = async (_req, res, next) => {
  try {
    await knex("model_selection").del()
    await knex("plan_folder_selection").del()
    await knex("user_plans").del()

    return res.json({
      success: true,
      message: "All working DB tables were cleared",
      data: null,
      error: null,
    })
  } catch (err) {
    err.code = err.code || "ResetError"
    return next(err)
  }
}

module.exports = { ResetProjectData, ResetAllData }
