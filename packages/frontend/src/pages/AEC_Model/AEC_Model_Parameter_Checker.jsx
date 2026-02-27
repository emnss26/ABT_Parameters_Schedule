import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Boxes, Eraser, Play, Target } from "lucide-react"

import AppLayout from "@/components/general_component/AppLayout"
import AbitatLogoLoader from "@/components/general_component/AbitatLogoLoader"
import SelectModelsModal from "@/components/aec_model_components/SelectModelModal"
import ParameterComplianceTable from "@/components/aec_model_components/ParameterComplianceTable"
import ProjectParameterComplianceTable from "@/components/aec_model_components/ProjectParameterComplianceTable"
import {
  PARAMETER_CHECKER_DISCIPLINES,
  DEFAULT_DISCIPLINE_ID,
  getDisciplineById,
} from "@/constants/aecModelParameterChecker.constants"
import {
  clearViewerIsolation,
  isolateViewerDbIds,
  resolveViewerDbIdsForRows,
  simpleViewer,
  teardownSimpleViewer,
} from "@/utils/viewers/simpleViewer"

const backendUrl = import.meta.env.VITE_API_BACKEND_BASE_URL
const VIEWER_CONTAINER_ID = "TADSimpleViewer"
const CATEGORY_REQUEST_DELAY_MS = 180

const hasViewerVersionUrn = (urn) =>
  String(urn || "").includes("urn:adsk.wipprod:fs.file:vf.")

const getModelUrn = (model) => {
  const candidates = [
    model?.alternativeIdentifiers?.fileVersionUrn,
    model?.version?.alternativeIdentifiers?.fileVersionUrn,
  ].filter(Boolean)

  const versionUrn = candidates.find(hasViewerVersionUrn)
  return versionUrn || ""
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const compactRowsForPersistence = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((row) => ({
    viewerDbId: row?.viewerDbId ?? null,
    dbId: row?.dbId ?? null,
    elementId: row?.elementId || "",
    externalElementId: row?.externalElementId || "",
    revitElementId: row?.revitElementId || "",
    category: row?.category || "",
    familyName: row?.familyName || "",
    elementName: row?.elementName || "",
    typeMark: row?.typeMark || "",
    description: row?.description || "",
    model: row?.model || "",
    manufacturer: row?.manufacturer || "",
    assemblyCode: row?.assemblyCode || "",
    assemblyDescription: row?.assemblyDescription || "",
    count: row?.count || 1,
    compliance: row?.compliance || null,
  }))

export default function AECModelParameterCheckerPage() {
  const { projectId } = useParams()

  const bootstrappedProjectRef = useRef("")
  const analysisRunRef = useRef(0)
  const dbLoadRunRef = useRef(0)
  const requestDedupRef = useRef(new Map())

  const selectionStorageKey = `parameter_checker_selected_model_${projectId || "unknown"}`

  const [models, setModels] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false)

  const [selectedModelId, setSelectedModelId] = useState(null)
  const [selectedUrn, setSelectedUrn] = useState("")

  const [selectedDisciplineId, setSelectedDisciplineId] = useState(DEFAULT_DISCIPLINE_ID)
  const [activeCategoryId, setActiveCategoryId] = useState("")

  const [analysisByDiscipline, setAnalysisByDiscipline] = useState({})
  const [isAnalyzingDiscipline, setIsAnalyzingDiscipline] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState({ completed: 0, total: 0 })
  const [isResolvingIsolation, setIsResolvingIsolation] = useState(false)
  const [isResolvingLastDiscipline, setIsResolvingLastDiscipline] = useState(false)
  const [viewMode, setViewMode] = useState("checker")
  const [projectComplianceSummary, setProjectComplianceSummary] = useState({ rows: [], grandTotal: null })
  const [loadingProjectCompliance, setLoadingProjectCompliance] = useState(false)

  const [loadingViewer, setLoadingViewer] = useState(false)

  const apiBase = (backendUrl || "").replace(/\/$/, "")
  const pId = encodeURIComponent(projectId || "")

  const safeJson = async (res) => {
    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      const raw = await res.text()
      throw new Error(raw.slice(0, 300) || "Invalid non-JSON response")
    }
    return res.json()
  }

  const shouldSkipDevDuplicateFetch = useCallback((key, windowMs = 1500) => {
    if (!import.meta.env.DEV) return false
    const now = Date.now()
    const last = requestDedupRef.current.get(key) || 0
    requestDedupRef.current.set(key, now)
    return now - last < windowMs
  }, [])

  const selectedModel = useMemo(
    () => models.find((model) => String(model.id) === String(selectedModelId)) || null,
    [models, selectedModelId]
  )

  const modelNameById = useMemo(
    () =>
      models.reduce((acc, model) => {
        acc[String(model.id)] = String(model.name || "").trim()
        return acc
      }, {}),
    [models]
  )

  const selectedDiscipline = useMemo(() => {
    const fromId = getDisciplineById(selectedDisciplineId)
    return fromId || PARAMETER_CHECKER_DISCIPLINES[0] || null
  }, [selectedDisciplineId])

  const resolveDisciplineName = useCallback((disciplineId) => {
    const discipline = getDisciplineById(String(disciplineId || ""))
    return discipline?.name || String(disciplineId || "")
  }, [])

  const resolveModelName = useCallback(
    (modelId) => modelNameById[String(modelId || "")] || String(modelId || ""),
    [modelNameById]
  )

  const effectiveActiveCategoryId = useMemo(() => {
    const categories = Array.isArray(selectedDiscipline?.categories) ? selectedDiscipline.categories : []
    if (!categories.length) return ""
    if (categories.some((category) => category.id === activeCategoryId)) return activeCategoryId
    return categories[0].id
  }, [selectedDiscipline, activeCategoryId])

  const disciplineResults = useMemo(() => {
    return analysisByDiscipline?.[selectedDiscipline?.id || ""]?.categories || {}
  }, [analysisByDiscipline, selectedDiscipline])

  const activeCategoryRows = useMemo(() => {
    const rows = disciplineResults?.[effectiveActiveCategoryId]?.rows
    return Array.isArray(rows) ? rows : []
  }, [disciplineResults, effectiveActiveCategoryId])

  const globalKpis = useMemo(() => {
    const disciplineEntries = Object.values(analysisByDiscipline || {})
    let totalElements = 0
    let weightedComplianceAccumulator = 0
    let fullyCompliant = 0
    let analyzedDisciplines = 0

    disciplineEntries.forEach((disciplineEntry) => {
      const categoryEntries = Object.values(disciplineEntry?.categories || {})
      const hasSuccessCategory = categoryEntries.some((entry) => entry?.status === "success")
      if (hasSuccessCategory) analyzedDisciplines += 1

      categoryEntries.forEach((entry) => {
        if (entry?.status !== "success") return

        const summary = entry?.summary || {}
        const totalForCategory = Number(summary.totalElements) || (Array.isArray(entry.rows) ? entry.rows.length : 0)
        const avgForCategory = Number(summary.averageCompliancePct) || 0
        const fullyForCategory = Number(summary.fullyCompliant) || 0

        totalElements += totalForCategory
        weightedComplianceAccumulator += avgForCategory * totalForCategory
        fullyCompliant += fullyForCategory
      })
    })

    const avgCompliance = totalElements > 0 ? Math.round(weightedComplianceAccumulator / totalElements) : 0

    return {
      totalElements,
      avgCompliance,
      fullyCompliant,
      analyzedDisciplines,
    }
  }, [analysisByDiscipline])

  const ensureModelsLoaded = useCallback(async () => {
    if (!projectId || models.length > 0) return
    if (shouldSkipDevDuplicateFetch(`graphql-models:${pId}`)) return

    setLoadingModels(true)
    try {
      const res = await fetch(`${apiBase}/aec/${pId}/graphql-models`, {
        credentials: "include",
      })
      const json = await safeJson(res)
      if (!res.ok || !json.success) {
        throw new Error(json?.message || json?.error || "Failed to fetch models")
      }

      setModels(json.data?.models || [])
    } finally {
      setLoadingModels(false)
    }
  }, [apiBase, pId, projectId, models.length, shouldSkipDevDuplicateFetch])

  const fetchCategoryParameters = useCallback(
    async ({ modelId, categoryQuery }) => {
      const endpoint =
        `${apiBase}/aec/${pId}/graphql-model-parameters` +
        `?modelId=${encodeURIComponent(modelId)}` +
        `&category=${encodeURIComponent(categoryQuery)}`

      const res = await fetch(endpoint, { credentials: "include" })
      const json = await safeJson(res)
      if (!res.ok || !json.success) {
        throw new Error(json?.message || json?.error || "Failed to fetch parameter compliance")
      }

      const rows = Array.isArray(json?.data?.rows) ? json.data.rows : []
      const summaryFromApi = json?.data?.summary || null
      const summary = {
        totalElements: Number(summaryFromApi?.totalElements) || rows.length,
        averageCompliancePct: Number(summaryFromApi?.averageCompliancePct) || 0,
        fullyCompliant: Number(summaryFromApi?.fullyCompliant) || 0,
      }

      return { rows, summary }
    },
    [apiBase, pId]
  )

  const fetchLastCategoryCheck = useCallback(
    async ({ modelId, disciplineId, categoryId }) => {
      const endpoint =
        `${apiBase}/aec/${pId}/parameters/last-check` +
        `?modelId=${encodeURIComponent(modelId)}` +
        `&disciplineId=${encodeURIComponent(disciplineId)}` +
        `&categoryId=${encodeURIComponent(categoryId)}`

      const res = await fetch(endpoint, { credentials: "include" })
      const json = await safeJson(res)

      if (!res.ok || !json.success) {
        throw new Error(json?.message || json?.error || "Failed to fetch latest saved check")
      }

      if (!json.found) return null

      const rows = Array.isArray(json?.data?.rows) ? json.data.rows : []
      const summaryFromApi = json?.data?.summary || null

      return {
        rows,
        summary: {
          totalElements: Number(summaryFromApi?.totalElements) || rows.length,
          averageCompliancePct: Number(summaryFromApi?.averageCompliancePct) || 0,
          fullyCompliant: Number(summaryFromApi?.fullyCompliant) || 0,
        },
        checkData: json?.checkData || null,
      }
    },
    [apiBase, pId]
  )

  const fetchLatestDisciplineForModel = useCallback(
    async (modelId) => {
      const endpoint =
        `${apiBase}/aec/${pId}/parameters/last-discipline` +
        `?modelId=${encodeURIComponent(modelId)}`

      const res = await fetch(endpoint, { credentials: "include" })
      const json = await safeJson(res)

      if (!res.ok || !json.success) {
        throw new Error(json?.message || json?.error || "Failed to fetch latest checked discipline")
      }

      return json
    },
    [apiBase, pId]
  )

  const fetchProjectComplianceSummary = useCallback(async () => {
    if (!projectId) return

    setLoadingProjectCompliance(true)
    try {
      const endpoint = `${apiBase}/aec/${pId}/parameters/project-compliance`
      const res = await fetch(endpoint, { credentials: "include" })
      const json = await safeJson(res)

      if (!res.ok || !json.success) {
        throw new Error(json?.message || json?.error || "Failed to fetch project parameter compliance")
      }

      setProjectComplianceSummary({
        rows: Array.isArray(json?.data?.rows) ? json.data.rows : [],
        grandTotal: json?.data?.grandTotal || null,
      })
    } finally {
      setLoadingProjectCompliance(false)
    }
  }, [apiBase, pId, projectId])

  const saveCategoryCheck = useCallback(
    async ({ modelId, disciplineId, categoryId, rows }) => {
      const endpoint = `${apiBase}/aec/${pId}/parameters/save-check`
      const payload = {
        modelId,
        disciplineId,
        categoryId,
        status: "completed",
        elements: compactRowsForPersistence(rows),
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const json = await safeJson(res)
      if (!res.ok || !json.success) {
        throw new Error(json?.message || json?.error || "Failed to save parameter check")
      }

      return json?.data || null
    },
    [apiBase, pId]
  )

  const hydrateDisciplineFromDb = useCallback(
    async ({ modelId, discipline }) => {
      if (!modelId || !discipline) return

      const categories = Array.isArray(discipline.categories) ? discipline.categories : []
      if (!categories.length) return

      const runId = Date.now()
      dbLoadRunRef.current = runId
      setIsLoadingHistory(true)

      setAnalysisByDiscipline((prev) => {
        const previousDiscipline = prev[discipline.id] || {}
        const previousCategories = previousDiscipline.categories || {}
        const nextCategories = { ...previousCategories }

        categories.forEach((category) => {
          nextCategories[category.id] = {
            ...(nextCategories[category.id] || {}),
            status: "loading",
            error: "",
            rows: [],
            summary: null,
            categoryId: category.id,
            categoryName: category.name,
            categoryQuery: category.query,
            modelId,
          }
        })

        return {
          ...prev,
          [discipline.id]: {
            ...previousDiscipline,
            disciplineId: discipline.id,
            disciplineName: discipline.name,
            modelId,
            lastRunAt: new Date().toISOString(),
            categories: nextCategories,
          },
        }
      })

      try {
        const categoryResults = await Promise.all(
          categories.map(async (category) => {
            try {
              const persisted = await fetchLastCategoryCheck({
                modelId,
                disciplineId: discipline.id,
                categoryId: category.id,
              })

              if (!persisted) {
                return {
                  categoryId: category.id,
                  categoryName: category.name,
                  categoryQuery: category.query,
                  status: "idle",
                  error: "",
                  rows: [],
                  summary: {
                    totalElements: 0,
                    averageCompliancePct: 0,
                    fullyCompliant: 0,
                  },
                }
              }

              return {
                categoryId: category.id,
                categoryName: category.name,
                categoryQuery: category.query,
                status: "success",
                error: "",
                rows: persisted.rows,
                summary: persisted.summary,
              }
            } catch (err) {
              return {
                categoryId: category.id,
                categoryName: category.name,
                categoryQuery: category.query,
                status: "error",
                error: err?.message || "Error cargando historial desde DB.",
                rows: [],
                summary: {
                  totalElements: 0,
                  averageCompliancePct: 0,
                  fullyCompliant: 0,
                },
              }
            }
          })
        )

        if (dbLoadRunRef.current !== runId) return

        setAnalysisByDiscipline((prev) => {
          const previousDiscipline = prev[discipline.id] || {}
          const previousCategories = previousDiscipline.categories || {}
          const mergedCategories = { ...previousCategories }

          categoryResults.forEach((entry) => {
            mergedCategories[entry.categoryId] = {
              status: entry.status,
              error: entry.error,
              rows: entry.rows,
              summary: entry.summary,
              categoryId: entry.categoryId,
              categoryName: entry.categoryName,
              categoryQuery: entry.categoryQuery,
              modelId,
            }
          })

          return {
            ...prev,
            [discipline.id]: {
              ...previousDiscipline,
              disciplineId: discipline.id,
              disciplineName: discipline.name,
              modelId,
              lastRunAt: new Date().toISOString(),
              categories: mergedCategories,
            },
          }
        })

      } finally {
        if (dbLoadRunRef.current === runId) {
          setIsLoadingHistory(false)
        }
      }
    },
    [fetchLastCategoryCheck]
  )

  const runDisciplineAnalysis = useCallback(async () => {
    if (!selectedModelId) {
      toast.warning("Selecciona un modelo primero.")
      return
    }

    const discipline = selectedDiscipline
    if (!discipline) {
      toast.error("No hay disciplina configurada.")
      return
    }

    const categories = Array.isArray(discipline.categories) ? discipline.categories : []
    if (!categories.length) {
      toast.error("La disciplina seleccionada no tiene categorias configuradas.")
      return
    }

    const runId = Date.now()
    analysisRunRef.current = runId
    dbLoadRunRef.current += 1

    setIsAnalyzingDiscipline(true)
    setAnalysisProgress({ completed: 0, total: categories.length })
    setActiveCategoryId(categories[0].id)

    setAnalysisByDiscipline((prev) => {
      const previousDiscipline = prev[discipline.id] || {}
      const previousCategories = previousDiscipline.categories || {}
      const nextCategories = { ...previousCategories }

      categories.forEach((category) => {
        nextCategories[category.id] = {
          ...(nextCategories[category.id] || {}),
          status: "loading",
          error: "",
          rows: [],
          summary: null,
          categoryId: category.id,
          categoryName: category.name,
          categoryQuery: category.query,
          modelId: selectedModelId,
        }
      })

      return {
        ...prev,
        [discipline.id]: {
          ...previousDiscipline,
          disciplineId: discipline.id,
          disciplineName: discipline.name,
          modelId: selectedModelId,
          lastRunAt: new Date().toISOString(),
          categories: nextCategories,
        },
      }
    })

    const categoryDraft = []
    const persistenceErrors = []

    try {
      for (let index = 0; index < categories.length; index += 1) {
        const category = categories[index]
        if (analysisRunRef.current !== runId) return

        try {
          const data = await fetchCategoryParameters({
            modelId: selectedModelId,
            categoryQuery: category.query,
          })

          if (analysisRunRef.current !== runId) return

          setAnalysisByDiscipline((prev) => {
            const previousDiscipline = prev[discipline.id] || {}
            const previousCategories = previousDiscipline.categories || {}

            return {
              ...prev,
              [discipline.id]: {
                ...previousDiscipline,
                disciplineId: discipline.id,
                disciplineName: discipline.name,
                modelId: selectedModelId,
                lastRunAt: new Date().toISOString(),
                categories: {
                  ...previousCategories,
                  [category.id]: {
                    status: "success",
                    error: "",
                    rows: data.rows,
                    summary: data.summary,
                    categoryId: category.id,
                    categoryName: category.name,
                    categoryQuery: category.query,
                    modelId: selectedModelId,
                  },
                },
              },
            }
          })

          try {
            await saveCategoryCheck({
              modelId: selectedModelId,
              disciplineId: discipline.id,
              categoryId: category.id,
              rows: data.rows,
            })
          } catch (saveErr) {
            persistenceErrors.push({
              categoryName: category.name,
              message: saveErr?.message || "No se pudo guardar en DB.",
            })
          }

          categoryDraft.push({
            categoryId: category.id,
            categoryName: category.name,
            categoryQuery: category.query,
            status: "success",
            totalElements: Number(data.summary?.totalElements) || data.rows.length,
            fullyCompliant: Number(data.summary?.fullyCompliant) || 0,
            compliancePct: Number(data.summary?.averageCompliancePct) || 0,
            error: "",
          })
        } catch (err) {
          const message = err?.message || "Error obteniendo parametros."

          setAnalysisByDiscipline((prev) => {
            const previousDiscipline = prev[discipline.id] || {}
            const previousCategories = previousDiscipline.categories || {}

            return {
              ...prev,
              [discipline.id]: {
                ...previousDiscipline,
                disciplineId: discipline.id,
                disciplineName: discipline.name,
                modelId: selectedModelId,
                lastRunAt: new Date().toISOString(),
                categories: {
                  ...previousCategories,
                  [category.id]: {
                    status: "error",
                    error: message,
                    rows: [],
                    summary: {
                      totalElements: 0,
                      averageCompliancePct: 0,
                      fullyCompliant: 0,
                    },
                    categoryId: category.id,
                    categoryName: category.name,
                    categoryQuery: category.query,
                    modelId: selectedModelId,
                  },
                },
              },
            }
          })

          categoryDraft.push({
            categoryId: category.id,
            categoryName: category.name,
            categoryQuery: category.query,
            status: "error",
            totalElements: 0,
            fullyCompliant: 0,
            compliancePct: 0,
            error: message,
          })
        } finally {
          setAnalysisProgress({ completed: index + 1, total: categories.length })
        }

        if (index < categories.length - 1) {
          await sleep(CATEGORY_REQUEST_DELAY_MS)
        }
      }

      if (analysisRunRef.current !== runId) return

      const okCategories = categoryDraft.filter((entry) => entry.status === "success").length
      if (okCategories === categories.length && persistenceErrors.length === 0) {
        toast.success(`Analisis completado para ${discipline.name} (${okCategories}/${categories.length}).`)
      } else {
        const persistInfo =
          persistenceErrors.length > 0 ? ` Guardado DB con errores en ${persistenceErrors.length} categorias.` : ""
        toast.warning(`Analisis completado con incidencias para ${discipline.name} (${okCategories}/${categories.length}).${persistInfo}`)
      }
    } finally {
      if (analysisRunRef.current === runId) {
        setIsAnalyzingDiscipline(false)
        fetchProjectComplianceSummary().catch(() => {})
      }
    }
  }, [
    selectedModelId,
    selectedDiscipline,
    fetchCategoryParameters,
    saveCategoryCheck,
    fetchProjectComplianceSummary,
  ])

  const openModelDialog = async () => {
    setIsModelDialogOpen(true)
    try {
      await ensureModelsLoaded()
    } catch (err) {
      toast.error(err?.message || "No se pudo cargar la lista de modelos.")
    }
  }

  const handleIsolateTableDbIds = async () => {
    if (!activeCategoryRows.length) {
      toast.warning("No hay elementos en la categoria activa para aislar.")
      return
    }

    setIsResolvingIsolation(true)
    const tId = toast.loading("Resolviendo dbIds del viewer...")
    try {
      const resolution = await resolveViewerDbIdsForRows(activeCategoryRows)
      if (!resolution.dbIds.length) {
        throw new Error("No se pudieron resolver dbIds del viewer para esta categoria.")
      }

      const isolated = isolateViewerDbIds(resolution.dbIds)
      toast.success(`Aislando ${isolated.length} elementos del modelo.`, { id: tId })

      if (resolution.matchedFromIndexRows > 0 || resolution.unmatchedRows > 0) {
        toast.info(
          `Match por Revit Element ID: ${resolution.matchedFromIndexRows} | Sin match: ${resolution.unmatchedRows}`
        )
      }
    } catch (err) {
      toast.error(err?.message || "No se pudo aislar los dbId en el viewer.", { id: tId })
    } finally {
      setIsResolvingIsolation(false)
    }
  }

  const handleClearIsolation = () => {
    try {
      clearViewerIsolation()
      toast.success("Aislamiento limpiado.")
    } catch (err) {
      toast.error(err?.message || "No se pudo limpiar el aislamiento.")
    }
  }

  useEffect(() => {
    const bootstrap = async () => {
      if (!projectId) return
      if (bootstrappedProjectRef.current === projectId) return
      bootstrappedProjectRef.current = projectId

      try {
        await ensureModelsLoaded()

        const persistedModelId =
          typeof window !== "undefined" ? window.sessionStorage.getItem(selectionStorageKey) : null

        if (persistedModelId) setSelectedModelId(persistedModelId)
      } catch (err) {
        toast.error(err?.message || "No se pudo cargar la lista de modelos.")
      }
    }

    bootstrap()
  }, [projectId, ensureModelsLoaded, selectionStorageKey])

  useEffect(() => {
    fetchProjectComplianceSummary().catch((err) => {
      toast.error(err?.message || "No se pudo cargar el resumen de compliance del proyecto.")
    })
  }, [fetchProjectComplianceSummary])

  useEffect(() => {
    if (!selectedModelId) {
      setSelectedDisciplineId(DEFAULT_DISCIPLINE_ID)
      setIsResolvingLastDiscipline(false)
      return
    }

    let cancelled = false
    setIsResolvingLastDiscipline(true)

    fetchLatestDisciplineForModel(selectedModelId)
      .then((json) => {
        if (cancelled) return
        const lastDisciplineId = String(json?.data?.disciplineId || "")
        const nextDisciplineId = getDisciplineById(lastDisciplineId)
          ? lastDisciplineId
          : DEFAULT_DISCIPLINE_ID
        setSelectedDisciplineId(nextDisciplineId)
      })
      .catch(() => {
        if (!cancelled) setSelectedDisciplineId(DEFAULT_DISCIPLINE_ID)
      })
      .finally(() => {
        if (!cancelled) setIsResolvingLastDiscipline(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedModelId, fetchLatestDisciplineForModel])

  useEffect(() => {
    const firstCategoryId = selectedDiscipline?.categories?.[0]?.id || ""
    setActiveCategoryId((prev) => {
      if (!selectedDiscipline?.categories?.length) return ""
      if (selectedDiscipline.categories.some((category) => category.id === prev)) return prev
      return firstCategoryId
    })
  }, [selectedDiscipline])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!selectedModelId) return
    window.sessionStorage.setItem(selectionStorageKey, String(selectedModelId))
  }, [selectedModelId, selectionStorageKey])

  useEffect(() => {
    if (!selectedModel) {
      setSelectedUrn("")
      return
    }

    const nextUrn = getModelUrn(selectedModel)
    setSelectedUrn(nextUrn)

    if (!nextUrn || !hasViewerVersionUrn(nextUrn)) {
      toast.warning("El modelo no trae fileVersionUrn valido (fs.file:vf...?...version=).")
    }
  }, [selectedModel])

  useEffect(() => {
    if (!selectedUrn) return

    let cancelled = false
    setLoadingViewer(true)

    simpleViewer(selectedUrn, VIEWER_CONTAINER_ID)
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || "No se pudo iniciar el viewer.")
      })
      .finally(() => {
        if (!cancelled) setLoadingViewer(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedUrn])

  useEffect(() => {
    return () => {
      analysisRunRef.current += 1
      dbLoadRunRef.current += 1
      teardownSimpleViewer()
    }
  }, [])

  useEffect(() => {
    analysisRunRef.current += 1
    dbLoadRunRef.current += 1
    setAnalysisByDiscipline({})
    setAnalysisProgress({ completed: 0, total: 0 })
    setIsAnalyzingDiscipline(false)
    setIsLoadingHistory(false)
  }, [selectedModelId])

  useEffect(() => {
    if (!selectedModelId) return
    if (!selectedDiscipline) return
    if (isResolvingLastDiscipline) return
    hydrateDisciplineFromDb({ modelId: selectedModelId, discipline: selectedDiscipline })
  }, [selectedModelId, selectedDiscipline, hydrateDisciplineFromDb, isResolvingLastDiscipline])

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-[1800px] space-y-6 p-6">
        <div className="border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Model Parameter Checker</h1>
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                V.01
              </Badge>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={viewMode === "checker" ? "default" : "outline"}
              onClick={() => setViewMode("checker")}
            >
              Checker
            </Button>
            <Button
              size="sm"
              variant={viewMode === "project-compliance" ? "default" : "outline"}
              onClick={() => setViewMode("project-compliance")}
            >
              Project Parameter Compliance
            </Button>
          </div>

          {viewMode === "checker" ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Global Analizado</p>
                  <p className="text-2xl font-bold text-foreground">{globalKpis.totalElements}</p>
                </div>
                <div className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Compliance Global Ponderado</p>
                  <p className="text-2xl font-bold text-foreground">{globalKpis.avgCompliance}%</p>
                </div>
                <div className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Elementos Completos Globales</p>
                  <p className="text-2xl font-bold text-foreground">{globalKpis.fullyCompliant}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {isAnalyzingDiscipline ? (
                    <Badge variant="secondary" className="text-xs">
                      Progreso: {analysisProgress.completed}/{analysisProgress.total}
                    </Badge>
                  ) : null}
                  {isLoadingHistory ? (
                    <Badge variant="secondary" className="text-xs">
                      Cargando historial desde DB...
                    </Badge>
                  ) : null}
                  {isResolvingLastDiscipline ? (
                    <Badge variant="secondary" className="text-xs">
                      Resolviendo ultima disciplina analizada...
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" className="gap-2" onClick={openModelDialog}>
                    <Boxes className="h-4 w-4" />
                    Seleccionar Modelo
                  </Button>

                  <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
                    <span className="font-medium text-muted-foreground">Disciplina</span>
                    <select
                      className="min-w-[220px] bg-transparent text-sm outline-none"
                      value={selectedDiscipline?.id || ""}
                      onChange={(event) => setSelectedDisciplineId(event.target.value)}
                      disabled={isAnalyzingDiscipline || isLoadingHistory || isResolvingLastDiscipline}
                    >
                      {PARAMETER_CHECKER_DISCIPLINES.map((discipline) => (
                        <option key={discipline.id} value={discipline.id}>
                          {discipline.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <Button
                    className="gap-2 bg-[rgb(170,32,47)] text-white hover:bg-[rgb(150,28,42)]"
                    onClick={runDisciplineAnalysis}
                    disabled={!selectedModelId || isAnalyzingDiscipline || isLoadingHistory || isResolvingLastDiscipline}
                  >
                    <Play className="h-4 w-4" />
                    {isAnalyzingDiscipline
                      ? "Analizando"
                      : isLoadingHistory || isResolvingLastDiscipline
                        ? "Cargando"
                        : "Analizar disciplina"}
                  </Button>

                  <Button
                    variant="secondary"
                    className="gap-2"
                    onClick={handleIsolateTableDbIds}
                    disabled={!selectedUrn || loadingViewer || isResolvingIsolation || !activeCategoryRows.length}
                  >
                    <Target className="h-4 w-4" />
                    {isResolvingIsolation ? "Resolviendo dbIds..." : "Aislar dbIds"}
                  </Button>

                  <Button
                    variant="ghost"
                    className="gap-2"
                    onClick={handleClearIsolation}
                    disabled={!selectedUrn || loadingViewer || isResolvingIsolation}
                  >
                    <Eraser className="h-4 w-4" />
                    Limpiar aislamiento
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_2fr]">
                <div className="min-w-0 self-start flex h-[600px] max-h-[600px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Viewer</h2>
                      <p className="text-xs text-muted-foreground">
                        {selectedModel?.name || "Selecciona un modelo para visualizar"}
                      </p>
                    </div>
                  </div>

                  <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-100">
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
                    <div id={VIEWER_CONTAINER_ID} className="absolute inset-0 h-full w-full min-h-full" />
                  </div>
                </div>

                <div className="min-w-0">
                  <ParameterComplianceTable
                    discipline={selectedDiscipline}
                    categoryResults={disciplineResults}
                    activeCategoryId={effectiveActiveCategoryId}
                    onActiveCategoryChange={setActiveCategoryId}
                  />
                </div>
              </div>
            </>
          ) : (
            <ProjectParameterComplianceTable
              rows={projectComplianceSummary.rows}
              grandTotal={projectComplianceSummary.grandTotal}
              loading={loadingProjectCompliance}
              resolveModelName={resolveModelName}
              resolveDisciplineName={resolveDisciplineName}
              onRefresh={() => {
                fetchProjectComplianceSummary().catch((err) => {
                  toast.error(err?.message || "No se pudo actualizar el resumen de compliance.")
                })
              }}
            />
          )}
        </div>
      </div>

      <SelectModelsModal
        models={models}
        open={isModelDialogOpen}
        loading={loadingModels}
        initialSelectedIds={selectedModelId ? [selectedModelId] : []}
        onClose={() => setIsModelDialogOpen(false)}
        onSave={async (ids) => {
          try {
            if (!Array.isArray(ids) || ids.length === 0) return

            const nextSelected = ids[0]
            if (ids.length > 1) {
              toast.warning("Solo se usara el primer modelo seleccionado para el checker.")
            }

            setSelectedModelId(nextSelected)
            setIsModelDialogOpen(false)
          } catch (err) {
            toast.error(err?.message || "Error guardando seleccion de modelo.")
          }
        }}
      />
    </AppLayout>
  )
}
