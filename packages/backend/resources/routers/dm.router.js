const express = require("express")

const checkSession = require("../../middlewares/checkSession")
const { GetDMProjectFolders } = require("../controllers/data_management_controllers/dm.project.folders")

const router = express.Router()

router.use(checkSession)

router.get("/project-folders", GetDMProjectFolders)

module.exports = router
