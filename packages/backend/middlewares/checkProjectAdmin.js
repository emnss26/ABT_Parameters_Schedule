const { getACCProjectUser } = require("../utils/auth_utils/auth.utils");

/**
 * Middleware to verify if the user is a project admin in the specified project
 * Requirements:
 * - User must be authenticated (checkSession must run first)
 * - User must have projectAdmin access level in the project
 */
async function checkProjectAdmin(req, res, next) {
  try {
    // Validate that user is authenticated
    if (!req.user || !req.user.sub) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Get project ID from route params
    const { projectId } = req.params;
    if (!projectId) {
      return res
        .status(400)
        .json({ message: "Project ID is required in the request" });
    }

    // Get access token from cookies
    const accessToken = req.cookies?.access_token;
    if (!accessToken) {
      return res.status(401).json({ message: "Access token not found" });
    }

    // Fetch user's project profile from Autodesk ACC
    // req.user.sub contains the Autodesk ID from the JWT
    const userProfile = await getACCProjectUser(
      accessToken,
      projectId,
      req.user.sub
    );

    // Check if user is project admin
    if (!userProfile.accessLevels?.projectAdmin) {
      return res.status(403).json({
        message:
          "You do not have project admin access to perform this action",
        required: "projectAdmin",
        current: userProfile.accessLevels,
      });
    }

    // Attach user profile to request for downstream handlers
    req.userProfile = userProfile;

    next();
  } catch (error) {
    console.error("checkProjectAdmin error:", error.message);

    // Distinguish between different error types
    if (error.response?.status === 404) {
      return res.status(404).json({ message: "Project or user not found in ACC" });
    }

    if (error.response?.status === 403) {
      return res.status(403).json({ message: "Not authorized to access this project" });
    }

    return res.status(500).json({
      message: "Failed to verify project admin access",
      error: error.message,
    });
  }
}

module.exports = checkProjectAdmin;
