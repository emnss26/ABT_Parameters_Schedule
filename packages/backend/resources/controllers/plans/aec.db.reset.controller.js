const knex = require("../../../utils/db/knex");

/**
 * DELETE /plans/:projectId/reset
 * Clears only the working data for a single project.
 */
const ResetProjectData = async (req, res, next) => {
  const { projectId } = req.params;

  if (!projectId) {
    const err = new Error("Project ID is required");
    err.status = 400;
    err.code = "ValidationError";
    return next(err);
  }

  try {
    await knex.transaction(async (trx) => {
      const checkIdsSubquery = trx("parameter_checks").select("id").where({ project_id: projectId });
      await trx("parameter_elements").whereIn("check_id", checkIdsSubquery).del();
      await trx("parameter_checks").where({ project_id: projectId }).del();

      await trx("wbs_model_bindings").where({ project_id: projectId }).del();
      await trx("wbs_sets").where({ project_id: projectId }).del();

      await trx("model_selection").where({ project_id: projectId }).del();
    });

    return res.json({
      success: true,
      message: `Project ${projectId} cleared`,
      data: null,
      error: null,
    });
  } catch (err) {
    err.code = err.code || "ResetError";
    return next(err);
  }
};

/**
 * DELETE /plans/_all/reset
 * Clears all working DB tables.
 */
const ResetAllData = async (_req, res, next) => {
  try {
    await knex.transaction(async (trx) => {
      await trx("parameter_elements").del();
      await trx("parameter_checks").del();
      await trx("wbs_element_matches").del();
      await trx("wbs_match_runs").del();
      await trx("wbs_model_bindings").del();
      await trx("wbs_items").del();
      await trx("wbs_sets").del();
      await trx("model_selection").del();
    });

    return res.json({
      success: true,
      message: "All working DB tables were cleared",
      data: null,
      error: null,
    });
  } catch (err) {
    err.code = err.code || "ResetError";
    return next(err);
  }
};

module.exports = { ResetProjectData, ResetAllData };
