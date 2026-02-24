const { fetchTopFoldersGraphql } = require("../../resources/libs/aec/aec.get.topfolder.js")
const { fetchSubFolders } = require("../../resources/libs/aec/aec.get.subfolder.js")

// Helper para pausas
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryOperation(operation, folderName, retries = 5) { // Subimos a 5 intentos
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      const isRateLimit = error.message.includes("Too many requests") || error.message.includes("429");
      const isServerErr = error.message.includes("Internal Server Error") || error.message.includes("500") || error.message.includes("503");

      if (i === retries - 1) throw error; // Último intento, bye.

      if (isRateLimit || isServerErr) {
        // Backoff exponencial más suave: 500ms, 1000ms, 2000ms...
        const waitTime = 500 * Math.pow(2, i);
        console.log(`⏳ Busy! Reintentando (${i + 1}/${retries}) en "${folderName}". Wait: ${waitTime}ms.`);
        await delay(waitTime);
      } else {
        throw error; // Otro error no se reintenta
      }
    }
  }
}

async function processListInBatches(items, asyncFn, batchSize = 6) { // Subimos Batch a 6
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Ejecutamos lote en paralelo
    const batchResults = await Promise.all(batch.map(item => asyncFn(item)));
    results.push(...batchResults);

    // Pausa dinámica: Si el lote es grande, descansamos un poco más
    if (i + batchSize < items.length) {
        await delay(150); // 150ms de respiro
    }
  }
  return results;
}

async function fetchFolderTree(token, projectId) {
  const topFolders = await fetchTopFoldersGraphql(token, projectId)

  const buildNode = async (folder) => {
    try {
      const children = await retryOperation(
        () => fetchSubFolders(token, projectId, folder.id),
        folder.name
      );
      
      // Procesamos hijos con batch de 6
      const childrenNodes = await processListInBatches(children, buildNode, 6);

      return { ...folder, children: childrenNodes }
    } catch (error) {
      console.warn(`⚠️ Skip carpeta "${folder.name}": ${error.message}`);
      return { ...folder, children: [], error: "Load failed" };
    }
  }

  // Procesamos raíces con batch de 6
  return await processListInBatches(topFolders, buildNode, 6);
}

module.exports = { fetchFolderTree }