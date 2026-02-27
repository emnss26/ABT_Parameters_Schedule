const knex = require("../../../utils/db/knex");
const { fetchAllModelParameters } = require("../../libs/aec/aec.get.model.parameters.by.category");

const WBS_CODE_REGEX = /^\d+(\.\d+)*$/;
const DESCRIPTION_MATCH_THRESHOLD = 0.45;
const AMBIGUOUS_GAP_THRESHOLD = 0.05;

const toText = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(toText(value));

const normalizeIsoDate = (value) => {
  const raw = toText(value);
  if (!raw) return null;
  return isIsoDate(raw) ? raw : null;
};

const toIsoDateFromDbValue = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const raw = toText(value);
  if (!raw) return null;
  if (isIsoDate(raw)) return raw;

  // Accept full ISO date-time strings and convert to date-only.
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return null;
};

const normalizeCodeLookup = (value) => {
  const raw = toText(value).replace(/\s+/g, "");
  if (!raw) return "";

  if (WBS_CODE_REGEX.test(raw)) {
    return raw.replace(/\.+/g, ".").replace(/\.$/, "");
  }

  return raw.toUpperCase();
};

const normalizeWbsCode = (value) => {
  const code = normalizeCodeLookup(value);
  if (!WBS_CODE_REGEX.test(code)) return "";
  return code;
};

const getWbsLevel = (code) => normalizeWbsCode(code).split(".").filter(Boolean).length;

const getParentCode = (code) => {
  const parts = normalizeWbsCode(code).split(".").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join(".");
};

const parseCost = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(2);
};

const parsePositiveInt = (value) => {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) return null;
    return value;
  }
  const text = toText(value);
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseJson = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return null;
  }
};

const compareWbsCodes = (a, b) => {
  const aParts = normalizeWbsCode(a).split(".").map((n) => Number(n));
  const bParts = normalizeWbsCode(b).split(".").map((n) => Number(n));
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const av = Number.isFinite(aParts[i]) ? aParts[i] : -1;
    const bv = Number.isFinite(bParts[i]) ? bParts[i] : -1;
    if (av !== bv) return av - bv;
  }
  return 0;
};

const sanitizeWbsRows = (rows = []) => {
  if (!Array.isArray(rows)) return [];

  const out = [];
  const seenCodes = new Set();

  for (const row of rows) {
    const code = normalizeWbsCode(row?.code || row?.wbsCode);
    const title = toText(row?.title || row?.name || row?.activity);
    if (!code || !title) continue;

    const level = getWbsLevel(code);
    if (!level || level > 4) continue;

    if (seenCodes.has(code)) {
      throw new Error(`Duplicate WBS code detected: ${code}`);
    }
    seenCodes.add(code);

    const startDate = normalizeIsoDate(row?.startDate || row?.start_date);
    const endDate = normalizeIsoDate(row?.endDate || row?.end_date);

    out.push({
      code,
      title,
      level,
      parentCode: getParentCode(code),
      startDate,
      endDate,
      durationLabel: toText(row?.duration || row?.durationLabel || row?.duration_label),
      baselineStartDate: normalizeIsoDate(row?.baselineStartDate || row?.baseline_start_date),
      baselineEndDate: normalizeIsoDate(row?.baselineEndDate || row?.baseline_end_date),
      actualStartDate: normalizeIsoDate(row?.actualStartDate || row?.actual_start_date),
      actualEndDate: normalizeIsoDate(row?.actualEndDate || row?.actual_end_date),
      actualProgressPct:
        row?.actualProgressPct === undefined || row?.actualProgressPct === null
          ? null
          : Number(row.actualProgressPct),
      plannedCost: parseCost(row?.plannedCost || row?.planned_cost),
      actualCost: parseCost(row?.actualCost || row?.actual_cost),
      extraProps: row?.extraProps || row?.extra_props || null,
    });
  }

  return out.sort((a, b) => compareWbsCodes(a.code, b.code));
};

const normalizeText = (value) =>
  toText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOPWORDS = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "and",
  "the",
  "for",
  "con",
  "sin",
  "por",
  "para",
]);

const tokenizeText = (value) =>
  normalizeText(value)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t && t.length >= 3 && !STOPWORDS.has(t));

const toTokenSet = (value) => new Set(tokenizeText(value));

const similarityScore = (leftSet, rightSet) => {
  if (!leftSet.size || !rightSet.size) return 0;
  let intersection = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) intersection += 1;
  });
  const coverage = intersection / rightSet.size;
  const union = new Set([...leftSet, ...rightSet]).size || 1;
  const jaccard = intersection / union;
  return Math.max(coverage, jaccard);
};

const getActiveWbsSet = async ({ projectId, modelId }) => {
  if (modelId) {
    const byBinding = await knex("wbs_model_bindings as b")
      .join("wbs_sets as s", "s.id", "b.wbs_set_id")
      .where({
        "b.project_id": String(projectId),
        "b.model_id": String(modelId),
      })
      .select(["s.*"])
      .orderBy("b.id", "desc")
      .first();

    if (byBinding) return byBinding;
  }

  const fallback = await knex("wbs_sets")
    .where({ project_id: String(projectId) })
    .modify((query) => {
      if (modelId) query.andWhere((qb) => qb.where({ model_id: String(modelId) }).orWhereNull("model_id"));
    })
    .orderBy("id", "desc")
    .first();

  return fallback || null;
};

const fetchWbsItems = async (wbsSetId) => {
  const rows = await knex("wbs_items")
    .where({ wbs_set_id: Number(wbsSetId) })
    .select([
      "id",
      "wbs_code",
      "title",
      "level",
      "parent_code",
      "start_date",
      "end_date",
      "duration_label",
      "baseline_start_date",
      "baseline_end_date",
      "actual_start_date",
      "actual_end_date",
      "actual_progress_pct",
      "planned_cost",
      "actual_cost",
      "extra_props",
    ]);

  return rows
    .map((row) => ({
      id: row.id,
      code: toText(row.wbs_code),
      title: toText(row.title),
      level: Number(row.level) || 0,
      parentCode: toText(row.parent_code),
      startDate: toIsoDateFromDbValue(row.start_date),
      endDate: toIsoDateFromDbValue(row.end_date),
      duration: toText(row.duration_label),
      baselineStartDate: toIsoDateFromDbValue(row.baseline_start_date),
      baselineEndDate: toIsoDateFromDbValue(row.baseline_end_date),
      actualStartDate: toIsoDateFromDbValue(row.actual_start_date),
      actualEndDate: toIsoDateFromDbValue(row.actual_end_date),
      actualProgressPct:
        row.actual_progress_pct === null || row.actual_progress_pct === undefined
          ? null
          : Number(row.actual_progress_pct),
      plannedCost: row.planned_cost === null || row.planned_cost === undefined ? null : Number(row.planned_cost),
      actualCost: row.actual_cost === null || row.actual_cost === undefined ? null : Number(row.actual_cost),
      extraProps: parseJson(row.extra_props),
    }))
    .sort((a, b) => compareWbsCodes(a.code, b.code));
};

const fetchLatestModelParameterElements = async ({ projectId, modelId }) => {
  const latestChecksSubquery = knex("parameter_checks")
    .select(knex.raw("MAX(id) as id"))
    .where({
      project_id: String(projectId),
      model_id: String(modelId),
    })
    .groupBy("discipline_id", "category_id");

  return knex("parameter_elements as pe")
    .join("parameter_checks as pc", "pc.id", "pe.check_id")
    .whereIn("pe.check_id", latestChecksSubquery)
    .select([
      "pe.id as element_row_id",
      "pe.check_id",
      "pe.revit_element_id",
      "pe.category",
      "pe.family_name",
      "pe.element_name",
      "pe.assembly_code",
      "pe.assembly_description",
      "pe.extra_props",
      "pc.discipline_id",
      "pc.category_id",
    ]);
};

const pickRawPropertyValue = (rawProperties = [], wantedNames = []) => {
  if (!Array.isArray(rawProperties) || !rawProperties.length) return "";
  const wanted = new Set(wantedNames.map((name) => toText(name).toLowerCase()).filter(Boolean));
  if (!wanted.size) return "";

  const match = rawProperties.find((property) => wanted.has(toText(property?.name).toLowerCase()));
  return toText(match?.value);
};

const normalizeStoredElementForMatching = (element = {}) => {
  const extra = parseJson(element.extra_props) || {};
  const rawProperties = Array.isArray(extra.rawProperties) ? extra.rawProperties : [];

  return {
    ...element,
    revit_element_id: toText(element.revit_element_id) || toText(extra.elementId) || null,
    category: toText(element.category) || null,
    family_name: toText(element.family_name) || null,
    element_name: toText(element.element_name) || null,
    assembly_code:
      toText(element.assembly_code) || pickRawPropertyValue(rawProperties, ["Assembly Code", "OmniClass Number"]) || null,
    assembly_description:
      toText(element.assembly_description) ||
      pickRawPropertyValue(rawProperties, ["Assembly Description", "OmniClass Title"]) ||
      null,
    extra_props: {
      ...extra,
      rawProperties,
      viewerDbId: parsePositiveInt(extra.viewerDbId),
      elementId: toText(extra.elementId) || null,
      externalElementId: toText(extra.externalElementId) || null,
    },
    discipline_id: toText(element.discipline_id),
    category_id: toText(element.category_id),
  };
};

const normalizeLiveElementForMatching = (row = {}) => ({
  element_row_id: null,
  check_id: null,
  revit_element_id: toText(row.revitElementId) || null,
  category: toText(row.category) || null,
  family_name: toText(row.familyName) || null,
  element_name: toText(row.elementName) || null,
  assembly_code: toText(row.assemblyCode) || null,
  assembly_description: toText(row.assemblyDescription) || null,
  extra_props: {
    viewerDbId: parsePositiveInt(row.viewerDbId),
    dbId: toText(row.dbId) || null,
    elementId: toText(row.elementId) || null,
    externalElementId: toText(row.externalElementId) || null,
    rawProperties: Array.isArray(row.rawProperties) ? row.rawProperties : [],
  },
  discipline_id: "",
  category_id: "",
});

const mergeElementRows = (current, incoming) => {
  const currentExtra = parseJson(current.extra_props) || {};
  const incomingExtra = parseJson(incoming.extra_props) || {};

  return {
    ...current,
    revit_element_id: toText(current.revit_element_id) || toText(incoming.revit_element_id) || null,
    category: toText(current.category) || toText(incoming.category) || null,
    family_name: toText(current.family_name) || toText(incoming.family_name) || null,
    element_name: toText(current.element_name) || toText(incoming.element_name) || null,
    assembly_code: toText(current.assembly_code) || toText(incoming.assembly_code) || null,
    assembly_description:
      toText(current.assembly_description) || toText(incoming.assembly_description) || null,
    extra_props: {
      ...incomingExtra,
      ...currentExtra,
      viewerDbId: parsePositiveInt(currentExtra.viewerDbId) || parsePositiveInt(incomingExtra.viewerDbId),
      elementId: toText(currentExtra.elementId) || toText(incomingExtra.elementId) || null,
      externalElementId:
        toText(currentExtra.externalElementId) || toText(incomingExtra.externalElementId) || null,
      rawProperties: Array.isArray(currentExtra.rawProperties)
        ? currentExtra.rawProperties
        : Array.isArray(incomingExtra.rawProperties)
          ? incomingExtra.rawProperties
          : [],
    },
  };
};

const deduplicateModelElements = (elements = []) => {
  const byKey = new Map();
  let fallbackIndex = 0;

  for (const element of Array.isArray(elements) ? elements : []) {
    const extra = parseJson(element.extra_props) || {};
    const viewerDbId = parsePositiveInt(extra.viewerDbId);
    const key =
      toText(element.revit_element_id) ||
      toText(extra.elementId) ||
      toText(extra.externalElementId) ||
      (viewerDbId ? `db:${viewerDbId}` : "");

    if (!key) {
      fallbackIndex += 1;
      byKey.set(`row:${fallbackIndex}`, element);
      continue;
    }

    if (!byKey.has(key)) {
      byKey.set(key, element);
      continue;
    }

    byKey.set(key, mergeElementRows(byKey.get(key), element));
  }

  return Array.from(byKey.values());
};

const hasAssemblyData = (elements = []) =>
  elements.some((element) => toText(element?.assembly_code) || toText(element?.assembly_description));

const fetchModelElementsForMatching = async ({ token, projectId, modelId }) => {
  const stored = deduplicateModelElements(
    (await fetchLatestModelParameterElements({ projectId, modelId })).map(normalizeStoredElementForMatching)
  );

  if (stored.length && hasAssemblyData(stored)) {
    return { elements: stored, source: "stored_parameter_checks" };
  }

  if (token) {
    try {
      const live = await fetchAllModelParameters(token, String(projectId), String(modelId));
      const liveElements = deduplicateModelElements((live?.rows || []).map(normalizeLiveElementForMatching));
      if (liveElements.length) {
        return { elements: liveElements, source: "live_model_query" };
      }
    } catch (err) {
      if (!stored.length) throw err;
    }
  }

  return {
    elements: stored,
    source: stored.length ? "stored_parameter_checks" : "none",
  };
};

const buildWbsIndexes = (wbsItems) => {
  const byCode = new Map();
  const byDescription = [];

  wbsItems.forEach((item) => {
    const key = normalizeCodeLookup(item.code);
    if (!key) return;
    byCode.set(key, item);

    const titleTokens = toTokenSet(item.title);
    byDescription.push({
      code: item.code,
      tokens: titleTokens,
      item,
    });
  });

  return { byCode, byDescription };
};

const matchElementToWbs = ({ element, indexes }) => {
  const assemblyCode = toText(element?.assembly_code);
  const assemblyDescription = toText(element?.assembly_description);
  const codeKey = normalizeCodeLookup(assemblyCode);

  const matchByCode = codeKey ? indexes.byCode.get(codeKey) : null;
  if (matchByCode) {
    return {
      status: "matched",
      basis: "code_exact",
      score: 1,
      matchedCode: matchByCode.code,
      matchedItem: matchByCode,
    };
  }

  const descTokens = toTokenSet(assemblyDescription);
  if (!descTokens.size) {
    return {
      status: "unmatched",
      basis: "none",
      score: 0,
      matchedCode: null,
      matchedItem: null,
    };
  }

  const scored = indexes.byDescription
    .map((entry) => ({
      code: entry.code,
      score: similarityScore(descTokens, entry.tokens),
      item: entry.item,
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0] || null;
  const second = scored[1] || null;

  if (!top || top.score < DESCRIPTION_MATCH_THRESHOLD) {
    return {
      status: "unmatched",
      basis: "none",
      score: top ? Number(top.score.toFixed(3)) : 0,
      matchedCode: null,
      matchedItem: null,
    };
  }

  const isAmbiguous =
    second &&
    second.score >= DESCRIPTION_MATCH_THRESHOLD &&
    Math.abs(top.score - second.score) <= AMBIGUOUS_GAP_THRESHOLD;

  if (isAmbiguous) {
    return {
      status: "ambiguous",
      basis: "ambiguous",
      score: Number(top.score.toFixed(3)),
      matchedCode: top.code,
      matchedItem: top.item,
    };
  }

  return {
    status: "matched",
    basis: "description_similarity",
    score: Number(top.score.toFixed(3)),
    matchedCode: top.code,
    matchedItem: top.item,
  };
};

const buildByWbsSummary = (matches = [], wbsItems = []) => {
  const bucket = new Map();

  wbsItems.forEach((item) => {
    bucket.set(item.code, {
      code: item.code,
      title: item.title,
      level: item.level,
      startDate: item.startDate || null,
      endDate: item.endDate || null,
      matchedElements: 0,
      ambiguousElements: 0,
    });
  });

  matches.forEach((match) => {
    const code = toText(match.matched_wbs_code);
    if (!code || !bucket.has(code)) return;
    const ref = bucket.get(code);
    if (match.match_status === "matched") ref.matchedElements += 1;
    if (match.match_status === "ambiguous") ref.ambiguousElements += 1;
  });

  return Array.from(bucket.values()).sort((a, b) => compareWbsCodes(a.code, b.code));
};

const SaveProjectWbs = async (req, res, next) => {
  const { projectId } = req.params;
  const {
    modelId = null,
    name = "WBS Import",
    sourceFileName = "",
    rows = [],
    activateForModel = true,
  } = req.body || {};

  if (!projectId) return next({ status: 400, message: "Project ID is required" });
  if (!Array.isArray(rows)) return next({ status: 400, message: "Field 'rows' must be an array" });

  let sanitizedRows;
  try {
    sanitizedRows = sanitizeWbsRows(rows);
  } catch (err) {
    return next({ status: 400, message: err?.message || "Invalid WBS rows payload" });
  }

  if (!sanitizedRows.length) {
    return next({ status: 400, message: "No valid WBS rows were provided (code + title, level <= 4)" });
  }

  const trx = await knex.transaction();
  try {
    const insertSetResult = await trx("wbs_sets").insert({
      project_id: String(projectId),
      model_id: modelId ? String(modelId) : null,
      name: toText(name) || "WBS Import",
      source_file_name: toText(sourceFileName) || null,
      status: "active",
    });

    const wbsSetId = Array.isArray(insertSetResult) ? insertSetResult[0] : insertSetResult;

    const itemsToInsert = sanitizedRows.map((row) => ({
      wbs_set_id: wbsSetId,
      wbs_code: row.code,
      title: row.title,
      level: row.level,
      parent_code: row.parentCode || null,
      start_date: row.startDate,
      end_date: row.endDate,
      duration_label: row.durationLabel || null,
      baseline_start_date: row.baselineStartDate,
      baseline_end_date: row.baselineEndDate,
      actual_start_date: row.actualStartDate,
      actual_end_date: row.actualEndDate,
      actual_progress_pct: Number.isFinite(row.actualProgressPct) ? row.actualProgressPct : null,
      planned_cost: row.plannedCost,
      actual_cost: row.actualCost,
      extra_props: row.extraProps || null,
    }));

    await knex.batchInsert("wbs_items", itemsToInsert, 500).transacting(trx);

    if (modelId && activateForModel) {
      await trx("wbs_model_bindings")
        .where({
          project_id: String(projectId),
          model_id: String(modelId),
        })
        .del();

      await trx("wbs_model_bindings").insert({
        project_id: String(projectId),
        model_id: String(modelId),
        wbs_set_id: wbsSetId,
      });
    }

    await trx.commit();

    return res.status(201).json({
      success: true,
      message: "WBS saved successfully",
      data: {
        wbsSetId,
        rowCount: itemsToInsert.length,
      },
    });
  } catch (err) {
    await trx.rollback();
    err.code = err.code || "SaveProjectWbsFailed";
    return next(err);
  }
};

const GetLatestProjectWbs = async (req, res, next) => {
  const { projectId } = req.params;
  const modelId = toText(req.query?.modelId);

  if (!projectId) return next({ status: 400, message: "Project ID is required" });

  try {
    const wbsSet = await getActiveWbsSet({
      projectId: String(projectId),
      modelId: modelId || null,
    });

    if (!wbsSet) {
      return res.status(200).json({
        success: true,
        found: false,
      });
    }

    const rows = await fetchWbsItems(wbsSet.id);

    return res.status(200).json({
      success: true,
      found: true,
      data: {
        wbsSet: {
          id: wbsSet.id,
          projectId: wbsSet.project_id,
          modelId: wbsSet.model_id,
          name: wbsSet.name,
          sourceFileName: wbsSet.source_file_name,
          createdAt: wbsSet.created_at,
          updatedAt: wbsSet.updated_at,
        },
        rows,
      },
    });
  } catch (err) {
    err.code = err.code || "GetLatestProjectWbsFailed";
    return next(err);
  }
};

const RunWbsModelMatching = async (req, res, next) => {
  const { projectId } = req.params;
  const modelId = toText(req.body?.modelId || req.query?.modelId);
  const explicitWbsSetId = parsePositiveInt(req.body?.wbsSetId || req.query?.wbsSetId);
  const token = req.cookies?.access_token;

  if (!projectId) return next({ status: 400, message: "Project ID is required" });
  if (!modelId) return next({ status: 400, message: "Field 'modelId' is required" });

  try {
    const selectedWbsSet =
      explicitWbsSetId &&
      (await knex("wbs_sets")
        .where({
          id: explicitWbsSetId,
          project_id: String(projectId),
        })
        .first());

    const wbsSet =
      selectedWbsSet ||
      (await getActiveWbsSet({
        projectId: String(projectId),
        modelId: String(modelId),
      }));

    if (!wbsSet) {
      return next({
        status: 404,
        message: "No WBS data found for this project/model. Upload WBS first.",
      });
    }

    const wbsItems = await fetchWbsItems(wbsSet.id);
    if (!wbsItems.length) {
      return next({ status: 404, message: "Selected WBS set has no rows." });
    }

    const { elements: modelElements, source: modelElementsSource } = await fetchModelElementsForMatching({
      token,
      projectId: String(projectId),
      modelId: String(modelId),
    });

    if (!modelElements.length) {
      return next({
        status: 404,
        message:
          "No model elements found for matching. Run Parameter Checker or verify model access and element data.",
      });
    }

    const indexes = buildWbsIndexes(wbsItems);

    const matchesToInsert = [];
    let matched = 0;
    let unmatched = 0;
    let ambiguous = 0;

    modelElements.forEach((element) => {
      const result = matchElementToWbs({ element, indexes });
      const extra = parseJson(element.extra_props) || {};
      const viewerDbId = parsePositiveInt(extra.viewerDbId) || null;

      if (result.status === "matched") matched += 1;
      else if (result.status === "ambiguous") ambiguous += 1;
      else unmatched += 1;

      matchesToInsert.push({
        revit_element_id: toText(element.revit_element_id) || null,
        viewer_db_id: viewerDbId,
        category: toText(element.category) || null,
        family_name: toText(element.family_name) || null,
        element_name: toText(element.element_name) || null,
        assembly_code: toText(element.assembly_code) || null,
        assembly_description: toText(element.assembly_description) || null,
        matched_wbs_code: result.matchedCode || null,
        match_basis: result.basis,
        match_status: result.status,
        match_score: Number.isFinite(result.score) ? result.score : null,
        check_id: parsePositiveInt(element.check_id),
        check_element_id: parsePositiveInt(element.element_row_id),
        start_date: toIsoDateFromDbValue(result.matchedItem?.startDate),
        end_date: toIsoDateFromDbValue(result.matchedItem?.endDate),
        planned_cost:
          result.matchedItem?.plannedCost !== null && result.matchedItem?.plannedCost !== undefined
            ? result.matchedItem.plannedCost
            : null,
        actual_cost:
          result.matchedItem?.actualCost !== null && result.matchedItem?.actualCost !== undefined
            ? result.matchedItem.actualCost
            : null,
        extra_props: {
          elementId: extra?.elementId || null,
          externalElementId: extra?.externalElementId || null,
          disciplineId: toText(element.discipline_id),
          categoryId: toText(element.category_id),
        },
      });
    });

    const trx = await knex.transaction();
    let runId;
    try {
      const runInsertResult = await trx("wbs_match_runs").insert({
        project_id: String(projectId),
        model_id: String(modelId),
        wbs_set_id: Number(wbsSet.id),
        status: "completed",
        total_elements: matchesToInsert.length,
        matched_elements: matched,
        unmatched_elements: unmatched,
        ambiguous_elements: ambiguous,
      });

      runId = Array.isArray(runInsertResult) ? runInsertResult[0] : runInsertResult;

      const rowsWithRun = matchesToInsert.map((row) => ({
        run_id: runId,
        ...row,
      }));

      if (rowsWithRun.length > 0) {
        await knex.batchInsert("wbs_element_matches", rowsWithRun, 500).transacting(trx);
      }

      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    const byWbsCode = buildByWbsSummary(matchesToInsert, wbsItems);

    return res.status(201).json({
      success: true,
      message: "WBS matching completed",
      data: {
        runId,
        wbsSetId: wbsSet.id,
        modelElementsSource,
        totalElements: matchesToInsert.length,
        matchedElements: matched,
        unmatchedElements: unmatched,
        ambiguousElements: ambiguous,
        byWbsCode,
      },
    });
  } catch (err) {
    err.code = err.code || "RunWbsModelMatchingFailed";
    return next(err);
  }
};

const GetLatestWbsModelMatching = async (req, res, next) => {
  const { projectId } = req.params;
  const modelId = toText(req.query?.modelId);

  if (!projectId) return next({ status: 400, message: "Project ID is required" });
  if (!modelId) return next({ status: 400, message: "Query param 'modelId' is required" });

  try {
    const run = await knex("wbs_match_runs")
      .where({
        project_id: String(projectId),
        model_id: String(modelId),
      })
      .orderBy("id", "desc")
      .first();

    if (!run) {
      return res.status(200).json({
        success: true,
        found: false,
      });
    }

    const wbsItems = await fetchWbsItems(run.wbs_set_id);
    const wbsByCode = new Map(wbsItems.map((item) => [item.code, item]));

    const rows = await knex("wbs_element_matches")
      .where({ run_id: run.id })
      .orderBy("id", "asc")
      .select([
        "id",
        "revit_element_id",
        "viewer_db_id",
        "category",
        "family_name",
        "element_name",
        "assembly_code",
        "assembly_description",
        "matched_wbs_code",
        "match_basis",
        "match_status",
        "match_score",
        "check_id",
        "check_element_id",
        "start_date",
        "end_date",
        "planned_cost",
        "actual_cost",
        "extra_props",
      ]);

    const mappedRows = rows.map((row) => {
      const code = toText(row.matched_wbs_code);
      const wbsRef = wbsByCode.get(code) || null;
      const extra = parseJson(row.extra_props) || {};
      return {
        id: row.id,
        revitElementId: toText(row.revit_element_id),
        viewerDbId: parsePositiveInt(row.viewer_db_id),
        category: toText(row.category),
        familyName: toText(row.family_name),
        elementName: toText(row.element_name),
        assemblyCode: toText(row.assembly_code),
        assemblyDescription: toText(row.assembly_description),
        matchedWbsCode: code || null,
        matchedWbsTitle: wbsRef?.title || null,
        matchBasis: toText(row.match_basis),
        matchStatus: toText(row.match_status) || "unmatched",
        matchScore: row.match_score === null || row.match_score === undefined ? null : Number(row.match_score),
        checkId: parsePositiveInt(row.check_id),
        checkElementId: parsePositiveInt(row.check_element_id),
        startDate: toIsoDateFromDbValue(row.start_date) || wbsRef?.startDate || null,
        endDate: toIsoDateFromDbValue(row.end_date) || wbsRef?.endDate || null,
        plannedCost: row.planned_cost === null || row.planned_cost === undefined ? null : Number(row.planned_cost),
        actualCost: row.actual_cost === null || row.actual_cost === undefined ? null : Number(row.actual_cost),
        elementId: toText(extra.elementId),
        externalElementId: toText(extra.externalElementId),
      };
    });

    const datedMatchedRows = mappedRows.filter(
      (row) => row.matchStatus === "matched" && row.startDate && row.endDate
    );

    const timelineMinDate =
      datedMatchedRows.length > 0
        ? datedMatchedRows
            .map((row) => row.startDate)
            .sort((a, b) => String(a).localeCompare(String(b)))[0]
        : null;
    const timelineMaxDate =
      datedMatchedRows.length > 0
        ? datedMatchedRows
            .map((row) => row.endDate)
            .sort((a, b) => String(a).localeCompare(String(b)))[datedMatchedRows.length - 1]
        : null;

    const byWbsCode = buildByWbsSummary(rows, wbsItems);

    return res.status(200).json({
      success: true,
      found: true,
      data: {
        run: {
          id: run.id,
          projectId: run.project_id,
          modelId: run.model_id,
          wbsSetId: run.wbs_set_id,
          status: run.status,
          totalElements: Number(run.total_elements) || 0,
          matchedElements: Number(run.matched_elements) || 0,
          unmatchedElements: Number(run.unmatched_elements) || 0,
          ambiguousElements: Number(run.ambiguous_elements) || 0,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
        },
        rows: mappedRows,
        byWbsCode,
        timeline: {
          minDate: timelineMinDate,
          maxDate: timelineMaxDate,
          matchedRowsWithDates: datedMatchedRows.length,
        },
      },
    });
  } catch (err) {
    err.code = err.code || "GetLatestWbsModelMatchingFailed";
    return next(err);
  }
};

module.exports = {
  SaveProjectWbs,
  GetLatestProjectWbs,
  RunWbsModelMatching,
  GetLatestWbsModelMatching,
};
