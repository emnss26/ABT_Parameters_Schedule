const backendUrl = import.meta.env.VITE_API_BACKEND_BASE_URL || "http://localhost:3000";

const VIEWER_STYLE_ID = "aps-viewer-style";
const VIEWER_SCRIPT_ID = "aps-viewer-script";
const ELEMENT_ID_PROP_FILTER = ["Revit Element ID", "Revit Element Id", "Element Id", "ElementId", "Id"];
const ASSEMBLY_CODE_PROP_FILTER = ["Assembly Code", "OmniClass Number"];
const ASSEMBLY_DESCRIPTION_PROP_FILTER = ["Assembly Description", "OmniClass Title"];
const DB_ID_PROP_FILTER = ["DbId", "dbId", "Db Id"];
const SNAPSHOT_PROP_FILTER = [
  ...ELEMENT_ID_PROP_FILTER,
  ...ASSEMBLY_CODE_PROP_FILTER,
  ...ASSEMBLY_DESCRIPTION_PROP_FILTER,
  ...DB_ID_PROP_FILTER,
];
const BULK_PROPS_CHUNK_SIZE = 1000;
const IN_PROGRESS_MATERIAL_NAME = "wbs-4d-in-progress-material";
const IN_PROGRESS_COLOR = 0xd92d20;
const IN_PROGRESS_OPACITY = 0.72;
const SEQUENCE_STATE_PRIORITY = {
  future: 1,
  completed: 2,
  "in-progress": 3,
};

let viewerInstance = null;
let assetsPromise = null;
let viewerElementIdIndex = null;
let viewerElementIdIndexPromise = null;
let viewerLeafDbIds = null;
let viewerLeafDbIdsPromise = null;
let viewerModelDbIds = null;
let viewerModelDbIdsPromise = null;
let fragmentIdsByDbId = new Map();
let overriddenFragments = new Map();
let inProgressMaterial = null;
let lastSequenceStateKey = "";
let sequenceCleared = false;

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
  viewerLeafDbIds = null;
  viewerLeafDbIdsPromise = null;
  viewerModelDbIds = null;
  viewerModelDbIdsPromise = null;
  fragmentIdsByDbId = new Map();
  overriddenFragments = new Map();
  inProgressMaterial = null;
  lastSequenceStateKey = "";
  sequenceCleared = false;
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

const toPropertyLookupKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const makePropertyNameSet = (names = []) =>
  new Set((Array.isArray(names) ? names : [names]).map(toPropertyLookupKey).filter(Boolean));

const ELEMENT_ID_PROP_NAMES = makePropertyNameSet(ELEMENT_ID_PROP_FILTER);
const ASSEMBLY_CODE_PROP_NAMES = makePropertyNameSet(ASSEMBLY_CODE_PROP_FILTER);
const ASSEMBLY_DESCRIPTION_PROP_NAMES = makePropertyNameSet(ASSEMBLY_DESCRIPTION_PROP_FILTER);
const DB_ID_PROP_NAMES = makePropertyNameSet(DB_ID_PROP_FILTER);

const toValidDbIds = (dbIds = []) =>
  Array.from(
    new Set(
      (Array.isArray(dbIds) ? dbIds : [])
        .map(parsePositiveDbId)
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

const buildDbIdSignature = (dbIds = []) =>
  toValidDbIds(dbIds)
    .sort((left, right) => left - right)
    .join(",");

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

const toNullableText = (value) => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

const normalizeElementIdValue = (value) => {
  const keys = normalizeElementIdKeys(value);
  if (!keys.length) return null;
  return keys.find((key) => /^\d+$/.test(String(key || ""))) || keys[0] || null;
};

const getPropertyLookupKey = (property = {}) =>
  toPropertyLookupKey(property?.displayName || property?.attributeName || property?.name || "");

const pickPropertyValueFromList = (properties = [], allowedNames = new Set()) => {
  const list = Array.isArray(properties) ? properties : [];
  for (const property of list) {
    if (!allowedNames.has(getPropertyLookupKey(property))) continue;
    const value = property?.displayValue ?? property?.value ?? "";
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
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

const collectLeafViewerDbIds = (model) => {
  const tree = getInstanceTree(model);
  if (!tree) {
    throw new Error("Viewer object tree is not available");
  }

  const rootId = tree.getRootId();
  if (!Number.isFinite(rootId) || rootId <= 0) return [];

  const leafIds = [];
  const stack = [rootId];

  while (stack.length > 0) {
    const currentDbId = stack.pop();
    if (!Number.isFinite(currentDbId) || currentDbId <= 0) continue;

    const directChildren = [];
    tree.enumNodeChildren(
      currentDbId,
      (childDbId) => {
        if (Number.isFinite(childDbId) && childDbId > 0) {
          directChildren.push(childDbId);
        }
      },
      false
    );

    if (!directChildren.length) {
      leafIds.push(currentDbId);
      continue;
    }

    for (let i = directChildren.length - 1; i >= 0; i -= 1) {
      stack.push(directChildren[i]);
    }
  }

  return toValidDbIds(leafIds);
};

const extractElementIdKeysFromBulkResult = (result) => {
  const keys = new Set();
  const properties = Array.isArray(result?.properties) ? result.properties : [];

  properties.forEach((property) => {
    if (!ELEMENT_ID_PROP_NAMES.has(getPropertyLookupKey(property))) return;

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

const getViewerLeafDbIds = async () => {
  if (viewerLeafDbIds) return viewerLeafDbIds;

  if (!viewerLeafDbIdsPromise) {
    viewerLeafDbIdsPromise = Promise.resolve()
      .then(() => {
        if (!viewerInstance?.model) throw new Error("Viewer model is not available");
        return collectLeafViewerDbIds(viewerInstance.model);
      })
      .then((dbIds) => {
        viewerLeafDbIds = dbIds;
        return dbIds;
      })
      .finally(() => {
        viewerLeafDbIdsPromise = null;
      });
  }

  return viewerLeafDbIdsPromise;
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
    if (!ELEMENT_ID_PROP_NAMES.has(toPropertyLookupKey(property?.name))) return;
    normalizeElementIdKeys(property?.value).forEach((key) => keys.add(key));
  });

  return Array.from(keys);
};

const extractDirectViewerDbIdFromRow = (row) => {
  const candidates = [row?.viewerDbId];

  const rawProperties = Array.isArray(row?.rawProperties) ? row.rawProperties : [];
  rawProperties.forEach((property) => {
    if (DB_ID_PROP_NAMES.has(toPropertyLookupKey(property?.name))) {
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
    transparent: false,
    opacity: IN_PROGRESS_OPACITY,
    depthWrite: true,
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

const configureViewerVisualState = (viewer) => {
  if (!viewer) return;

  try {
    viewer.setGhosting?.(false);
  } catch {
    // Ignore unsupported viewer APIs.
  }

  try {
    viewer.impl?.toggleGhosting?.(false);
  } catch {
    // Ignore unsupported viewer APIs.
  }

  try {
    viewer.prefs?.set?.("ghosting", false);
  } catch {
    // Ignore unsupported viewer APIs.
  }
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

const mapBulkResultToViewerSnapshotRow = (result = {}) => {
  const dbId = parsePositiveDbId(result?.dbId);
  if (!dbId) return null;

  const properties = Array.isArray(result?.properties) ? result.properties : [];
  return {
    dbId,
    revitElementId: normalizeElementIdValue(pickPropertyValueFromList(properties, ELEMENT_ID_PROP_NAMES)),
    assemblyCode: toNullableText(pickPropertyValueFromList(properties, ASSEMBLY_CODE_PROP_NAMES)),
    assemblyDescription: toNullableText(
      pickPropertyValueFromList(properties, ASSEMBLY_DESCRIPTION_PROP_NAMES)
    ),
  };
};

export const isProjectWbs4DViewerReady = () => Boolean(viewerInstance?.model);

export const extractProjectWbs4DViewerLeafSnapshot = async () => {
  if (!viewerInstance) throw new Error("Viewer is not initialized");
  if (!viewerInstance.model) throw new Error("Viewer model is still loading");

  const model = viewerInstance.model;
  const leafDbIds = await getViewerLeafDbIds();
  const rowsByDbId = new Map();

  let skippedRows = 0;
  let missingElementIdRows = 0;
  let missingAssemblyDataRows = 0;

  for (let i = 0; i < leafDbIds.length; i += BULK_PROPS_CHUNK_SIZE) {
    const chunk = leafDbIds.slice(i, i + BULK_PROPS_CHUNK_SIZE);
    const results = await getBulkPropertiesAsync(model, chunk, SNAPSHOT_PROP_FILTER);

    results.forEach((result) => {
      const row = mapBulkResultToViewerSnapshotRow(result);
      if (!row?.dbId) {
        skippedRows += 1;
        return;
      }

      const hasElementId = Boolean(row.revitElementId);
      const hasAssemblyData = Boolean(row.assemblyCode || row.assemblyDescription);
      const hasUsefulData = hasElementId || hasAssemblyData;

      if (!hasElementId) missingElementIdRows += 1;
      if (!hasAssemblyData) missingAssemblyDataRows += 1;

      if (!hasUsefulData) {
        skippedRows += 1;
        return;
      }

      const existing = rowsByDbId.get(row.dbId);
      if (!existing) {
        rowsByDbId.set(row.dbId, row);
        return;
      }

      rowsByDbId.set(row.dbId, {
        dbId: row.dbId,
        revitElementId: existing.revitElementId || row.revitElementId || null,
        assemblyCode: existing.assemblyCode || row.assemblyCode || null,
        assemblyDescription: existing.assemblyDescription || row.assemblyDescription || null,
      });
    });
  }

  const rows = Array.from(rowsByDbId.values());
  const matchableRows = rows.filter((row) => row.assemblyCode || row.assemblyDescription).length;

  return {
    rows,
    stats: {
      totalLeafNodes: leafDbIds.length,
      extractedRows: rows.length,
      matchableRows,
      missingElementIdRows,
      missingAssemblyDataRows,
      skippedRows,
    },
  };
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
  if (sequenceCleared && overriddenFragments.size === 0) return;

  restoreOverriddenFragments();

  try {
    viewerInstance.showAll?.();
    viewerInstance.clearSelection?.();
    viewerInstance.impl?.invalidate?.(true, true, true);
    lastSequenceStateKey = "";
    sequenceCleared = true;
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
  const nextSequenceStateKey = `${buildDbIdSignature(visibleDbIds)}|${buildDbIdSignature(inProgressDbIds)}`;

  if (!sequenceCleared && nextSequenceStateKey === lastSequenceStateKey) {
    return;
  }

  restoreOverriddenFragments();
  await applyVisibilityState(visibleDbIds);
  applyMaterialToDbIds(inProgressDbIds);
  lastSequenceStateKey = nextSequenceStateKey;
  sequenceCleared = false;
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
              configureViewerVisualState(viewer);

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
