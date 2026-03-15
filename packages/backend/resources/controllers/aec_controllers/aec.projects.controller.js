const axios = require("axios")
const { fetchProjectById, fetchProjects } = require("../../libs/aec/aec.get.project.js")
const { fetchHubs } = require("../../libs/aec/aec.get.hubs.js")
const { fetchAccProjects } = require("../../libs/acc/acc.get.projects.js")

const HUBNAME = process.env.HUBNAME

/**
 * Returns the Data Management (REST) hub id ("b.xxxx") for a given hub name.
 * Note: The AEC GraphQL hub id ("urn:adsk.ace:...") is not compatible with DM/ACC REST endpoints.
 */
async function getDataManagementHubId(token, hubName) {
  try {
    const { data } = await axios.get("https://developer.api.autodesk.com/project/v1/hubs", {
      headers: { Authorization: `Bearer ${token}` },
    })

    const hub = (data?.data || []).find((h) => h?.attributes?.name === hubName)
    return hub?.id || null
  } catch (err) {
    console.warn("Could not fetch DM Hub ID via REST:", err?.message || err)
    return null
  }
}

const getMatchedAecHub = async (token) => {
  const aecHubs = await fetchHubs(token)
  const matchedAecHub = (aecHubs || []).find((hub) => hub?.name === HUBNAME)

  if (!matchedAecHub) {
    const err = new Error(`AEC Hub not found: ${HUBNAME}`)
    err.status = 404
    throw err
  }

  return matchedAecHub
}

const toProjectMetadata = (project = {}) => ({
  projectId: String(project?.id || "").trim(),
  projectName: String(project?.name || "").trim(),
  altProjectId: String(project?.alternativeIdentifiers?.dataManagementAPIProjectId || "").trim(),
})

const GetAECProjects = async (req, res, next) => {
  try {
    const token = req.cookies?.access_token

    if (!token) {
      const err = new Error("Authorization token is required")
      err.status = 401
      err.code = "Unauthorized"
      return next(err)
    }

    const matchedAecHub = await getMatchedAecHub(token)

    const aecHubId = matchedAecHub.id 
    const dmHubId = await getDataManagementHubId(token, HUBNAME) 

    const aecProjects = await fetchProjects(token, aecHubId)

    let dmProjects = null
    if (dmHubId) {
      try {
        dmProjects = await fetchAccProjects(token, dmHubId)
      } catch (dmProjectsError) {
        console.warn("Could not fetch ACC project status via REST:", dmProjectsError?.message || dmProjectsError)
      }
    } else {
      console.warn("Skipping ACC status check because DM Hub ID was not found.")
    }

    const hasReliableDmStatus = Boolean(dmHubId && Array.isArray(dmProjects))

    const activeDmProjectIds = new Set()

    ;(dmProjects || []).forEach((dmProj) => {
      const statusRaw =
        dmProj?.attributes?.status ??
        dmProj?.attributes?.extension?.data?.projectStatus ??
        "active"

      const status = String(statusRaw).toLowerCase()

      if (status === "active") {
        activeDmProjectIds.add(dmProj.id) 
      }
    })

    const finalProjects = (aecProjects || []).filter((aecProj) => {
      const linkedId = aecProj?.alternativeIdentifiers?.dataManagementAPIProjectId
      if (!linkedId) return false
      if (!hasReliableDmStatus) return true
      return activeDmProjectIds.has(linkedId)
    })

    return res.status(200).json({
      success: true,
      message: "Proyectos activos obtenidos correctamente",
      data: { aecProjects: finalProjects },
      error: null,
    })
  } catch (err) {
    console.error("GetAECProjects Error:", err)
    err.code = err.code || "AECProjectsFetchFailed"
    return next(err)
  }
}

const GetAECProjectMetadata = async (req, res, next) => {
  try {
    const token = req.cookies?.access_token
    const { projectId } = req.params

    if (!token) {
      const err = new Error("Authorization token is required")
      err.status = 401
      err.code = "Unauthorized"
      return next(err)
    }

    if (!String(projectId || "").trim()) {
      const err = new Error("Project ID is required")
      err.status = 400
      err.code = "ValidationError"
      return next(err)
    }

    const matchedAecHub = await getMatchedAecHub(token)
    const project = await fetchProjectById(token, matchedAecHub.id, projectId)

    if (!project) {
      const err = new Error("Project not found")
      err.status = 404
      err.code = "ProjectNotFound"
      return next(err)
    }

    res.set("Cache-Control", "no-store")

    return res.status(200).json({
      success: true,
      message: "Project metadata retrieved successfully",
      data: toProjectMetadata(project),
      error: null,
    })
  } catch (err) {
    err.code = err.code || "AECProjectMetadataFetchFailed"
    return next(err)
  }
}

module.exports = { GetAECProjects, GetAECProjectMetadata }
