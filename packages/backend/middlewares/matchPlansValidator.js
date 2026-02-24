const { fetchReviewById } = require("../resources/libs/acc/acc.get.review.by.id.js");
const { fetchProjectSheets } = require("../resources/libs/acc/acc.get.project.sheets.js");
const { fetchFolderContents } = require("../resources/libs/data_management/data.management.get.folder.content.js");
const { fetchSheets } = require("../resources/libs/aec/aec.get.model.sheets.js");

function extractHeaders(req) {
  const token = req.cookies["access_token"];
  const altProjectId = req.headers["x-alt-project-id"];
  const selectedFolderId = req.headers["selected-folder-id"];

  return { token, altProjectId, selectedFolderId };
}

function validateHeaders({ token, altProjectId, selectedFolderId }, res) {
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Missing access token",
      data: null,
      error: "Unauthorized",
    });
  }
  if (!altProjectId || !selectedFolderId) {
    return res.status(400).json({
      success: false,
      message: "Missing required headers: x-alt-project-id and selected-folder-id",
      data: null,
      error: "MissingHeaders",
    });
  }
  return null;
}

module.exports = {
  extractHeaders,
  validateHeaders,
  fetchReviewById,
  fetchProjectSheets,
  fetchFolderContents,
  fetchSheets,
};