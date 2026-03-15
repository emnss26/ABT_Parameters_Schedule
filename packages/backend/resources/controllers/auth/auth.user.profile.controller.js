const toText = (value) => String(value ?? "").trim()

const buildProfilePayload = (source = {}) => ({
  id: toText(source?.sub || source?.userId || source?.uid) || null,
  email: toText(source?.email || source?.emailId) || null,
  name: toText(source?.name || source?.displayName || source?.userName) || null,
})

const GetUserProfile = async (req, res, next) => {
  try {
    const payload = buildProfilePayload(req.user)

    if (!payload.id && !payload.email && !payload.name) {
      const err = new Error("Missing authenticated user context")
      err.status = 401
      err.code = "Unauthorized"
      return next(err)
    }

    // Prevent caching sensitive profile data.
    res.set("Cache-Control", "no-store")

    return res.status(200).json({
      success: true,
      message: "Perfil de usuario obtenido correctamente",
      data: payload,
      error: null,
    })
  } catch (err) {
    err.code = err.code || "ProfileFetchFailed"
    return next(err)
  }
}

module.exports = { GetUserProfile }
