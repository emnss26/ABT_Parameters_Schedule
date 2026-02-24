const knex = require("../../../utils/db/knex")
const { ensureTables } = require("../../../utils/db/ensureTables")

const SetSelectedFolder = async (req, res, next) => {
  const { projectId } = req.params
  const { folderId } = req.body

  if (!projectId || !folderId) {
    const err = new Error("Missing params")
    err.status = 400
    err.code = "ValidationError"
    return next(err)
  }

  try {
    await ensureTables(knex)

    // One folder selection per project (replace previous selection)
    await knex("plan_folder_selection").where({ project_id: projectId }).del()

    await knex("plan_folder_selection").insert({
      project_id: projectId,
      folder_id: folderId,
    })

    return res.status(200).json({
      success: true,
      message: "Folder seleccionado con éxito",
      data: { folderId },
      error: null,
    })
  } catch (err) {
    err.code = err.code || "FolderSelectionError"
    return next(err)
  }
}

const GetSelectedFolder = async (req, res, next) => {
  const { projectId } = req.params

  try {
    await ensureTables(knex)

    const row = await knex("plan_folder_selection")
      .where({ project_id: projectId })
      .first()

    return res.json({
      success: true,
      message: "Folder seleccionado obtenido",
      data: { folderId: row ? row.folder_id : null },
      error: null,
    })
  } catch (err) {
    err.code = err.code || "FolderSelectionFetchError"
    return next(err)
  }
}

module.exports = { SetSelectedFolder, GetSelectedFolder }
