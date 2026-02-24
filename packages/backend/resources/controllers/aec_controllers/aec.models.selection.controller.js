const knex = require("../../../utils/db/knex");
const { ensureTables } = require("../../../utils/db/ensureTables");

/**
 * Body:
 * { modelIds: string[], modelMeta?: [{ id: string, name: string }] }
 */
const setSelectedModels = async (req, res, next) => {
  const { projectId } = req.params;
  const { modelIds = [], modelMeta = [] } = req.body || {};

  try {
    await ensureTables(knex);

    const ids = Array.isArray(modelIds) ? modelIds : [];
    const meta = Array.isArray(modelMeta) ? modelMeta : [];

    const nameById = new Map(
      meta
        .filter((m) => m && m.id)
        .map((m) => [String(m.id), String(m.name || "").trim()])
    );

    await knex.transaction(async (trx) => {
      await trx("model_selection").where({ project_id: projectId }).del();

      if (ids.length > 0) {
        await trx("model_selection").insert(
          ids.map((id) => ({
            project_id: projectId,
            model_id: id,
            model_name: nameById.get(String(id)) || null,
    
          }))
        );
      }
    });

    return res.json({
      success: true,
      message: "Model selection saved",
      data: { modelIds: ids },
      error: null,
    });
  } catch (err) {
    err.code = err.code || "ModelSelectionSaveError";
    return next(err);
  }
};

const getSelectedModels = async (req, res, next) => {
  const { projectId } = req.params;

  try {
    await ensureTables(knex);

    // ✅ detecta columnas reales (si la DB está vieja)
    const info = await knex("model_selection").columnInfo();
    const cols = ["model_id"];
    if (info.model_name) cols.push("model_name"); // solo si existe

    const rows = await knex("model_selection")
      .where({ project_id: projectId })
      .select(cols)
      .orderBy("id", "asc");

    return res.json({
      success: true,
      message: "Model selection retrieved",
      data: {
        modelIds: rows.map((r) => r.model_id),
        models: rows.map((r) => ({ id: r.model_id, name: r.model_name || "" })),
      },
      error: null,
    });
  } catch (err) {
    err.code = err.code || "ModelSelectionFetchError";
    return next(err);
  }
};

module.exports = { setSelectedModels, getSelectedModels };
