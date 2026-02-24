const express = require("express")
const checkSession = require("../../middlewares/checkSession")

const {
  GetThreeLegged,
  GetToken,
  PostLogout,
} = require("../controllers/auth/auth.controller")
const {
  GetUserProfile,
} = require("../controllers/auth/auth.user.profile.controller")

const router = express.Router()

// OAuth
router.get("/three-legged", GetThreeLegged)
router.get("/token", checkSession, GetToken)
router.post("/logout", PostLogout)

// User
router.get("/userprofile", GetUserProfile)

module.exports = router
