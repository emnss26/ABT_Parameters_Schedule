const {
  fetchModelParametersByCategory,
} = require("../../libs/aec/aec.get.model.parameters.by.category");
const knex = require("../../../utils/db/knex");

const REQUIRED_COMPLIANCE_FIELDS = [
  "revitElementId",
  "category",
  "familyName",
  "elementName",
  "typeMark",
  "description",
  "model",
  "manufacturer",
  "assemblyCode",
  "assemblyDescription",
];

const REQUIRED_STORED_COMPLIANCE_FIELDS = [
  "revit_element_id",
  "category",
  "family_name",
  "element_name",
  "type_mark",
  "description",
  "model_param",
  "manufacturer",
  "assembly_code",
  "assembly_description",
];

const toText = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const pickValue = (obj, keys, fallback = "") => {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null) {
      return obj[key];
    }
  }
  return fallback;
};

const normalizeCount = (value) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
};

const normalizeCompliance = (value, row = {}) => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const direct = toText(value);
    if (direct) return direct.toUpperCase();
  }

  const valuePct = Number(value?.pct);
  if (Number.isFinite(valuePct)) {
    return valuePct >= 100 ? "PASS" : "FAIL";
  }

  const pct = Number(row?.compliance?.pct);
  if (Number.isFinite(pct)) {
    return pct >= 100 ? "PASS" : "FAIL";
  }

  return "UNKNOWN";
};

const buildExtraProps = (row = {}) => {
  const extra = {
    viewerDbId: row?.viewerDbId ?? row?.["viewerDbId"] ?? null,
    dbId: row?.dbId ?? row?.["dbId"] ?? null,
    elementId: row?.elementId ?? row?.id ?? null,
    externalElementId: row?.externalElementId ?? null,
    rawProperties: Array.isArray(row?.rawProperties) ? row.rawProperties : [],
  };

  const hasAny =
    extra.viewerDbId !== null ||
    extra.dbId !== null ||
    extra.elementId !== null ||
    extra.externalElementId !== null ||
    extra.rawProperties.length > 0;

  return hasAny ? extra : null;
};

const getCompliancePct = (row = {}) => {
  const filled = REQUIRED_COMPLIANCE_FIELDS.filter((field) => toText(row[field]) !== "").length;
  return Math.round((filled / REQUIRED_COMPLIANCE_FIELDS.length) * 100);
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

const isMissingTableError = (err) => /ER_NO_SUCH_TABLE|doesn't exist|no such table/i.test(String(err?.message || ""));

const mapStoredElementToRow = (element) => {
  const extra = parseJson(element?.extra_props) || {};

  const row = {
    viewerDbId: extra?.viewerDbId ?? null,
    dbId: extra?.dbId ?? null,
    elementId: extra?.elementId ? String(extra.elementId) : "",
    externalElementId: extra?.externalElementId ? String(extra.externalElementId) : "",
    revitElementId: toText(element?.revit_element_id),
    category: toText(element?.category),
    familyName: toText(element?.family_name),
    elementName: toText(element?.element_name),
    typeMark: toText(element?.type_mark),
    description: toText(element?.description),
    model: toText(element?.model_param),
    manufacturer: toText(element?.manufacturer),
    assemblyCode: toText(element?.assembly_code),
    assemblyDescription: toText(element?.assembly_description),
    count: Number(element?.count) || 1,
    rawProperties: Array.isArray(extra?.rawProperties) ? extra.rawProperties : [],
  };

  return {
    ...row,
    compliance: {
      pct: getCompliancePct(row),
    },
  };
};

const buildSummary = (rows = []) => {
  const totalElements = rows.length;
  if (!totalElements) {
    return {
      totalElements: 0,
      averageCompliancePct: 0,
      fullyCompliant: 0,
    };
  }

  const totalPct = rows.reduce((acc, row) => acc + (Number(row?.compliance?.pct) || 0), 0);

  return {
    totalElements,
    averageCompliancePct: Math.round(totalPct / totalElements),
    fullyCompliant: rows.filter((row) => (Number(row?.compliance?.pct) || 0) === 100).length,
  };
};

const getStoredCompliancePct = (element = {}) => {
  const filled = REQUIRED_STORED_COMPLIANCE_FIELDS.filter((field) => toText(element?.[field]) !== "").length;
  return Math.round((filled / REQUIRED_STORED_COMPLIANCE_FIELDS.length) * 100);
};

const buildStoredElementsSummary = (elements = []) => {
  const totalElements = Array.isArray(elements) ? elements.length : 0;
  if (!totalElements) {
    return {
      totalElements: 0,
      averageCompliancePct: 0,
      fullyCompliant: 0,
    };
  }

  const totalPct = elements.reduce((acc, element) => acc + getStoredCompliancePct(element), 0);
  const fullyCompliant = elements.filter((element) => getStoredCompliancePct(element) === 100).length;

  return {
    totalElements,
    averageCompliancePct: Math.round(totalPct / totalElements),
    fullyCompliant,
  };
};

const getLatestCheckIdsByCategory = async ({ db, projectId, modelId, disciplineId }) => {
  const rows = await db("parameter_checks")
    .select("category_id")
    .max({ id: "id" })
    .where({
      project_id: String(projectId),
      model_id: String(modelId),
      discipline_id: String(disciplineId),
    })
    .groupBy("category_id");

  return rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
};

const upsertDisciplineRollup = async ({ db, payload }) => {
  const where = {
    project_id: String(payload.project_id),
    model_id: String(payload.model_id),
    discipline_id: String(payload.discipline_id),
  };

  const existing = await db("parameter_project_compliance_rollups").where(where).first("id");
  if (existing?.id) {
    await db("parameter_project_compliance_rollups").where({ id: existing.id }).update({
      total_elements: Number(payload.total_elements) || 0,
      fully_compliant: Number(payload.fully_compliant) || 0,
      average_compliance_pct: Number(payload.average_compliance_pct) || 0,
      latest_check_id: payload.latest_check_id || null,
      updated_at: db.fn.now(),
    });
    return existing.id;
  }

  const insertResult = await db("parameter_project_compliance_rollups").insert({
    project_id: String(payload.project_id),
    model_id: String(payload.model_id),
    discipline_id: String(payload.discipline_id),
    total_elements: Number(payload.total_elements) || 0,
    fully_compliant: Number(payload.fully_compliant) || 0,
    average_compliance_pct: Number(payload.average_compliance_pct) || 0,
    latest_check_id: payload.latest_check_id || null,
  });

  return Array.isArray(insertResult) ? insertResult[0] : insertResult;
};

const buildGrandTotalFromRollups = (rollups = []) => {
  const rows = Array.isArray(rollups) ? rollups : [];
  const totalElements = rows.reduce((acc, row) => acc + (Number(row.total_elements) || 0), 0);
  const fullyCompliant = rows.reduce((acc, row) => acc + (Number(row.fully_compliant) || 0), 0);
  const weightedPctSum = rows.reduce(
    (acc, row) =>
      acc + (Number(row.average_compliance_pct) || 0) * (Number(row.total_elements) || 0),
    0
  );

  return {
    totalElements,
    fullyCompliant,
    averageCompliancePct: totalElements > 0 ? Math.round(weightedPctSum / totalElements) : 0,
    analyzedModels: new Set(rows.map((row) => String(row.model_id || "")).filter(Boolean)).size,
    analyzedDisciplines: rows.length,
  };
};

const upsertProjectGrandTotal = async ({ db, projectId }) => {
  const rollups = await db("parameter_project_compliance_rollups")
    .where({ project_id: String(projectId) })
    .select(["model_id", "total_elements", "fully_compliant", "average_compliance_pct"]);

  const total = buildGrandTotalFromRollups(rollups);

  const existing = await db("parameter_project_compliance_totals")
    .where({ project_id: String(projectId) })
    .first("id");

  if (existing?.id) {
    await db("parameter_project_compliance_totals")
      .where({ id: existing.id })
      .update({
        total_elements: total.totalElements,
        fully_compliant: total.fullyCompliant,
        average_compliance_pct: total.averageCompliancePct,
        analyzed_models: total.analyzedModels,
        analyzed_disciplines: total.analyzedDisciplines,
        updated_at: db.fn.now(),
      });
    return existing.id;
  }

  const insertResult = await db("parameter_project_compliance_totals").insert({
    project_id: String(projectId),
    total_elements: total.totalElements,
    fully_compliant: total.fullyCompliant,
    average_compliance_pct: total.averageCompliancePct,
    analyzed_models: total.analyzedModels,
    analyzed_disciplines: total.analyzedDisciplines,
  });

  return Array.isArray(insertResult) ? insertResult[0] : insertResult;
};

const refreshDisciplineRollup = async ({ db, projectId, modelId, disciplineId }) => {
  const latestCheckIds = await getLatestCheckIdsByCategory({
    db,
    projectId,
    modelId,
    disciplineId,
  });

  if (!latestCheckIds.length) {
    await db("parameter_project_compliance_rollups")
      .where({
        project_id: String(projectId),
        model_id: String(modelId),
        discipline_id: String(disciplineId),
      })
      .del();
    return;
  }

  const latestCheckId =
    latestCheckIds.length > 0 ? latestCheckIds.reduce((max, id) => (id > max ? id : max), 0) : null;

  const elements =
    latestCheckIds.length > 0
      ? await db("parameter_elements")
          .whereIn("check_id", latestCheckIds)
          .select(REQUIRED_STORED_COMPLIANCE_FIELDS)
      : [];

  const summary = buildStoredElementsSummary(elements);

  await upsertDisciplineRollup({
    db,
    payload: {
      project_id: String(projectId),
      model_id: String(modelId),
      discipline_id: String(disciplineId),
      total_elements: summary.totalElements,
      fully_compliant: summary.fullyCompliant,
      average_compliance_pct: summary.averageCompliancePct,
      latest_check_id: latestCheckId,
    },
  });
};

const rebuildProjectRollupsIfMissing = async ({ projectId }) => {
  const existingRollup = await knex("parameter_project_compliance_rollups")
    .where({ project_id: String(projectId) })
    .first("id");
  if (existingRollup?.id) return;

  const checkGroups = await knex("parameter_checks")
    .distinct(["model_id", "discipline_id"])
    .where({ project_id: String(projectId) });

  if (!checkGroups.length) return;

  const trx = await knex.transaction();
  try {
    for (const group of checkGroups) {
      await refreshDisciplineRollup({
        db: trx,
        projectId: String(projectId),
        modelId: String(group.model_id),
        disciplineId: String(group.discipline_id),
      });
    }

    await upsertProjectGrandTotal({ db: trx, projectId: String(projectId) });
    await trx.commit();
  } catch (err) {
    await trx.rollback();
    throw err;
  }
};

const buildProjectComplianceRowsFromChecks = async ({ projectId }) => {
  let modelNameById = new Map();
  try {
    const models = await knex("model_selection")
      .where({ project_id: String(projectId) })
      .select(["model_id", "model_name"]);
    modelNameById = new Map(models.map((row) => [String(row.model_id), toText(row.model_name)]));
  } catch (_err) {
    modelNameById = new Map();
  }

  const groups = await knex("parameter_checks")
    .distinct(["model_id", "discipline_id"])
    .where({ project_id: String(projectId) });

  const rows = [];
  for (const group of groups) {
    const modelId = String(group.model_id || "");
    const disciplineId = String(group.discipline_id || "");
    if (!modelId || !disciplineId) continue;

    const latestCheckIds = await getLatestCheckIdsByCategory({
      db: knex,
      projectId: String(projectId),
      modelId,
      disciplineId,
    });
    if (!latestCheckIds.length) continue;

    const elements = await knex("parameter_elements")
      .whereIn("check_id", latestCheckIds)
      .select(REQUIRED_STORED_COMPLIANCE_FIELDS);

    const summary = buildStoredElementsSummary(elements);
    const latestCheckId = latestCheckIds.reduce((max, id) => (id > max ? id : max), 0);
    const latestCheck = await knex("parameter_checks")
      .where({ id: latestCheckId })
      .first(["created_at"]);

    rows.push({
      model_id: modelId,
      discipline_id: disciplineId,
      total_elements: summary.totalElements,
      fully_compliant: summary.fullyCompliant,
      average_compliance_pct: summary.averageCompliancePct,
      latest_check_id: latestCheckId,
      updated_at: latestCheck?.created_at || null,
      model_name: modelNameById.get(modelId) || "",
    });
  }

  return rows;
};

const mapIncomingElementToInsert = (element, categoryId) => {
  return {
    revit_element_id: toText(
      pickValue(element, ["revitElementId", "Revit Element ID", "Element Id", "ElementId", "id"], "N/A")
    ),
    category: toText(pickValue(element, ["category", "Category", "Category Name"], categoryId)),
    family_name: toText(pickValue(element, ["familyName", "Family Name", "Family"])),
    element_name: toText(pickValue(element, ["elementName", "Element Name", "Name"])),
    type_mark: toText(pickValue(element, ["typeMark", "Type Mark", "Mark"])),
    description: toText(pickValue(element, ["description", "Description", "Type Description"])),
    model_param: toText(pickValue(element, ["model", "Model", "Model Number", "Modelo"])),
    manufacturer: toText(pickValue(element, ["manufacturer", "Manufacturer", "Fabricante"])),
    assembly_code: toText(pickValue(element, ["assemblyCode", "Assembly Code", "OmniClass Number"])),
    assembly_description: toText(
      pickValue(element, ["assemblyDescription", "Assembly Description", "OmniClass Title"])
    ),
    count: normalizeCount(pickValue(element, ["count", "Count"], 1)),
    compliance: normalizeCompliance(pickValue(element, ["complianceLabel", "compliance", "Compliance"]), element),
    extra_props: buildExtraProps(element),
  };
};

const GetAECModelParametersByCategory = async (req, res, next) => {
  const token = req.cookies?.access_token;
  const { projectId } = req.params;
  const modelId = String(req.query?.modelId || "").trim();
  const category = String(req.query?.category || "Walls").trim();

  if (!token) return next({ status: 401, message: "Authorization token is required" });
  if (!projectId) return next({ status: 400, message: "Project ID is required" });
  if (!modelId) return next({ status: 400, message: "Query param 'modelId' is required" });

  try {
    const result = await fetchModelParametersByCategory(token, projectId, modelId, category);
    //console.log("Parameters", result)
    return res.status(200).json({
      success: true,
      message: "Model parameters retrieved successfully",
      data: result,
    });
  } catch (err) {
    err.code = err.code || "AECModelParametersFetchFailed";
    return next(err);
  }
};

const SaveParameterCheck = async (req, res, next) => {
  const { projectId } = req.params;
  const { modelId, disciplineId, categoryId, elements, status = "completed" } = req.body || {};

  if (!projectId) return next({ status: 400, message: "Project ID is required" });
  if (!toText(modelId)) return next({ status: 400, message: "Field 'modelId' is required" });
  if (!toText(disciplineId)) return next({ status: 400, message: "Field 'disciplineId' is required" });
  if (!toText(categoryId)) return next({ status: 400, message: "Field 'categoryId' is required" });
  if (!Array.isArray(elements)) return next({ status: 400, message: "Field 'elements' must be an array" });

  const trx = await knex.transaction();

  try {
    const insertResult = await trx("parameter_checks").insert({
      project_id: String(projectId),
      model_id: String(modelId),
      discipline_id: String(disciplineId),
      category_id: String(categoryId),
      status: toText(status) || "completed",
    });

    const checkId = Array.isArray(insertResult) ? insertResult[0] : insertResult;

    const elementsToInsert = elements.map((element) => ({
      check_id: checkId,
      ...mapIncomingElementToInsert(element, String(categoryId)),
    }));

    if (elementsToInsert.length > 0) {
      await knex.batchInsert("parameter_elements", elementsToInsert, 500).transacting(trx);
    }

    try {
      await refreshDisciplineRollup({
        db: trx,
        projectId: String(projectId),
        modelId: String(modelId),
        disciplineId: String(disciplineId),
      });
      await upsertProjectGrandTotal({ db: trx, projectId: String(projectId) });
    } catch (rollupErr) {
      if (!isMissingTableError(rollupErr)) throw rollupErr;
    }

    await trx.commit();

    return res.status(201).json({
      success: true,
      message: "Parameter check saved",
      data: {
        checkId,
        savedElements: elementsToInsert.length,
      },
    });
  } catch (err) {
    await trx.rollback();
    err.code = err.code || "SaveParameterCheckFailed";
    return next(err);
  }
};

const DeleteParameterCheck = async (req, res, next) => {
  const { projectId, checkId } = req.params;
  const normalizedCheckId = Number(checkId);

  if (!projectId) return next({ status: 400, message: "Project ID is required" });
  if (!Number.isSafeInteger(normalizedCheckId) || normalizedCheckId <= 0) {
    return next({ status: 400, message: "Valid check ID is required" });
  }

  const trx = await knex.transaction();

  try {
    const checkRow = await trx("parameter_checks")
      .where({
        id: normalizedCheckId,
        project_id: String(projectId),
      })
      .first(["id", "project_id", "model_id", "discipline_id", "category_id"]);

    if (!checkRow) {
      await trx.rollback();
      return next({ status: 404, message: "Parameter check not found for this project" });
    }

    const deletedElements = await trx("parameter_elements").where({ check_id: normalizedCheckId }).del();
    await trx("parameter_checks").where({ id: normalizedCheckId }).del();

    try {
      await refreshDisciplineRollup({
        db: trx,
        projectId: String(projectId),
        modelId: String(checkRow.model_id),
        disciplineId: String(checkRow.discipline_id),
      });
      await upsertProjectGrandTotal({ db: trx, projectId: String(projectId) });
    } catch (rollupErr) {
      if (!isMissingTableError(rollupErr)) throw rollupErr;
    }

    await trx.commit();

    return res.status(200).json({
      success: true,
      message: "Parameter check deleted",
      data: {
        checkId: normalizedCheckId,
        deletedElements,
        modelId: String(checkRow.model_id),
        disciplineId: String(checkRow.discipline_id),
        categoryId: String(checkRow.category_id),
      },
    });
  } catch (err) {
    try {
      await trx.rollback();
    } catch (_rollbackErr) {
      // Ignore rollback errors here; the original failure is more relevant.
    }
    err.code = err.code || "DeleteParameterCheckFailed";
    return next(err);
  }
};

const GetLastParameterCheck = async (req, res, next) => {
  const { projectId } = req.params;
  const modelId = toText(req.query?.modelId);
  const categoryId = toText(req.query?.categoryId);
  const disciplineId = toText(req.query?.disciplineId);

  if (!projectId) return next({ status: 400, message: "Project ID is required" });
  if (!modelId) return next({ status: 400, message: "Query param 'modelId' is required" });
  if (!categoryId) return next({ status: 400, message: "Query param 'categoryId' is required" });

  try {
    const query = knex("parameter_checks")
      .where({
        project_id: String(projectId),
        model_id: String(modelId),
        category_id: String(categoryId),
      })
      .orderBy("id", "desc");

    if (disciplineId) {
      query.andWhere({ discipline_id: String(disciplineId) });
    }

    const lastCheck = await query.first();

    if (!lastCheck) {
      return res.status(200).json({ success: true, found: false });
    }

    const elements = await knex("parameter_elements").where({ check_id: lastCheck.id }).orderBy("id", "asc");

    const rows = elements.map(mapStoredElementToRow);

    return res.status(200).json({
      success: true,
      found: true,
      checkData: lastCheck,
      data: {
        rows,
        summary: buildSummary(rows),
      },
    });
  } catch (err) {
    err.code = err.code || "GetLastParameterCheckFailed";
    return next(err);
  }
};

const GetLastDisciplineByModel = async (req, res, next) => {
  const { projectId } = req.params;
  const modelId = toText(req.query?.modelId);

  if (!projectId) return next({ status: 400, message: "Project ID is required" });
  if (!modelId) return next({ status: 400, message: "Query param 'modelId' is required" });

  try {
    const lastCheck = await knex("parameter_checks")
      .where({
        project_id: String(projectId),
        model_id: String(modelId),
      })
      .orderBy("id", "desc")
      .first(["id", "discipline_id", "category_id", "created_at"]);

    if (!lastCheck) {
      return res.status(200).json({
        success: true,
        found: false,
      });
    }

    return res.status(200).json({
      success: true,
      found: true,
      data: {
        checkId: lastCheck.id,
        disciplineId: toText(lastCheck.discipline_id),
        categoryId: toText(lastCheck.category_id),
        createdAt: lastCheck.created_at,
      },
    });
  } catch (err) {
    err.code = err.code || "GetLastDisciplineByModelFailed";
    return next(err);
  }
};

const GetProjectParameterCompliance = async (req, res, next) => {
  const { projectId } = req.params;
  if (!projectId) return next({ status: 400, message: "Project ID is required" });

  try {
    let rows = [];
    let grandTotal = null;

    try {
      await rebuildProjectRollupsIfMissing({ projectId: String(projectId) });

      rows = await knex("parameter_project_compliance_rollups as r")
        .leftJoin("parameter_checks as pc", "pc.id", "r.latest_check_id")
        .leftJoin("model_selection as ms", function () {
          this.on("ms.project_id", "=", "r.project_id").andOn("ms.model_id", "=", "r.model_id");
        })
        .where({ "r.project_id": String(projectId) })
        .select([
          "r.model_id",
          "r.discipline_id",
          "r.total_elements",
          "r.fully_compliant",
          "r.average_compliance_pct",
          "r.latest_check_id",
          "r.updated_at",
          "pc.created_at as latest_check_created_at",
          "ms.model_name",
        ])
        .orderBy([{ column: "r.model_id", order: "asc" }, { column: "r.discipline_id", order: "asc" }]);

      grandTotal = await knex("parameter_project_compliance_totals")
        .where({ project_id: String(projectId) })
        .first([
          "total_elements",
          "fully_compliant",
          "average_compliance_pct",
          "analyzed_models",
          "analyzed_disciplines",
          "updated_at",
        ]);

      const latestProjectCheck = await knex("parameter_checks")
        .where({ project_id: String(projectId) })
        .max({ latest_check_at: "created_at" })
        .first();

      if (grandTotal) {
        grandTotal.latest_check_at = latestProjectCheck?.latest_check_at || null;
      }
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
      rows = await buildProjectComplianceRowsFromChecks({ projectId: String(projectId) });
      grandTotal = null;
    }

    if (!grandTotal) {
      const computed = buildGrandTotalFromRollups(rows);
      grandTotal = {
        total_elements: computed.totalElements,
        fully_compliant: computed.fullyCompliant,
        average_compliance_pct: computed.averageCompliancePct,
        analyzed_models: computed.analyzedModels,
        analyzed_disciplines: computed.analyzedDisciplines,
        updated_at: null,
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        rows: rows.map((row) => ({
          modelId: toText(row.model_id),
          modelName: toText(row.model_name),
          disciplineId: toText(row.discipline_id),
          totalElements: Number(row.total_elements) || 0,
          fullyCompliant: Number(row.fully_compliant) || 0,
          averageCompliancePct: Number(row.average_compliance_pct) || 0,
          latestCheckId: Number(row.latest_check_id) || null,
          lastCheckAt: row.latest_check_created_at || row.updated_at || null,
        })),
        grandTotal: {
          totalElements: Number(grandTotal.total_elements) || 0,
          fullyCompliant: Number(grandTotal.fully_compliant) || 0,
          averageCompliancePct: Number(grandTotal.average_compliance_pct) || 0,
          analyzedModels: Number(grandTotal.analyzed_models) || 0,
          analyzedDisciplines: Number(grandTotal.analyzed_disciplines) || 0,
          updatedAt: grandTotal.latest_check_at || grandTotal.updated_at || null,
        },
      },
    });
  } catch (err) {
    err.code = err.code || "GetProjectParameterComplianceFailed";
    return next(err);
  }
};

module.exports = {
  GetAECModelParametersByCategory,
  SaveParameterCheck,
  DeleteParameterCheck,
  GetLastParameterCheck,
  GetLastDisciplineByModel,
  GetProjectParameterCompliance,
};
