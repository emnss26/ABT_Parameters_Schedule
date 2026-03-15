const express = require("express");
const checkSession = require("../../middlewares/checkSession");

const { GetAECProjectMetadata, GetAECProjects } = require("../controllers/aec_controllers/aec.projects.controller");
const { GetAECModels } = require("../controllers/aec_controllers/aec.models.controller");
const {
  GetAECModelParametersByCategory,
  SaveParameterCheck,
  DeleteParameterCheck,
  GetLastParameterCheck,
  GetLastDisciplineByModel,
  GetProjectParameterCompliance,
} = require("../controllers/aec_controllers/aec.model.parameters.controller");
const {
  SaveProjectWbs,
  GetLatestProjectWbs,
  RunWbsModelMatching,
  GetLatestWbsModelMatching,
} = require("../controllers/aec_controllers/aec.wbs.planner.controller");
const {
  setSelectedModels,
  getSelectedModels,
} = require("../controllers/aec_controllers/aec.models.selection.controller");

const router = express.Router();

router.use(checkSession);

router.get("/graphql-projects", GetAECProjects);
router.get("/:projectId/project-metadata", GetAECProjectMetadata);
router.get("/:projectId/graphql-models", GetAECModels);


router.get("/:projectId/graphql-model-parameters", GetAECModelParametersByCategory);
router.post("/:projectId/parameters/save-check", SaveParameterCheck);
router.delete("/:projectId/parameters/check/:checkId", DeleteParameterCheck);
router.get("/:projectId/parameters/last-check", GetLastParameterCheck);
router.get("/:projectId/parameters/last-discipline", GetLastDisciplineByModel);
router.get("/:projectId/parameters/project-compliance", GetProjectParameterCompliance);

router.post("/:projectId/wbs/save", SaveProjectWbs);
router.get("/:projectId/wbs/latest", GetLatestProjectWbs);
router.post("/:projectId/wbs/match/run", RunWbsModelMatching);
router.get("/:projectId/wbs/match/latest", GetLatestWbsModelMatching);

router.post("/:projectId/graphql-models/set-selection", setSelectedModels);
router.get("/:projectId/graphql-models/get-selection", getSelectedModels);

module.exports = router;
