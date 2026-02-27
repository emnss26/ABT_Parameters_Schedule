import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Boxes, Download, FileText, Link2, MonitorPlay, Pause, Play, Presentation, Upload } from "lucide-react";

import AppLayout from "@/components/general_component/AppLayout";
import AbitatLogoLoader from "@/components/general_component/AbitatLogoLoader";
import SelectModelsModal from "@/components/aec_model_components/SelectModelModal";
import WBSPlannerTable from "@/components/aec_model_components/WBSPlannerTable";
import {
  clearViewerIsolation,
  isolateViewerDbIds,
  resolveViewerDbIdsForRows,
  simpleViewer,
  teardownSimpleViewer,
} from "@/utils/viewers/simpleViewer";

const backendUrl = import.meta.env.VITE_API_BACKEND_BASE_URL;
const VIEWER_CONTAINER_ID = "WBS4DViewer";

const hasViewerVersionUrn = (urn) => String(urn || "").includes("urn:adsk.wipprod:fs.file:vf.");
const toText = (value) => String(value ?? "").trim();
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const normalizeWbsCode = (value) => toText(value).replace(/\s+/g, "").replace(/\.+/g, ".").replace(/\.$/, "");
const isValidWbsCode = (value) => /^\d+(\.\d+)*$/.test(normalizeWbsCode(value));

const splitWbsCodeParts = (value) => {
  const normalized = normalizeWbsCode(value);
  if (!isValidWbsCode(normalized)) return [];
  return normalized.split(".").filter(Boolean);
};

const getWbsLevel = (value) => splitWbsCodeParts(value).length;
const getParentWbsCode = (value) => {
  const parts = splitWbsCodeParts(value);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join(".");
};

const getCodeAtLevel = (value, level) => {
  const parts = splitWbsCodeParts(value);
  if (!parts.length || parts.length < level) return "";
  return parts.slice(0, level).join(".");
};

const toPositiveInt = (value) => {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : null;
  const text = String(value || "").trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const getModelUrn = (model) => {
  const candidates = [
    model?.alternativeIdentifiers?.fileVersionUrn,
    model?.version?.alternativeIdentifiers?.fileVersionUrn,
  ].filter(Boolean);
  return candidates.find(hasViewerVersionUrn) || "";
};

const parseDateToIso = (value) => {
  if (!value && value !== 0) return "";
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed?.y || !parsed?.m || !parsed?.d) return "";
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString().slice(0, 10);
  }

  const raw = toText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, Number(dmy[2]) - 1, Number(dmy[1])));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
};

const formatIso = (iso) => {
  if (!iso) return "-";
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "-";
};

const compareWbsCodes = (a, b) => {
  const aParts = normalizeWbsCode(a)
    .split(".")
    .filter(Boolean)
    .map((p) => Number(p));
  const bParts = normalizeWbsCode(b)
    .split(".")
    .filter(Boolean)
    .map((p) => Number(p));

  const max = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < max; i += 1) {
    const av = Number.isFinite(aParts[i]) ? aParts[i] : -1;
    const bv = Number.isFinite(bParts[i]) ? bParts[i] : -1;
    if (av !== bv) return av - bv;
  }
  return 0;
};

const sortWbsRows = (rows = []) =>
  [...rows].sort((left, right) => {
    const byCode = compareWbsCodes(left?.code, right?.code);
    if (byCode !== 0) return byCode;
    const leftId = toText(left?.id);
    const rightId = toText(right?.id);
    return leftId.localeCompare(rightId);
  });

const parseMoney = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).replace(/[, ]/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toCodeCell = (value) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return toText(value);
};

const pickDeepestCodeFromLevels = (row = []) => {
  const levelCells = [toCodeCell(row[0]), toCodeCell(row[1]), toCodeCell(row[2]), toCodeCell(row[3])];
  for (let i = levelCells.length - 1; i >= 0; i -= 1) {
    const candidate = normalizeWbsCode(levelCells[i]);
    if (isValidWbsCode(candidate)) return candidate;
  }
  return "";
};

const createLocalWbsRow = ({
  code,
  title = "",
  startDate = "",
  endDate = "",
  actualStartDate = "",
  actualEndDate = "",
  plannedCost = null,
  duration = "",
}) => {
  const normalizedCode = normalizeWbsCode(code);
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: normalizedCode,
    level: getWbsLevel(normalizedCode),
    title: toText(title),
    startDate: isIsoDate(startDate) ? startDate : "",
    endDate: isIsoDate(endDate) ? endDate : "",
    actualStartDate: isIsoDate(actualStartDate) ? actualStartDate : "",
    actualEndDate: isIsoDate(actualEndDate) ? actualEndDate : "",
    plannedCost: parseMoney(plannedCost),
    actualCost: null,
    duration: toText(duration),
  };
};

const hydrateWbsRows = (rows = []) => {
  if (!Array.isArray(rows)) return [];

  const hydrated = rows
    .map((row, index) => {
      const code = normalizeWbsCode(row?.code || row?.wbsCode);
      if (!isValidWbsCode(code)) return null;

      return {
        id: row?.id ?? `row-${index}-${code}`,
        code,
        level: getWbsLevel(code),
        title: toText(row?.title || row?.name || row?.activity),
        startDate: parseDateToIso(row?.startDate || row?.start_date),
        endDate: parseDateToIso(row?.endDate || row?.end_date),
        duration: toText(row?.duration || row?.durationLabel || row?.duration_label),
        baselineStartDate: parseDateToIso(row?.baselineStartDate || row?.baseline_start_date),
        baselineEndDate: parseDateToIso(row?.baselineEndDate || row?.baseline_end_date),
        actualStartDate: parseDateToIso(row?.actualStartDate || row?.actual_start_date),
        actualEndDate: parseDateToIso(row?.actualEndDate || row?.actual_end_date),
        actualProgressPct:
          row?.actualProgressPct === undefined || row?.actualProgressPct === null
            ? null
            : Number(row.actualProgressPct),
        plannedCost: parseMoney(row?.plannedCost ?? row?.planned_cost),
        actualCost: parseMoney(row?.actualCost ?? row?.actual_cost),
        extraProps: row?.extraProps || row?.extra_props || null,
      };
    })
    .filter(Boolean);

  return sortWbsRows(hydrated);
};

const getNextWbsCodeForParent = (rows = [], parentCode = "") => {
  const normalizedParent = normalizeWbsCode(parentCode);
  const parentLevel = normalizedParent ? getWbsLevel(normalizedParent) : 0;
  const targetLevel = parentLevel + 1;

  if (!targetLevel || targetLevel > 4) return "";

  let maxSequence = 0;
  rows.forEach((row) => {
    const rowCode = normalizeWbsCode(row?.code);
    const rowLevel = getWbsLevel(rowCode);
    if (rowLevel !== targetLevel) return;

    const rowParent = getParentWbsCode(rowCode);
    if (rowParent !== normalizedParent) return;

    const parts = splitWbsCodeParts(rowCode);
    const suffix = Number(parts[parts.length - 1]);
    if (Number.isFinite(suffix) && suffix > maxSequence) {
      maxSequence = suffix;
    }
  });

  const nextSuffix = maxSequence + 1;
  return normalizedParent ? `${normalizedParent}.${nextSuffix}` : String(nextSuffix);
};

const parseWbsRowsFromMatrix = (matrix = []) => {
  const seen = new Set();
  const rows = [];
  if (!Array.isArray(matrix) || !matrix.length) return rows;

  const header = (Array.isArray(matrix[0]) ? matrix[0] : []).map((cell) => toText(cell).toLowerCase());
  const isLevelFormat = header.some((cell) => cell.includes("nivel 1")) || header.some((cell) => cell.includes("actividad"));

  const startIndex = isLevelFormat ? 1 : 0;

  matrix.slice(startIndex).forEach((rawRow, idx) => {
    const row = Array.isArray(rawRow) ? rawRow : [];
    const code = isLevelFormat ? pickDeepestCodeFromLevels(row) : normalizeWbsCode(row[0]);
    const title = isLevelFormat ? toText(row[4]) : toText(row[1]);

    if (!isValidWbsCode(code) || !title || seen.has(code)) return;

    const level = getWbsLevel(code);
    if (!level || level > 4) return;
    seen.add(code);

    rows.push({
      id: `${code}-${idx + startIndex}`,
      code,
      level,
      title,
      startDate: parseDateToIso(isLevelFormat ? row[5] : row[2]),
      endDate: parseDateToIso(isLevelFormat ? row[6] : row[3]),
      actualStartDate: parseDateToIso(isLevelFormat ? row[7] : row[7]),
      actualEndDate: parseDateToIso(isLevelFormat ? row[8] : row[8]),
      plannedCost: parseMoney(isLevelFormat ? row[9] : row[9]),
      duration: toText(isLevelFormat ? row[10] : row[4]),
    });
  });

  return sortWbsRows(rows);
};

const addDaysIso = (iso, days) => {
  if (!isIsoDate(iso)) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const diffDaysIso = (fromIso, toIso) => {
  if (!isIsoDate(fromIso) || !isIsoDate(toIso)) return 0;
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  const ms = to.getTime() - from.getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24))) : 0;
};

const countInvalidWbsRows = (rows = []) => {
  const normalizedRows = (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    code: normalizeWbsCode(row?.code),
    title: toText(row?.title),
  }));

  const freqByCode = new Map();
  normalizedRows.forEach((row) => {
    if (!row.code) return;
    freqByCode.set(row.code, (freqByCode.get(row.code) || 0) + 1);
  });

  return normalizedRows.reduce((acc, row) => {
    const level = getWbsLevel(row.code);
    const invalidCode = !isValidWbsCode(row.code) || !level || level > 4;
    const duplicateCode = row.code && (freqByCode.get(row.code) || 0) > 1;
    const missingTitle = !row.title;
    return acc + (invalidCode || duplicateCode || missingTitle ? 1 : 0);
  }, 0);
};

const isLeafCode = (code, allCodes = []) => {
  const prefix = `${code}.`;
  return !allCodes.some((other) => other !== code && String(other).startsWith(prefix));
};

const getWorkRowsForAnalytics = (rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const allCodes = safeRows.map((row) => normalizeWbsCode(row.code)).filter(Boolean);
  const leafRows = safeRows.filter((row) => {
    const code = normalizeWbsCode(row.code);
    return code && isLeafCode(code, allCodes);
  });
  const withDates = leafRows.filter((row) => isIsoDate(row.startDate) && isIsoDate(row.endDate));
  return withDates.length ? withDates : leafRows;
};

const getTimelineRangeFromRows = (rows = []) => {
  const withDates = (Array.isArray(rows) ? rows : []).filter((row) => isIsoDate(row.startDate) && isIsoDate(row.endDate));
  if (!withDates.length) return { minDate: "", maxDate: "" };
  const starts = withDates.map((row) => row.startDate).sort((a, b) => String(a).localeCompare(String(b)));
  const ends = withDates.map((row) => row.endDate).sort((a, b) => String(a).localeCompare(String(b)));
  return { minDate: starts[0], maxDate: ends[ends.length - 1] };
};

const getProgressFraction = (targetDate, startDate, endDate) => {
  if (!isIsoDate(targetDate) || !isIsoDate(startDate) || !isIsoDate(endDate)) return 0;
  if (targetDate < startDate) return 0;
  if (targetDate >= endDate) return 1;
  const total = diffDaysIso(startDate, endDate) + 1;
  if (total <= 0) return 0;
  const elapsed = diffDaysIso(startDate, targetDate) + 1;
  return Math.min(1, Math.max(0, elapsed / total));
};

const getWeightedPctAtDate = (rows = [], dateIso, useActual = false) => {
  const workRows = getWorkRowsForAnalytics(rows);
  if (!workRows.length || !isIsoDate(dateIso)) return 0;

  let totalWeight = 0;
  let doneWeight = 0;

  workRows.forEach((row) => {
    const weight = parseMoney(row.plannedCost) || 1;
    totalWeight += weight;

    const start = useActual ? row.actualStartDate : row.startDate;
    const end = useActual ? row.actualEndDate : row.endDate;
    const pct = getProgressFraction(dateIso, start, end);
    doneWeight += weight * pct;
  });

  if (totalWeight <= 0) return 0;
  return Math.round((doneWeight / totalWeight) * 100);
};

const buildSCurveData = (rows = []) => {
  const workRows = getWorkRowsForAnalytics(rows);
  if (!workRows.length) return [];

  const plannedRange = getTimelineRangeFromRows(workRows);
  if (!plannedRange.minDate || !plannedRange.maxDate) return [];

  const totalDays = diffDaysIso(plannedRange.minDate, plannedRange.maxDate);
  const step = totalDays > 180 ? 7 : 1;
  const points = [];

  for (let day = 0; day <= totalDays; day += step) {
    const date = addDaysIso(plannedRange.minDate, day);
    points.push({
      date,
      label: formatIso(date),
      plannedPct: getWeightedPctAtDate(workRows, date, false),
      actualPct: getWeightedPctAtDate(workRows, date, true),
    });
  }

  const lastDate = plannedRange.maxDate;
  if (!points.length || points[points.length - 1]?.date !== lastDate) {
    points.push({
      date: lastDate,
      label: formatIso(lastDate),
      plannedPct: getWeightedPctAtDate(workRows, lastDate, false),
      actualPct: getWeightedPctAtDate(workRows, lastDate, true),
    });
  }

  return points;
};

const buildCostCurveData = (rows = []) => {
  const workRows = getWorkRowsForAnalytics(rows);
  if (!workRows.length) return [];

  const plannedRows = workRows.filter((row) => isIsoDate(row.startDate) && isIsoDate(row.endDate));
  if (!plannedRows.length) return [];
  const range = getTimelineRangeFromRows(plannedRows);
  if (!range.minDate || !range.maxDate) return [];

  const totalDays = diffDaysIso(range.minDate, range.maxDate);
  const step = totalDays > 180 ? 7 : 1;
  const points = [];

  for (let day = 0; day <= totalDays; day += step) {
    const date = addDaysIso(range.minDate, day);
    let planned = 0;
    let actual = 0;

    workRows.forEach((row) => {
      const weight = parseMoney(row.plannedCost) || 0;
      if (weight <= 0) return;
      planned += weight * getProgressFraction(date, row.startDate, row.endDate);
      actual += weight * getProgressFraction(date, row.actualStartDate, row.actualEndDate);
    });

    points.push({
      date,
      label: formatIso(date),
      plannedCost: Number(planned.toFixed(2)),
      actualCost: Number(actual.toFixed(2)),
    });
  }

  return points;
};

const buildGanttRows = (rows = []) => {
  const workRows = getWorkRowsForAnalytics(rows);
  if (!workRows.length) return [];
  const range = getTimelineRangeFromRows(workRows);
  if (!range.minDate || !range.maxDate) return [];
  const totalDays = Math.max(1, diffDaysIso(range.minDate, range.maxDate) + 1);

  return workRows.map((row) => {
    const plannedStartOffset = diffDaysIso(range.minDate, row.startDate);
    const plannedDuration = Math.max(1, diffDaysIso(row.startDate, row.endDate) + 1);
    const actualStartOffset = diffDaysIso(range.minDate, row.actualStartDate);
    const actualDuration = Math.max(1, diffDaysIso(row.actualStartDate, row.actualEndDate) + 1);

    return {
      ...row,
      plannedLeftPct: (plannedStartOffset / totalDays) * 100,
      plannedWidthPct: (plannedDuration / totalDays) * 100,
      actualLeftPct: isIsoDate(row.actualStartDate) ? (actualStartOffset / totalDays) * 100 : 0,
      actualWidthPct: isIsoDate(row.actualStartDate) && isIsoDate(row.actualEndDate) ? (actualDuration / totalDays) * 100 : 0,
      timelineMin: range.minDate,
      timelineMax: range.maxDate,
    };
  });
};

export default function AECProjectWBSPlannerPage() {
  const { projectId } = useParams();
  const selectionStorageKey = `wbs_planner_selected_model_${projectId || "unknown"}`;

  const [viewMode, setViewMode] = useState("viewer");
  const [wbsRows, setWbsRows] = useState([]);
  const [sourceFileName, setSourceFileName] = useState("");
  const [wbsSetId, setWbsSetId] = useState(null);

  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [selectedUrn, setSelectedUrn] = useState("");
  const [loadingViewer, setLoadingViewer] = useState(false);

  const [loadingWbs, setLoadingWbs] = useState(false);
  const [savingWbs, setSavingWbs] = useState(false);
  const [runningMatch, setRunningMatch] = useState(false);
  const [matchRun, setMatchRun] = useState(null);
  const [timelineDate, setTimelineDate] = useState("");
  const [playing, setPlaying] = useState(false);

  const fileInputRef = useRef(null);
  const resolvedDbIdsRef = useRef({});
  const requestDedupRef = useRef(new Map());

  const apiBase = (backendUrl || "").replace(/\/$/, "");
  const pId = encodeURIComponent(projectId || "");

  const safeJson = async (res) => {
    const c = res.headers.get("content-type") || "";
    if (!c.includes("application/json")) throw new Error((await res.text()).slice(0, 300) || "Invalid response");
    return res.json();
  };

  const shouldSkipDevDuplicateFetch = useCallback((key, windowMs = 1500) => {
    if (!import.meta.env.DEV) return false;
    const now = Date.now();
    const last = requestDedupRef.current.get(key) || 0;
    requestDedupRef.current.set(key, now);
    return now - last < windowMs;
  }, []);

  const selectedModel = useMemo(
    () => models.find((m) => String(m.id) === String(selectedModelId)) || null,
    [models, selectedModelId]
  );

  const wbsLevel4Rows = useMemo(
    () =>
      sortWbsRows(
        wbsRows.filter((row) => {
          const level = getWbsLevel(row?.code);
          return level > 0 && level <= 4;
        })
      ),
    [wbsRows]
  );

  const invalidEditableRowsCount = useMemo(() => countInvalidWbsRows(wbsLevel4Rows), [wbsLevel4Rows]);

  const timelineMin = toText(matchRun?.timeline?.minDate);
  const timelineMax = toText(matchRun?.timeline?.maxDate);
  const hasTimelineRange = isIsoDate(timelineMin) && isIsoDate(timelineMax);
  const timelineRangeDays = useMemo(() => diffDaysIso(timelineMin, timelineMax), [timelineMin, timelineMax]);
  const timelineSliderValue = useMemo(() => {
    if (!timelineMin || !timelineDate) return 0;
    return diffDaysIso(timelineMin, timelineDate);
  }, [timelineMin, timelineDate]);

  const activeRows = useMemo(() => {
    if (!timelineDate) return [];
    return (matchRun?.rows || []).filter(
      (r) => r.matchStatus === "matched" && r.startDate && r.endDate && r.startDate <= timelineDate && timelineDate <= r.endDate
    );
  }, [matchRun, timelineDate]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const sCurveData = useMemo(() => buildSCurveData(wbsLevel4Rows), [wbsLevel4Rows]);
  const costCurveData = useMemo(() => buildCostCurveData(wbsLevel4Rows), [wbsLevel4Rows]);
  const ganttRows = useMemo(() => buildGanttRows(wbsLevel4Rows), [wbsLevel4Rows]);

  const plannedPctToday = useMemo(() => getWeightedPctAtDate(wbsLevel4Rows, todayIso, false), [wbsLevel4Rows, todayIso]);
  const actualPctToday = useMemo(() => getWeightedPctAtDate(wbsLevel4Rows, todayIso, true), [wbsLevel4Rows, todayIso]);
  const deviationPctToday = actualPctToday - plannedPctToday;

  const ensureModelsLoaded = useCallback(async () => {
    if (!projectId || models.length > 0) return;
    if (shouldSkipDevDuplicateFetch(`graphql-models:${pId}`)) return;

    setLoadingModels(true);
    try {
      const res = await fetch(`${apiBase}/aec/${pId}/graphql-models`, { credentials: "include" });
      const json = await safeJson(res);
      if (!res.ok || !json.success) throw new Error(json?.message || json?.error || "Failed to load models");
      setModels(json.data?.models || []);
    } finally {
      setLoadingModels(false);
    }
  }, [projectId, models.length, apiBase, pId, shouldSkipDevDuplicateFetch]);

  const fetchLatestWbs = useCallback(
    async (modelId) => {
      const q = toText(modelId) ? `?modelId=${encodeURIComponent(modelId)}` : "";
      const res = await fetch(`${apiBase}/aec/${pId}/wbs/latest${q}`, { credentials: "include" });
      const json = await safeJson(res);
      if (!res.ok || !json.success) throw new Error(json?.message || json?.error || "Failed to load WBS");
      return json;
    },
    [apiBase, pId]
  );

  const fetchLatestMatch = useCallback(
    async (modelId) => {
      if (!toText(modelId)) return null;
      const res = await fetch(`${apiBase}/aec/${pId}/wbs/match/latest?modelId=${encodeURIComponent(modelId)}`, {
        credentials: "include",
      });
      const json = await safeJson(res);
      if (!res.ok || !json.success) throw new Error(json?.message || json?.error || "Failed to load matching");
      return json;
    },
    [apiBase, pId]
  );

  const loadPlannerState = useCallback(
    async (modelId) => {
      setLoadingWbs(true);
      try {
        const [wbsJson, matchJson] = await Promise.all([fetchLatestWbs(modelId), fetchLatestMatch(modelId)]);
        if (wbsJson?.found) {
          setWbsRows(hydrateWbsRows(wbsJson?.data?.rows));
          setSourceFileName(toText(wbsJson?.data?.wbsSet?.sourceFileName));
          setWbsSetId(wbsJson?.data?.wbsSet?.id || null);
        } else {
          setWbsRows([]);
          setSourceFileName("");
          setWbsSetId(null);
        }
        setMatchRun(matchJson?.found ? matchJson.data : null);
      } finally {
        setLoadingWbs(false);
      }
    },
    [fetchLatestWbs, fetchLatestMatch]
  );

  const persistWbs = useCallback(
    async (rows, fileName) => {
      setSavingWbs(true);
      try {
        const res = await fetch(`${apiBase}/aec/${pId}/wbs/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            modelId: selectedModelId || null,
            sourceFileName: fileName,
            rows,
            activateForModel: Boolean(selectedModelId),
          }),
        });
        const json = await safeJson(res);
        if (!res.ok || !json.success) throw new Error(json?.message || json?.error || "Failed to save WBS");
        return json?.data || null;
      } finally {
        setSavingWbs(false);
      }
    },
    [apiBase, pId, selectedModelId]
  );

  const saveEditableWbs = useCallback(async () => {
    if (!wbsLevel4Rows.length) {
      toast.warning("No hay filas WBS para guardar.");
      return;
    }

    if (invalidEditableRowsCount > 0) {
      toast.error("Corrige filas invalidas antes de guardar.");
      return;
    }

    try {
      const rowsToPersist = wbsLevel4Rows.map((row) => {
        const payload = { ...row };
        delete payload.id;
        return {
          ...payload,
          code: normalizeWbsCode(row.code),
          level: getWbsLevel(row.code),
          title: toText(row.title),
          startDate: isIsoDate(row.startDate) ? row.startDate : null,
          endDate: isIsoDate(row.endDate) ? row.endDate : null,
          actualStartDate: isIsoDate(row.actualStartDate) ? row.actualStartDate : null,
          actualEndDate: isIsoDate(row.actualEndDate) ? row.actualEndDate : null,
          plannedCost: parseMoney(row.plannedCost),
          duration: toText(row.duration),
        };
      });

      await persistWbs(rowsToPersist, sourceFileName || "WBS_Manual");
      await loadPlannerState(selectedModelId);
      toast.success(`WBS guardada (${rowsToPersist.length} filas)`);
    } catch (err) {
      toast.error(err?.message || "No se pudo guardar WBS.");
    }
  }, [invalidEditableRowsCount, loadPlannerState, persistWbs, selectedModelId, sourceFileName, wbsLevel4Rows]);

  const runMatching = useCallback(async () => {
    if (!selectedModelId || !wbsSetId) {
      toast.warning("Selecciona modelo y carga WBS antes de emparejar.");
      return;
    }

    setRunningMatch(true);
    try {
      const res = await fetch(`${apiBase}/aec/${pId}/wbs/match/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modelId: selectedModelId, wbsSetId }),
      });
      const json = await safeJson(res);
      if (!res.ok || !json.success) throw new Error(json?.message || json?.error || "Failed to run matching");
      toast.success(`Matching listo: ${json?.data?.matchedElements || 0}/${json?.data?.totalElements || 0}`);
      const latest = await fetchLatestMatch(selectedModelId);
      setMatchRun(latest?.found ? latest.data : null);
    } catch (err) {
      toast.error(err?.message || "No se pudo ejecutar matching.");
    } finally {
      setRunningMatch(false);
    }
  }, [apiBase, pId, selectedModelId, wbsSetId, fetchLatestMatch]);

  const openModelDialog = async () => {
    setIsModelDialogOpen(true);
    try {
      await ensureModelsLoaded();
    } catch (err) {
      toast.error(err?.message || "No se pudo cargar la lista de modelos.");
    }
  };

  const buildWbsExportRows = useCallback(
    (rows = []) =>
      (Array.isArray(rows) ? rows : []).map((row) => ({
        "Nivel 1": getCodeAtLevel(row.code, 1) || "",
        "Nivel 2": getCodeAtLevel(row.code, 2) || "",
        "Nivel 3": getCodeAtLevel(row.code, 3) || "",
        "Nivel 4": getCodeAtLevel(row.code, 4) || "",
        Actividad: toText(row.title),
        "Inicio Planeado": isIsoDate(row.startDate) ? row.startDate : "",
        "Fin Planeado": isIsoDate(row.endDate) ? row.endDate : "",
        "Inicio Real": isIsoDate(row.actualStartDate) ? row.actualStartDate : "",
        "Fin Real": isIsoDate(row.actualEndDate) ? row.actualEndDate : "",
        Costo: parseMoney(row.plannedCost) ?? "",
        Duracion: toText(row.duration),
      })),
    []
  );

  const exportWbsToExcel = useCallback(() => {
    const exportRows = buildWbsExportRows(wbsLevel4Rows);
    if (!exportRows.length) {
      toast.warning("No hay filas para exportar.");
      return;
    }

    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "WBS");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    XLSX.writeFile(wb, `WBS_Planner_${stamp}.xlsx`);
  }, [buildWbsExportRows, wbsLevel4Rows]);

  const exportWbsToPdf = useCallback(() => {
    const exportRows = buildWbsExportRows(wbsLevel4Rows);
    if (!exportRows.length) {
      toast.warning("No hay filas para exportar.");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(12);
    doc.text("WBS Planner", 40, 30);
    autoTable(doc, {
      startY: 40,
      styles: { fontSize: 7, cellPadding: 3 },
      head: [Object.keys(exportRows[0])],
      body: exportRows.map((row) => Object.values(row)),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    doc.save(`WBS_Planner_${stamp}.pdf`);
  }, [buildWbsExportRows, wbsLevel4Rows]);

  const exportGanttToPdf = useCallback(() => {
    if (!ganttRows.length) {
      toast.warning("No hay datos de Gantt para exportar.");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(12);
    doc.text("Gantt WBS", 40, 30);
    autoTable(doc, {
      startY: 40,
      styles: { fontSize: 8, cellPadding: 3 },
      head: [["WBS", "Actividad", "Inicio Planeado", "Fin Planeado", "Inicio Real", "Fin Real", "Costo"]],
      body: ganttRows.map((row) => [
        row.code || "",
        row.title || "",
        row.startDate || "",
        row.endDate || "",
        row.actualStartDate || "",
        row.actualEndDate || "",
        parseMoney(row.plannedCost) ?? "",
      ]),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    doc.save(`WBS_Gantt_${stamp}.pdf`);
  }, [ganttRows]);

  const handleChangeWbsField = useCallback((rowId, field, value) => {
    setWbsRows((prev) =>
      prev.map((row) => {
        if (String(row.id) !== String(rowId)) return row;

        if (field === "startDate" || field === "endDate" || field === "actualStartDate" || field === "actualEndDate") {
          return { ...row, [field]: isIsoDate(value) ? value : "" };
        }

        if (field === "plannedCost") {
          return { ...row, plannedCost: value === "" ? null : value };
        }

        return { ...row, [field]: value };
      })
    );
  }, []);

  const handleAddLevel1Row = useCallback(() => {
    setWbsRows((prev) => {
      const nextCode = getNextWbsCodeForParent(prev, "");
      if (!nextCode) return prev;
      return sortWbsRows([...prev, createLocalWbsRow({ code: nextCode })]);
    });
  }, []);

  const handleAddChildRow = useCallback((rowId) => {
    let warningMessage = "";

    setWbsRows((prev) => {
      const parent = prev.find((row) => String(row.id) === String(rowId));
      if (!parent) {
        warningMessage = "No se encontro la fila padre.";
        return prev;
      }

      const parentCode = normalizeWbsCode(parent.code);
      const parentLevel = getWbsLevel(parentCode);
      if (!parentCode || !parentLevel) {
        warningMessage = "La fila padre tiene un codigo invalido.";
        return prev;
      }

      if (parentLevel >= 4) {
        warningMessage = "Nivel 4 es el ultimo nivel permitido.";
        return prev;
      }

      const nextCode = getNextWbsCodeForParent(prev, parentCode);
      if (!nextCode) {
        warningMessage = "No se pudo autogenerar el codigo hijo.";
        return prev;
      }

      const newRow = createLocalWbsRow({
        code: nextCode,
        startDate: parent.startDate,
        endDate: parent.endDate,
        actualStartDate: parent.actualStartDate,
        actualEndDate: parent.actualEndDate,
        plannedCost: parent.plannedCost,
      });

      return sortWbsRows([...prev, newRow]);
    });

    if (warningMessage) toast.warning(warningMessage);
  }, []);

  const handleDeleteRow = useCallback((rowId) => {
    setWbsRows((prev) => {
      const target = prev.find((row) => String(row.id) === String(rowId));
      if (!target) return prev;

      const targetCode = normalizeWbsCode(target.code);
      if (!targetCode) return prev;

      const targetPrefix = `${targetCode}.`;
      return prev.filter((row) => {
        const code = normalizeWbsCode(row.code);
        if (!code) return false;
        return code !== targetCode && !code.startsWith(targetPrefix);
      });
    });
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        await ensureModelsLoaded();
      } catch {
        setModels([]);
      }

      const persisted = typeof window !== "undefined" ? window.sessionStorage.getItem(selectionStorageKey) : null;
      if (persisted) setSelectedModelId(persisted);
    };

    boot();
  }, [selectionStorageKey, ensureModelsLoaded]);

  useEffect(() => {
    loadPlannerState(selectedModelId).catch((err) => toast.error(err?.message || "No se pudo cargar WBS."));
  }, [selectedModelId, loadPlannerState]);

  useEffect(() => {
    if (typeof window !== "undefined" && selectedModelId) {
      window.sessionStorage.setItem(selectionStorageKey, String(selectedModelId));
    }
  }, [selectedModelId, selectionStorageKey]);

  useEffect(() => {
    if (!selectedModel) return setSelectedUrn("");
    const urn = getModelUrn(selectedModel);
    setSelectedUrn(urn);
    if (urn && !hasViewerVersionUrn(urn)) toast.warning("Modelo sin fileVersionUrn valido.");
  }, [selectedModel]);

  useEffect(() => {
    if (viewMode !== "viewer" || !selectedUrn) return;
    let cancelled = false;
    setLoadingViewer(true);
    simpleViewer(selectedUrn, VIEWER_CONTAINER_ID)
      .catch((error) => {
        if (!cancelled) {
          toast.error(error?.message || "No se pudo inicializar el viewer.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingViewer(false);
      });

    return () => {
      cancelled = true;
      teardownSimpleViewer();
    };
  }, [viewMode, selectedUrn]);

  useEffect(() => () => teardownSimpleViewer(), []);

  useEffect(() => {
    if (!timelineMin || !timelineMax) {
      setTimelineDate("");
      setPlaying(false);
      return;
    }

    setTimelineDate((prev) => (isIsoDate(prev) ? prev : timelineMin));
  }, [timelineMin, timelineMax]);

  useEffect(() => {
    if (viewMode !== "viewer" || !selectedUrn || loadingViewer || !matchRun?.rows?.length) return;
    let cancelled = false;

    const rows = matchRun.rows.map((r) => ({
      viewerDbId: r.viewerDbId,
      revitElementId: r.revitElementId,
      elementId: r.elementId,
      externalElementId: r.externalElementId,
    }));

    resolveViewerDbIdsForRows(rows)
      .then((resolution) => {
        if (cancelled) return;
        const map = {};
        (matchRun.rows || []).forEach((row, index) => {
          const id = toPositiveInt(resolution?.resolvedByRowIndex?.[index]);
          if (id) map[row.id] = id;
        });
        resolvedDbIdsRef.current = map;
      })
      .catch(() => {
        resolvedDbIdsRef.current = {};
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, selectedUrn, loadingViewer, matchRun]);

  useEffect(() => {
    if (viewMode !== "viewer" || !selectedUrn) return;
    if (!activeRows.length) {
      try {
        clearViewerIsolation();
      } catch {
        return;
      }
      return;
    }

    const dbIds = Array.from(
      new Set(
        activeRows
          .map((r) => toPositiveInt(r.viewerDbId) || toPositiveInt(resolvedDbIdsRef.current[r.id]))
          .filter(Boolean)
      )
    );

    if (!dbIds.length) {
      try {
        clearViewerIsolation();
      } catch {
        return;
      }
      return;
    }

    try {
      isolateViewerDbIds(dbIds, { fitToView: false, select: false });
    } catch {
      return;
    }
  }, [activeRows, viewMode, selectedUrn]);

  useEffect(() => {
    if (!playing || !timelineMin || !timelineMax) return undefined;

    const timer = window.setInterval(() => {
      setTimelineDate((prev) => {
        const next = addDaysIso(isIsoDate(prev) ? prev : timelineMin, 1);
        if (!next || next > timelineMax) {
          setPlaying(false);
          return timelineMax;
        }
        return next;
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [playing, timelineMin, timelineMax]);

  useEffect(() => {
    if (viewMode !== "viewer") setPlaying(false);
  }, [viewMode]);

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-[1800px] space-y-6 p-6">
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Project Construction Traking</h1>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;

            try {
              const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
              const sheet = wb.Sheets[wb.SheetNames?.[0]];
              if (!sheet) throw new Error("Archivo sin hojas");

              const parsed = parseWbsRowsFromMatrix(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }));
              if (!parsed.length) throw new Error("No se detectaron filas WBS validas hasta nivel 4");

              setWbsRows(parsed);
              setSourceFileName(file.name);
              await persistWbs(parsed, file.name);
              await loadPlannerState(selectedModelId);
              toast.success(`WBS guardada (${parsed.length} filas)`);
            } catch (err) {
              toast.error(err?.message || "No se pudo cargar/guardar WBS");
            } finally {
              event.target.value = "";
            }
          }}
        />

        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-foreground">Controles</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={savingWbs || loadingWbs}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> {savingWbs ? "Guardando..." : "Cargar Excel WBS"}
            </Button>

            <Button variant="outline" className="gap-2" onClick={openModelDialog}>
              <Boxes className="h-4 w-4" /> Seleccionar Modelo
            </Button>

            <Button
              variant="outline"
              className="gap-2"
              disabled={!selectedModelId || !wbsSetId || runningMatch}
              onClick={runMatching}
            >
              <Link2 className="h-4 w-4" /> {runningMatch ? "Emparejando..." : "Emparejar Modelo-WBS"}
            </Button>

            {loadingWbs ? <Badge variant="secondary">Cargando WBS...</Badge> : null}
            {matchRun?.run ? (
              <Badge variant="secondary">
                Match {matchRun.run.matchedElements}/{matchRun.run.totalElements}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-foreground">Modos de Visualizacion</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={viewMode === "table" ? "default" : "ghost"} onClick={() => setViewMode("table")}>
              Tabla WBS
            </Button>
            <Button size="sm" variant={viewMode === "viewer" ? "default" : "ghost"} onClick={() => setViewMode("viewer")}>
              <MonitorPlay className="mr-1 h-4 w-4" /> Viewer + Tabla
            </Button>
            <Button size="sm" variant={viewMode === "dashboard" ? "default" : "ghost"} onClick={() => setViewMode("dashboard")}>
              <Presentation className="mr-1 h-4 w-4" /> Dashboard
            </Button>
            <Button size="sm" variant={viewMode === "gantt" ? "default" : "ghost"} onClick={() => setViewMode("gantt")}>
              <FileText className="mr-1 h-4 w-4" /> Gant
            </Button>
          </div>
        </div>

        {viewMode === "table" ? (
          <WBSPlannerTable
            rows={wbsLevel4Rows}
            readOnly={false}
            viewportClassName="h-[680px]"
            onChangeField={handleChangeWbsField}
            onAddLevel1={handleAddLevel1Row}
            onAddChild={handleAddChildRow}
            onDeleteRow={handleDeleteRow}
            onSave={saveEditableWbs}
            onExportExcel={exportWbsToExcel}
            onExportPdf={exportWbsToPdf}
            saving={savingWbs}
            invalidRowsCount={invalidEditableRowsCount}
          />
        ) : null}

        {viewMode === "viewer" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
                  <span>Viewer 4D</span>
                  <Badge variant="outline">Activos: {activeRows.length}</Badge>
                </div>

                <div className="relative h-[680px] bg-slate-100">
                  {loadingViewer ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
                      <AbitatLogoLoader className="scale-75" />
                    </div>
                  ) : null}

                  {!selectedUrn ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
                      Selecciona un modelo para inicializar el Autodesk Viewer.
                    </div>
                  ) : null}

                  <div id={VIEWER_CONTAINER_ID} className="h-full w-full" />
                </div>
              </div>

              <div className="min-w-0 overflow-hidden">
                <WBSPlannerTable
                  rows={wbsLevel4Rows}
                  readOnly
                  viewportClassName="h-[680px]"
                  onExportExcel={exportWbsToExcel}
                  onExportPdf={exportWbsToPdf}
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">Control 4D</span>
                <Button size="sm" variant="outline" disabled={!hasTimelineRange} onClick={() => setPlaying((v) => !v)}>
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!hasTimelineRange}
                  onClick={() => {
                    setPlaying(false);
                    if (timelineMin) setTimelineDate(timelineMin);
                  }}
                >
                  Reset
                </Button>
                <input
                  type="date"
                  min={timelineMin || undefined}
                  max={timelineMax || undefined}
                  value={timelineDate}
                  disabled={!hasTimelineRange}
                  onChange={(event) => {
                    setPlaying(false);
                    setTimelineDate(event.target.value);
                  }}
                  className="h-8 rounded border px-2 text-xs"
                />
              </div>

              <input
                type="range"
                min={0}
                max={Math.max(timelineRangeDays, 0)}
                step={1}
                value={Math.min(timelineSliderValue, Math.max(timelineRangeDays, 0))}
                disabled={!hasTimelineRange}
                onChange={(event) => {
                  const offset = Number(event.target.value);
                  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
                  const nextDate = addDaysIso(timelineMin, safeOffset);
                  if (!nextDate) return;
                  setPlaying(false);
                  setTimelineDate(nextDate);
                }}
                className="w-full accent-primary disabled:opacity-50"
              />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Inicio: {formatIso(timelineMin)}</span>
                <span>Actual: {formatIso(timelineDate)}</span>
                <span>Fin: {formatIso(timelineMax)}</span>
              </div>
            </div>
          </div>
        ) : null}

        {viewMode === "dashboard" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Actividades WBS</p>
                <p className="text-2xl font-bold text-foreground">{wbsLevel4Rows.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Planeado al {formatIso(todayIso)}</p>
                <p className="text-2xl font-bold text-foreground">{plannedPctToday}%</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Real al {formatIso(todayIso)}</p>
                <p className="text-2xl font-bold text-foreground">{actualPctToday}%</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Desviacion</p>
                <p className={`text-2xl font-bold ${deviationPctToday >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {deviationPctToday >= 0 ? "+" : ""}
                  {deviationPctToday}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Curva S (Planeado vs Real)</h3>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sCurveData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" minTickGap={24} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="plannedPct" name="Planeado %" stroke="#2563eb" fill="#93c5fd" />
                      <Area type="monotone" dataKey="actualPct" name="Real %" stroke="#dc2626" fill="#fca5a5" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Costo Prorrateado por Fecha</h3>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={costCurveData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" minTickGap={24} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="plannedCost" name="Costo Planeado" stroke="#1d4ed8" dot={false} />
                      <Line type="monotone" dataKey="actualCost" name="Costo Ejecutado" stroke="#b91c1c" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {viewMode === "gantt" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" className="gap-2" onClick={exportGanttToPdf} disabled={!ganttRows.length}>
                <Download className="h-4 w-4" /> Exportar Gantt PDF
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              {!ganttRows.length ? (
                <p className="text-sm text-muted-foreground">No hay datos suficientes (inicio/fin planeado) para generar Gantt.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Inicio timeline: {formatIso(ganttRows[0].timelineMin)}</span>
                    <span>Fin timeline: {formatIso(ganttRows[0].timelineMax)}</span>
                  </div>
                  <div className="max-h-[680px] overflow-auto">
                    {ganttRows.map((row) => (
                      <div key={row.id || row.code} className="grid grid-cols-[280px_1fr] gap-3 border-b border-border py-2">
                        <div>
                          <p className="text-xs font-mono text-muted-foreground">{row.code}</p>
                          <p className="text-sm font-medium text-foreground">{row.title || "-"}</p>
                          <p className="text-[11px] text-muted-foreground">
                            P: {formatIso(row.startDate)} - {formatIso(row.endDate)} | R: {formatIso(row.actualStartDate)} - {formatIso(row.actualEndDate)}
                          </p>
                        </div>
                        <div className="relative mt-2 h-8 rounded bg-muted/50">
                          <div
                            className="absolute top-1 h-2 rounded bg-blue-500/80"
                            style={{ left: `${row.plannedLeftPct}%`, width: `${row.plannedWidthPct}%` }}
                            title="Planeado"
                          />
                          {row.actualWidthPct > 0 ? (
                            <div
                              className="absolute top-4 h-2 rounded bg-red-500/80"
                              style={{ left: `${row.actualLeftPct}%`, width: `${row.actualWidthPct}%` }}
                              title="Real"
                            />
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <SelectModelsModal
        models={models}
        open={isModelDialogOpen}
        loading={loadingModels}
        initialSelectedIds={selectedModelId ? [selectedModelId] : []}
        onClose={() => setIsModelDialogOpen(false)}
        onSave={async (ids) => {
          if (!Array.isArray(ids) || ids.length === 0) return;
          const nextSelected = ids[0];
          setSelectedModelId(nextSelected);
          setIsModelDialogOpen(false);
          if (ids.length > 1) toast.warning("Solo se usara el primer modelo para el viewer 4D");
        }}
      />
    </AppLayout>
  );
}
