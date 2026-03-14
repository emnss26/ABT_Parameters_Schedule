const backendUrl = import.meta.env.VITE_API_BACKEND_BASE_URL || "http://localhost:3000";

const VIEWER_STYLE_ID = "aps-viewer-style";
const VIEWER_SCRIPT_ID = "aps-viewer-script";
const ELEMENT_ID_PROP_FILTER = ["Revit Element ID", "Element Id", "ElementId", "Id"];
const ELEMENT_ID_PROP_NAMES = new Set(
  ELEMENT_ID_PROP_FILTER.map((name) => String(name).trim().toLowerCase())
);
const BULK_PROPS_CHUNK_SIZE = 1000;
const IN_PROGRESS_MATERIAL_NAME = "wbs-4d-in-progress-material";
const IN_PROGRESS_COLOR = 0xd92d20;
const IN_PROGRESS_OPACITY = 0.38;
const SEQUENCE_STATE_PRIORITY = {
  future: 1,
  completed: 2,
  "in-progress": 3,
};

let viewerInstance = null;
let assetsPromise = null;
let viewerElementIdIndex = null;
let viewerElementIdIndexPromise = null;
let viewerModelDbIds = null;
let viewerModelDbIdsPromise = null;
let fragmentIdsByDbId = new Map();
let overriddenFragments = new Map();
let inProgressMaterial = null;

const getAutodeskGlobal = () => {
  if (typeof window === "undefined") return null;
  return window.Autodesk || null;
};

const loadStyleOnce = () => {
  if (document.getElementById(VIEWER_STYLE_ID)) return;

  const link = document.createElement("link");
  link.id = VIEWER_STYLE_ID;
  link.rel = "stylesheet";
  link.href = "https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css";
  document.head.appendChild(link);
};

const loadScriptOnce = () =>
  new Promise((resolve, reject) => {
    const existing = document.getElementById(VIEWER_SCRIPT_ID);
    if (existing) {
      if (getAutodeskGlobal()?.Viewing) {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Autodesk Viewer script")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = VIEWER_SCRIPT_ID;
    script.src = "https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Autodesk Viewer script"));
    document.body.appendChild(script);
  });

const ensureViewerAssets = async () => {
  if (getAutodeskGlobal()?.Viewing) return;

  if (!assetsPromise) {
    assetsPromise = (async () => {
      loadStyleOnce();
      await loadScriptOnce();
    })();
  }

  await assetsPromise;
};

const normalizeBase64Url = (value) =>
  String(value || "")
    .trim()
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const isLikelyBase64 = (value) => /^[A-Za-z0-9_-]+$/.test(String(value || "").trim());
const toBase64Url = (value) => normalizeBase64Url(btoa(String(value || "")));

const toViewerDocumentId = (inputUrn) => {
  const value = String(inputUrn || "").trim();
  if (!value) return "";

  if (value.startsWith("urn:")) {
    const tail = value.slice(4).trim();
    if (tail && !tail.includes(":") && isLikelyBase64(tail)) {
      return `urn:${normalizeBase64Url(tail)}`;
    }

    return `urn:${toBase64Url(value)}`;
  }

  if (!value.includes(":") && isLikelyBase64(value)) {
    return `urn:${normalizeBase64Url(value)}`;
  }

  return `urn:${toBase64Url(`urn:${value}`)}`;
};

const fetchViewerToken = async () => {
  const endpoints = [`${backendUrl}/auth/token`, `${backendUrl}/api/auth/two-legged`];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        lastError = new Error(`Failed to fetch token from ${endpoint} (${response.status})`);
        continue;
      }

      const json = await response.json();
      const token = json?.data?.access_token || json?.access_token || null;
      if (token) return token;

      lastError = new Error(`Token response is empty in ${endpoint}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Backend did not return a valid viewer token");
};

const resetViewerCaches = () => {
  viewerElementIdIndex = null;
  viewerElementIdIndexPromise = null;
  viewerModelDbIds = null;
  viewerModelDbIdsPromise = null;
  fragmentIdsByDbId = new Map();
  overriddenFragments = new Map();
  inProgressMaterial = null;
};

const parsePositiveDbId = (value) => {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) return null;
    return value;
  }

  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const toValidDbIds = (dbIds = []) =>
  Array.from(
    new Set(
      (Array.isArray(dbIds) ? dbIds : [])
        .map(parsePositiveDbId)
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

const normalizeElementIdKeys = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return [];

  const keys = new Set([raw]);
  const compactDigits = raw.replace(/,/g, "");
  if (/^\d+(\.0+)?$/.test(compactDigits)) {
    keys.add(String(Math.trunc(Number(compactDigits))));
  }

  return Array.from(keys);
};

const getBulkPropertiesAsync = (model, dbIds, propFilter = ELEMENT_ID_PROP_FILTER) => {
  if (!model) return Promise.reject(new Error("Viewer model is not available"));
  if (!Array.isArray(dbIds) || dbIds.length === 0) return Promise.resolve([]);

  return new Promise((resolve, reject) => {
    model.getBulkProperties(
      dbIds,
      { propFilter },
      (results) => resolve(Array.isArray(results) ? results : []),
      (error) => reject(new Error(error?.message || String(error || "Bulk properties failed")))
    );
  });
};

const getInstanceTree = (model) => model?.getInstanceTree?.() || model?.getData?.()?.instanceTree || null;

const collectAllViewerDbIds = (model) => {
  const tree = getInstanceTree(model);
  if (!tree) {
    throw new Error("Viewer object tree is not available");
  }

  const rootId = tree.getRootId();
  const ids = [];

  if (rootId > 0) ids.push(rootId);

  tree.enumNodeChildren(
    rootId,
    (dbId) => {
      if (dbId > 0) ids.push(dbId);
    },
    true
  );

  return toValidDbIds(ids);
};

const extractElementIdKeysFromBulkResult = (result) => {
  const keys = new Set();
  const properties = Array.isArray(result?.properties) ? result.properties : [];

  properties.forEach((property) => {
    const name = String(property?.displayName || property?.attributeName || property?.name || "")
      .trim()
      .toLowerCase();

    if (!ELEMENT_ID_PROP_NAMES.has(name)) return;

    const value = property?.displayValue ?? property?.value ?? "";
    normalizeElementIdKeys(value).forEach((key) => keys.add(key));
  });

  return Array.from(keys);
};

const buildViewerElementIdIndex = async () => {
  if (!viewerInstance || !viewerInstance.model) {
    throw new Error("Viewer is not initialized");
  }

  const model = viewerInstance.model;
  const allDbIds = collectAllViewerDbIds(model);
  const index = new Map();

  for (let i = 0; i < allDbIds.length; i += BULK_PROPS_CHUNK_SIZE) {
    const chunk = allDbIds.slice(i, i + BULK_PROPS_CHUNK_SIZE);
    const results = await getBulkPropertiesAsync(model, chunk, ELEMENT_ID_PROP_FILTER);

    results.forEach((item) => {
      const dbId = parsePositiveDbId(item?.dbId);
      if (!dbId) return;

      const keys = extractElementIdKeysFromBulkResult(item);
      keys.forEach((key) => {
        if (!index.has(key)) index.set(key, dbId);
      });
    });
  }

  return index;
};

const getViewerElementIdIndex = async () => {
  if (viewerElementIdIndex) return viewerElementIdIndex;

  if (!viewerElementIdIndexPromise) {
    viewerElementIdIndexPromise = buildViewerElementIdIndex()
      .then((index) => {
        viewerElementIdIndex = index;
        return index;
      })
      .finally(() => {
        viewerElementIdIndexPromise = null;
      });
  }

  return viewerElementIdIndexPromise;
};

const getViewerModelDbIds = async () => {
  if (viewerModelDbIds) return viewerModelDbIds;

  if (!viewerModelDbIdsPromise) {
    viewerModelDbIdsPromise = Promise.resolve()
      .then(() => {
        if (!viewerInstance?.model) throw new Error("Viewer model is not available");
        return collectAllViewerDbIds(viewerInstance.model);
      })
      .then((dbIds) => {
        viewerModelDbIds = dbIds;
        return dbIds;
      })
      .finally(() => {
        viewerModelDbIdsPromise = null;
      });
  }

  return viewerModelDbIdsPromise;
};

const extractElementIdKeysFromRow = (row) => {
  const keys = new Set();

  normalizeElementIdKeys(row?.revitElementId).forEach((key) => keys.add(key));
  normalizeElementIdKeys(row?.externalElementId).forEach((key) => keys.add(key));
  normalizeElementIdKeys(row?.elementId).forEach((key) => keys.add(key));

  const rawProperties = Array.isArray(row?.rawProperties) ? row.rawProperties : [];
  rawProperties.forEach((property) => {
    const name = String(property?.name || "").trim().toLowerCase();
    if (!ELEMENT_ID_PROP_NAMES.has(name)) return;
    normalizeElementIdKeys(property?.value).forEach((key) => keys.add(key));
  });

  return Array.from(keys);
};

const extractDirectViewerDbIdFromRow = (row) => {
  const candidates = [row?.viewerDbId];

  const rawProperties = Array.isArray(row?.rawProperties) ? row.rawProperties : [];
  rawProperties.forEach((property) => {
    const name = String(property?.name || "").trim().toLowerCase();
    if (name === "dbid" || name === "db id") {
      candidates.push(property?.value);
    }
  });

  for (const candidate of candidates) {
    const parsed = parsePositiveDbId(candidate);
    if (parsed) return parsed;
  }

  return null;
};

const getFragmentList = (model) => model?.getFragmentList?.() || null;

const getFragmentMaterial = (fragList, fragId) => {
  if (!fragList) return null;
  if (typeof fragList.getMaterial === "function") return fragList.getMaterial(fragId) || null;
  return fragList.getVizmesh?.(fragId)?.material || null;
};

const setFragmentMaterial = (fragList, fragId, material) => {
  if (!fragList) return;
  if (typeof fragList.setMaterial === "function") {
    fragList.setMaterial(fragId, material);
    return;
  }

  const mesh = fragList.getVizmesh?.(fragId);
  if (mesh) mesh.material = material;
};

const getFragmentIdsForDbId = (dbId) => {
  const validDbId = parsePositiveDbId(dbId);
  if (!validDbId || !viewerInstance?.model) return [];

  if (fragmentIdsByDbId.has(validDbId)) {
    return fragmentIdsByDbId.get(validDbId);
  }

  const tree = getInstanceTree(viewerInstance.model);
  if (!tree) return [];

  const fragIds = [];
  tree.enumNodeFragments(validDbId, (fragId) => {
    if (Number.isFinite(fragId) && fragId >= 0) fragIds.push(fragId);
  });

  const uniqueFragIds = Array.from(new Set(fragIds));
  fragmentIdsByDbId.set(validDbId, uniqueFragIds);
  return uniqueFragIds;
};

const restoreOverriddenFragments = () => {
  if (!viewerInstance?.model || overriddenFragments.size === 0) {
    overriddenFragments.clear();
    return;
  }

  const fragList = getFragmentList(viewerInstance.model);
  if (!fragList) {
    overriddenFragments.clear();
    return;
  }

  overriddenFragments.forEach((originalMaterial, fragId) => {
    setFragmentMaterial(fragList, fragId, originalMaterial);
  });
  overriddenFragments.clear();

  try {
    viewerInstance.impl?.invalidate?.(true, true, true);
  } catch {
    return;
  }
};

const ensureInProgressMaterial = () => {
  if (inProgressMaterial) return inProgressMaterial;

  const THREE = typeof window !== "undefined" ? window.THREE : null;
  if (!THREE?.MeshPhongMaterial) {
    throw new Error("THREE is not available");
  }

  const material = new THREE.MeshPhongMaterial({
    color: IN_PROGRESS_COLOR,
    transparent: true,
    opacity: IN_PROGRESS_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.name = IN_PROGRESS_MATERIAL_NAME;

  try {
    viewerInstance?.impl?.matman?.().addMaterial?.(IN_PROGRESS_MATERIAL_NAME, material, true);
  } catch {
    // The viewer can still use the material even if the manager registration fails.
  }

  inProgressMaterial = material;
  return inProgressMaterial;
};

const applyMaterialToDbIds = (dbIds = []) => {
  if (!viewerInstance?.model) throw new Error("Viewer model is not available");

  const validDbIds = toValidDbIds(dbIds);
  if (!validDbIds.length) return;

  const model = viewerInstance.model;
  const fragList = getFragmentList(model);
  if (!fragList) return;

  model.unconsolidate?.();
  const material = ensureInProgressMaterial();

  validDbIds.forEach((dbId) => {
    const fragIds = getFragmentIdsForDbId(dbId);
    fragIds.forEach((fragId) => {
      if (!overriddenFragments.has(fragId)) {
        overriddenFragments.set(fragId, getFragmentMaterial(fragList, fragId));
      }
      setFragmentMaterial(fragList, fragId, material);
    });
  });

  viewerInstance.impl?.invalidate?.(true, true, true);
};

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const normalizeTimelineDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return isIsoDate(value) ? String(value) : "";
};

const resolveSequenceStatus = ({ currentDate, startDate, endDate }) => {
  if (currentDate > endDate) return "completed";
  if (currentDate >= startDate && currentDate <= endDate) return "in-progress";
  return "future";
};

const buildSequenceBuckets = ({ currentDate, items = [] }) => {
  const normalizedCurrentDate = normalizeTimelineDate(currentDate);
  if (!normalizedCurrentDate) {
    return { visibleDbIds: [], inProgressDbIds: [] };
  }

  const statusByDbId = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const dbId = parsePositiveDbId(item?.dbId);
    const startDate = normalizeTimelineDate(item?.startDate);
    const endDate = normalizeTimelineDate(item?.endDate);
    if (!dbId || !startDate || !endDate) return;

    const nextStatus = resolveSequenceStatus({
      currentDate: normalizedCurrentDate,
      startDate,
      endDate,
    });
    const previousStatus = statusByDbId.get(dbId);
    if (
      !previousStatus ||
      SEQUENCE_STATE_PRIORITY[nextStatus] > SEQUENCE_STATE_PRIORITY[previousStatus]
    ) {
      statusByDbId.set(dbId, nextStatus);
    }
  });

  const completedDbIds = [];
  const inProgressDbIds = [];

  statusByDbId.forEach((status, dbId) => {
    if (status === "completed") completedDbIds.push(dbId);
    if (status === "in-progress") inProgressDbIds.push(dbId);
  });

  return {
    visibleDbIds: toValidDbIds([...completedDbIds, ...inProgressDbIds]),
    inProgressDbIds: toValidDbIds(inProgressDbIds),
  };
};

const applyVisibilityState = async (visibleDbIds = []) => {
  if (!viewerInstance?.model) throw new Error("Viewer model is not available");

  const validVisibleDbIds = toValidDbIds(visibleDbIds);

  if (typeof viewerInstance.hideAll === "function") {
    viewerInstance.hideAll();
    if (validVisibleDbIds.length) viewerInstance.show(validVisibleDbIds);
    return;
  }

  const allDbIds = await getViewerModelDbIds();
  const visibleSet = new Set(validVisibleDbIds);
  const hiddenDbIds = allDbIds.filter((dbId) => !visibleSet.has(dbId));

  viewerInstance.showAll?.();
  if (hiddenDbIds.length) viewerInstance.hide?.(hiddenDbIds);
  if (validVisibleDbIds.length) viewerInstance.show?.(validVisibleDbIds);
};

export const resolveProjectWbs4DViewerDbIdsForRows = async (rows = []) => {
  if (!viewerInstance) throw new Error("Viewer is not initialized");
  if (!viewerInstance.model) throw new Error("Viewer model is still loading");

  const safeRows = Array.isArray(rows) ? rows : [];
  const resolvedDbIds = new Set();
  const unresolvedRows = [];
  const resolvedByRowIndex = new Array(safeRows.length).fill(null);

  let matchedDirectRows = 0;

  safeRows.forEach((row, rowIndex) => {
    const directDbId = extractDirectViewerDbIdFromRow(row);
    if (directDbId) {
      resolvedDbIds.add(directDbId);
      resolvedByRowIndex[rowIndex] = directDbId;
      matchedDirectRows += 1;
      return;
    }

    unresolvedRows.push({ row, rowIndex });
  });

  let matchedFromIndexRows = 0;
  let unmatchedRows = 0;

  if (unresolvedRows.length > 0) {
    const elementIdIndex = await getViewerElementIdIndex();

    unresolvedRows.forEach(({ row, rowIndex }) => {
      const keys = extractElementIdKeysFromRow(row);
      const matchedDbId = keys
        .map((key) => elementIdIndex.get(key))
        .map(parsePositiveDbId)
        .find((dbId) => Number.isFinite(dbId));

      if (matchedDbId) {
        resolvedDbIds.add(matchedDbId);
        resolvedByRowIndex[rowIndex] = matchedDbId;
        matchedFromIndexRows += 1;
      } else {
        unmatchedRows += 1;
      }
    });
  }

  return {
    dbIds: Array.from(resolvedDbIds),
    totalRows: safeRows.length,
    matchedDirectRows,
    matchedFromIndexRows,
    unmatchedRows,
    resolvedByRowIndex,
  };
};

export const clearProjectWbs4DSequence = () => {
  if (!viewerInstance) return;

  restoreOverriddenFragments();

  try {
    viewerInstance.showAll?.();
    viewerInstance.clearSelection?.();
    viewerInstance.impl?.invalidate?.(true, true, true);
  } catch {
    return;
  }
};

export const teardownProjectWbs4DViewer = () => {
  if (viewerInstance) {
    try {
      clearProjectWbs4DSequence();
    } finally {
      viewerInstance.finish();
      viewerInstance = null;
    }
  }

  resetViewerCaches();
};

export const applyProjectWbs4DSequence = async ({ currentDate, items = [] } = {}) => {
  if (!viewerInstance) throw new Error("Viewer is not initialized");
  if (!viewerInstance.model) throw new Error("Viewer model is still loading");

  const { visibleDbIds, inProgressDbIds } = buildSequenceBuckets({
    currentDate,
    items,
  });

  restoreOverriddenFragments();
  await applyVisibilityState(visibleDbIds);
  applyMaterialToDbIds(inProgressDbIds);
};

export const initProjectWbs4DViewer = async (urn, containerId = "WBS4DViewer") => {
  const rawUrn = String(urn || "").trim();
  if (!rawUrn) throw new Error("URN is required");

  await ensureViewerAssets();

  const Autodesk = getAutodeskGlobal();
  if (!Autodesk?.Viewing) throw new Error("Autodesk Viewer is not available");

  const token = await fetchViewerToken();

  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Viewer container '${containerId}' not found`);

  teardownProjectWbs4DViewer();
  container.innerHTML = "";
  container.style.width = "100%";
  container.style.height = "100%";

  const options = {
    env: "AutodeskProduction",
    api: "modelDerivativeV2",
    accessToken: token,
    getAccessToken: (cb) => cb(token, 3599),
  };

  await new Promise((resolve, reject) => {
    Autodesk.Viewing.Initializer(options, () => {
      const viewer = new Autodesk.Viewing.GuiViewer3D(container);
      const startCode = viewer.start();
      if (startCode !== 0) {
        reject(new Error(`Viewer failed to start (code ${startCode})`));
        return;
      }

      const documentId = toViewerDocumentId(rawUrn);
      if (!documentId) {
        reject(new Error("Invalid URN for viewer"));
        return;
      }

      Autodesk.Viewing.Document.load(
        documentId,
        (doc) => {
          const root = doc.getRoot();
          const defaultNode = root?.getDefaultGeometry();
          if (!defaultNode) {
            reject(new Error("Viewer could not find default geometry"));
            return;
          }

          viewer
            .loadDocumentNode(doc, defaultNode)
            .then(() => {
              viewerInstance = viewer;
              resetViewerCaches();

              const rootViewerNode = container.querySelector(".adsk-viewing-viewer");
              if (rootViewerNode) {
                rootViewerNode.style.width = "100%";
                rootViewerNode.style.height = "100%";
              }

              const doResize = () => {
                try {
                  viewer.resize();
                } catch {
                  return;
                }
              };

              doResize();
              if (typeof window !== "undefined") {
                window.requestAnimationFrame(doResize);
                window.setTimeout(doResize, 150);
              }

              resolve();
            })
            .catch((error) => reject(error));
        },
        (errorCode, errorMsg) => {
          reject(new Error(`Viewer document load error (${errorCode}): ${errorMsg}`));
        }
      );
    });
  });

  return viewerInstance;
};
