const { fetchTopFoldersRest } = require("../../resources/libs/dm/dm.get.topfolder.js");
const { fetchSubFoldersRest } = require("../../resources/libs/dm/dm.get.subfolder.js");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createWorkQueue(concurrency) {
  let running = 0;
  const queue = [];
  let idleResolve = null;

  const onIdle = () =>
    new Promise((resolve) => {
      if (running === 0 && queue.length === 0) return resolve();
      idleResolve = resolve;
    });

  const pump = () => {
    while (running < concurrency && queue.length) {
      const task = queue.shift();
      running += 1;

      Promise.resolve()
        .then(task)
        .catch(() => {})
        .finally(() => {
          running -= 1;
          pump();

          if (running === 0 && queue.length === 0 && idleResolve) {
            idleResolve();
            idleResolve = null;
          }
        });
    }
  };

  const push = (task) => {
    queue.push(task);
    pump();
  };

  return { push, onIdle };
}

function createRateLimiter({ maxConcurrent = 4, minTimeMs = 80 }) {
  let active = 0;
  let lastStart = 0;
  let pauseUntil = 0;
  const waiters = [];

  const acquire = async () => {
    while (active >= maxConcurrent) {
      await new Promise((resolve) => waiters.push(resolve));
    }
    active += 1;
  };

  const release = () => {
    active -= 1;
    if (waiters.length) waiters.shift()();
  };

  const waitTurn = async () => {
    const now = Date.now();
    if (now < pauseUntil) await sleep(pauseUntil - now);

    const elapsed = now - lastStart;
    if (elapsed < minTimeMs) await sleep(minTimeMs - elapsed);

    lastStart = Date.now();
  };

  const run = async (fn) => {
    await acquire();
    try {
      await waitTurn();
      return await fn();
    } finally {
      release();
    }
  };

  const pause = (ms) => {
    pauseUntil = Math.max(pauseUntil, Date.now() + ms);
  };

  return { run, pause };
}

async function fetchFolderTree(token, projectId) {
  const dmId = projectId;

  // Tunable via environment variables without code changes.
  const MAX_CONCURRENCY = Number(process.env.DM_TREE_CONCURRENCY || 4);
  const MIN_TIME_MS = Number(process.env.DM_TREE_MIN_TIME_MS || 80);
  const RETRIES = Number(process.env.DM_TREE_RETRIES || 6);

  const limiter = createRateLimiter({
    maxConcurrent: MAX_CONCURRENCY,
    minTimeMs: MIN_TIME_MS,
  });
  const queue = createWorkQueue(MAX_CONCURRENCY);

  // Cache by folderId and reuse in-flight promises to avoid duplicate requests.
  const childrenPromiseCache = new Map();

  // Keep one node instance per folder id to avoid duplicated subtree builds.
  const nodeById = new Map();

  const getNode = (info) => {
    if (nodeById.has(info.id)) return nodeById.get(info.id);

    const node = {
      id: info.id,
      name: info.name,
      objectCount: info.objectCount || 0,
      type: "folders",
      children: [],
    };

    nodeById.set(info.id, node);
    return node;
  };

  const retry = async (operation, label) => {
    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
      try {
        return await limiter.run(operation);
      } catch (error) {
        const status = error.response?.status;
        const retryable = status === 429 || status >= 500;
        if (!retryable || attempt === RETRIES - 1) throw error;

        const retryAfter = Number(error.response?.headers?.["retry-after"]);
        let waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.ceil(retryAfter * 1000)
          : 1000 * Math.pow(2, attempt);

        waitMs += Math.floor(Math.random() * 250);
        limiter.pause(waitMs);
        console.warn(`APS ${status} on "${label}". Retry ${attempt + 1}/${RETRIES} in ${waitMs}ms.`);
        await sleep(waitMs);
      }
    }

    return null;
  };

  const getChildrenInfo = (folderNode) => {
    if (childrenPromiseCache.has(folderNode.id)) {
      return childrenPromiseCache.get(folderNode.id);
    }

    const promise = retry(
      () => fetchSubFoldersRest(token, dmId, folderNode.id),
      folderNode.name || folderNode.id
    );

    childrenPromiseCache.set(folderNode.id, promise);
    return promise;
  };

  const topInfos = await retry(() => fetchTopFoldersRest(token, dmId), "topFolders");
  const roots = (topInfos || []).map(getNode);

  const expanded = new Set();
  const expand = (node) => {
    queue.push(async () => {
      if (expanded.has(node.id)) return;
      expanded.add(node.id);

      try {
        const childrenInfos = await getChildrenInfo(node);
        const childNodes = (childrenInfos || []).map(getNode);
        node.children = childNodes;
        childNodes.forEach((child) => expand(child));
      } catch (_err) {
        console.error(`Unrecoverable folder error on "${node.name}". Children will be skipped.`);
        node.children = [];
        node.error = "Load failed";
      }
    });
  };

  roots.forEach((root) => expand(root));
  await queue.onIdle();

  return roots;
}

module.exports = { fetchFolderTree };
