const express = require("express")

const checkSession = require("../../middlewares/checkSession")
const checkProjectAdmin = require("../../middlewares/checkProjectAdmin")
const {
  ResetProjectData,
  ResetAllData,
} = require("../controllers/plans/aec.db.reset.controller")

const router = express.Router()

router.use(checkSession)

// Reset (protected - admin only)
router.delete("/:projectId/reset", checkProjectAdmin, ResetProjectData)
router.delete("/_all/reset", checkProjectAdmin, ResetAllData)

module.exports = router
