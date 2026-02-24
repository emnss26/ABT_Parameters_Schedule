const express = require("express")

const checkSession = require("../../middlewares/checkSession")

const {
  GetAECProjects,
} = require("../controllers/aec_controllers/aec.projects.controller")
const {
  GetAECModels,
} = require("../controllers/aec_controllers/aec.models.controller")
const {
  GetAECProjectFolders,
} = require("../controllers/aec_controllers/aec.project.folders")
const {
  GetAECModelParametersByCategory,
} = require("../controllers/aec_controllers/aec.model.parameters.controller")

const {
  setSelectedModels,
  getSelectedModels,
} = require("../controllers/aec_controllers/aec.models.selection.controller")
const {
  SetSelectedFolder,
  GetSelectedFolder,
} = require("../controllers/aec_controllers/aec.project.folders.selection.controller")

const router = express.Router()

// Protect all AEC routes with session validation/refresh.
router.use(checkSession)

// Project data
router.get("/graphql-projects", GetAECProjects)
router.get("/:projectId/graphql-models", GetAECModels)
router.get("/:projectId/graphql-project-folders", GetAECProjectFolders)
router.get("/:projectId/graphql-model-parameters", GetAECModelParametersByCategory)

// Model selection
router.post("/:projectId/graphql-models/set-selection", setSelectedModels)
router.get("/:projectId/graphql-models/get-selection", getSelectedModels)

// Folder selection
router.post("/:projectId/graphql-folders/set-selection", SetSelectedFolder)
router.get("/:projectId/graphql-folders/get-selection", GetSelectedFolder)

module.exports = router
