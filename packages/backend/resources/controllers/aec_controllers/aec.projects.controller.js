const axios = require("axios")
const { fetchProjects } = require("../../libs/aec/aec.get.project.js")
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

const GetAECProjects = async (req, res, next) => {
  try {
    const token = req.cookies?.access_token

    if (!token) {
      const err = new Error("Authorization token is required")
      err.status = 401
      err.code = "Unauthorized"
      return next(err)
    }

    const aecHubs = await fetchHubs(token)
    const matchedAecHub = (aecHubs || []).find((hub) => hub?.name === HUBNAME)

    if (!matchedAecHub) {
      const err = new Error(`AEC Hub not found: ${HUBNAME}`)
      err.status = 404
      return next(err)
    }

    const aecHubId = matchedAecHub.id 
    const dmHubId = await getDataManagementHubId(token, HUBNAME) 

    const [aecProjects, dmProjects] = await Promise.all([
      fetchProjects(token, aecHubId),
      dmHubId ? fetchAccProjects(token, dmHubId) : Promise.resolve([]),
    ])

    if (!dmHubId) {
      console.warn("Skipping ACC status check because DM Hub ID was not found.")
    }

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
     
      if (activeDmProjectIds.size === 0) return true

      const linkedId = aecProj?.alternativeIdentifiers?.dataManagementAPIProjectId
      return Boolean(linkedId && activeDmProjectIds.has(linkedId))
    })

    return res.status(200).json({
      success: true,
      message: "Active Projects retrieved successfully",
      data: { aecProjects: finalProjects },
      error: null,
    })
  } catch (err) {
    console.error("GetAECProjects Error:", err)
    err.code = err.code || "AECProjectsFetchFailed"
    return next(err)
  }
}

module.exports = { GetAECProjects }
