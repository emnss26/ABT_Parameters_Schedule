const { fetchTopFoldersGraphql } = require("../../resources/libs/aec/aec.get.topfolder.js");
const { fetchSubFolders } = require("../../resources/libs/aec/aec.get.subfolder.js");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryOperation(operation, retries = 5) {
  for (let i = 0; i < retries; i += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = String(error?.message || "");
      const isRateLimit = message.includes("Too many requests") || message.includes("429");
      const isServerError =
        message.includes("Internal Server Error") ||
        message.includes("500") ||
        message.includes("503");

      if (i === retries - 1) throw error;
      if (!isRateLimit && !isServerError) throw error;

      const waitTime = 500 * Math.pow(2, i);
      await delay(waitTime);
    }
  }

  return null;
}

async function processListInBatches(items, asyncFn, batchSize = 6) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((item) => asyncFn(item)));
    results.push(...batchResults);

    if (i + batchSize < items.length) {
      await delay(150);
    }
  }
  return results;
}

async function fetchFolderTree(token, projectId) {
  const topFolders = await fetchTopFoldersGraphql(token, projectId);

  const buildNode = async (folder) => {
    try {
      const children = await retryOperation(
        () => fetchSubFolders(token, projectId, folder.id),
        5
      );

      const childNodes = await processListInBatches(children, buildNode, 6);
      return { ...folder, children: childNodes };
    } catch (error) {
      console.warn(`Skipping folder "${folder.name}": ${error.message}`);
      return { ...folder, children: [], error: "Load failed" };
    }
  };

  return processListInBatches(topFolders, buildNode, 6);
}

module.exports = { fetchFolderTree };
