const express = require("express")

const checkSession = require("../../middlewares/checkSession")
const { GetProjects } = require("../controllers/acc/acc.projects.controller")

const router = express.Router()

// Protect all ACC routes with session validation/refresh.
router.use(checkSession)

router.get("/acc-projects", GetProjects)

module.exports = router
