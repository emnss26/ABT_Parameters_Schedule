const express = require("express");

const checkSession = require("../../middlewares/checkSession");
const checkProjectAdmin = require("../../middlewares/checkProjectAdmin");
const checkGlobalResetAccess = require("../../middlewares/checkGlobalResetAccess");
const {
  ResetProjectData,
  ResetAllData,
} = require("../controllers/plans/aec.db.reset.controller");

const router = express.Router();

router.use(checkSession);

// Global reset (protected: explicit reset key)
// Must be declared before /:projectId/reset to avoid route shadowing.
router.delete("/_all/reset", checkGlobalResetAccess, ResetAllData);

// Reset by project (protected: project admin)
router.delete("/:projectId/reset", checkProjectAdmin, ResetProjectData);

module.exports = router;
