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

const toPositiveInt = (value) => {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) return null
    return value
  }

  const normalized = String(value || "").trim()
  if (!/^\d+$/.test(normalized)) return null

  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null
  return parsed
}

const getRawPropertyValue = (row, names = []) => {
  const wanted = names.map((name) => String(name || "").trim().toLowerCase())
  const props = Array.isArray(row?.rawProperties) ? row.rawProperties : []
  const match = props.find((prop) => wanted.includes(String(prop?.name || "").trim().toLowerCase()))
  return match?.value
}

const getRowViewerDbId = (row) => {
  const candidates = [row?.viewerDbId, getRawPropertyValue(row, ["DbId", "dbId", "Db Id"])]

  for (const candidate of candidates) {
    const parsed = toPositiveInt(candidate)
    if (parsed) return parsed
  }

  return null
}

const buildPersistenceDraft = ({
  projectId,
  modelId,
  modelName,
  discipline,
  categoryResults,
}) => {
  const categories = categoryResults.map((result) => ({
    categoryId: result.categoryId,
    categoryName: result.categoryName,
    categoryQuery: result.categoryQuery,
    status: result.status,
    totalElements: result.totalElements,
    fullyCompliant: result.fullyCompliant,
    compliancePct: result.compliancePct,
    error: result.error || null,
  }))

  return {
    projectId,
    modelId,
    modelName,
    disciplineId: discipline?.id || "",
    disciplineName: discipline?.name || "",
    analyzedAt: new Date().toISOString(),
    categories,
  }
}

export default function AECModelParameterCheckerPage() {
  const { projectId } = useParams()

  const bootstrappedProjectRef = useRef("")
  const analysisRunRef = useRef(0)
  const autoAnalyzePendingRef = useRef(false)

  const selectionStorageKey = `parameter_checker_selected_model_${projectId || "unknown"}`
  const draftStorageKey = `parameter_checker_analysis_draft_${projectId || "unknown"}`

  const [models, setModels] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false)

  const [selectedModelId, setSelectedModelId] = useState(null)
  const [selectedUrn, setSelectedUrn] = useState("")

  const [selectedDisciplineId, setSelectedDisciplineId] = useState(DEFAULT_DISCIPLINE_ID)
  const [activeCategoryId, setActiveCategoryId] = useState("")

  const [analysisByDiscipline, setAnalysisByDiscipline] = useState({})
  const [analysisDraft, setAnalysisDraft] = useState(null)
  const [isAnalyzingDiscipline, setIsAnalyzingDiscipline] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState({ completed: 0, total: 0 })
  const [isResolvingIsolation, setIsResolvingIsolation] = useState(false)

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

  const selectedModel = useMemo(
    () => models.find((model) => String(model.id) === String(selectedModelId)) || null,
    [models, selectedModelId]
  )

  const selectedDiscipline = useMemo(() => {
    const fromId = getDisciplineById(selectedDisciplineId)
    return fromId || PARAMETER_CHECKER_DISCIPLINES[0] || null
  }, [selectedDisciplineId])

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

  const rowsWithoutDirectDbId = useMemo(() => {
    let count = 0
    activeCategoryRows.forEach((row) => {
      if (!getRowViewerDbId(row)) count += 1
    })
    return count
  }, [activeCategoryRows])

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
  }, [apiBase, pId, projectId, models.length])

  const fetchCategoryParameters = useCallback(
    async ({ modelId, categoryQuery }) => {
      const endpoint =
        `${apiBase}/aec/${pId}/graphql-model-parameters` +
        `?modelId=${encodeURIComponent(modelId)}` +
        `&category=${encodeURIComponent(categoryQuery)}`

      const res = await fetch(endpoint, { credentials: "include" })
     
      const json = await safeJson(res)
      console.log("Response", json)
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

      const draft = buildPersistenceDraft({
        projectId,
        modelId: selectedModelId,
        modelName: selectedModel?.name || "",
        discipline,
        categoryResults: categoryDraft,
      })

      setAnalysisDraft(draft)

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(draftStorageKey, JSON.stringify(draft))
      }

      const okCategories = categoryDraft.filter((entry) => entry.status === "success").length
      if (okCategories === categories.length) {
        toast.success(`Analisis completado para ${discipline.name} (${okCategories}/${categories.length}).`)
      } else {
        toast.warning(
          `Analisis completado con incidencias para ${discipline.name} (${okCategories}/${categories.length}).`
        )
      }
    } finally {
      if (analysisRunRef.current === runId) {
        setIsAnalyzingDiscipline(false)
      }
    }
  }, [
    selectedModelId,
    selectedModel,
    selectedDiscipline,
    fetchCategoryParameters,
    projectId,
    draftStorageKey,
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
        const persistedDraft =
          typeof window !== "undefined" ? window.sessionStorage.getItem(draftStorageKey) : null

        if (persistedModelId) setSelectedModelId(persistedModelId)
        if (persistedDraft) {
          try {
            setAnalysisDraft(JSON.parse(persistedDraft))
          } catch {
            setAnalysisDraft(null)
          }
        }
      } catch (err) {
        toast.error(err?.message || "No se pudo cargar la lista de modelos.")
      }
    }

    bootstrap()
  }, [projectId, ensureModelsLoaded, selectionStorageKey, draftStorageKey])

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
      teardownSimpleViewer()
    }
  }, [])

  useEffect(() => {
    analysisRunRef.current += 1
    setAnalysisByDiscipline({})
    setAnalysisDraft(null)
    setAnalysisProgress({ completed: 0, total: 0 })
    setIsAnalyzingDiscipline(false)
  }, [selectedModelId])

  useEffect(() => {
    if (!selectedModelId) return
    if (!autoAnalyzePendingRef.current) return

    autoAnalyzePendingRef.current = false
    runDisciplineAnalysis()
  }, [selectedModelId, runDisciplineAnalysis])

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-[1800px] space-y-6 p-6">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-6 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">AEC Model Parameter Checker</h1>
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                Aislado
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Analisis por disciplina y categoria, listo para persistir modelId, disciplina, categorias y resultados.
            </p>
            {analysisDraft ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Draft listo para DB: {analysisDraft.modelName || analysisDraft.modelId} | {analysisDraft.disciplineName} |
                categorias {analysisDraft.categories?.length || 0}
              </p>
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
                disabled={isAnalyzingDiscipline}
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
              disabled={!selectedModelId || isAnalyzingDiscipline}
            >
              <Play className="h-4 w-4" />
              {isAnalyzingDiscipline ? "Analizando" : "Analizar disciplina"}
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

        <div className="space-y-6">
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

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Disciplinas analizadas: {globalKpis.analyzedDisciplines}/{PARAMETER_CHECKER_DISCIPLINES.length}
            </Badge>
            {isAnalyzingDiscipline ? (
              <Badge variant="secondary" className="text-xs">
                Progreso: {analysisProgress.completed}/{analysisProgress.total}
              </Badge>
            ) : null}
            {rowsWithoutDirectDbId > 0 ? (
              <Badge variant="secondary" className="text-xs">
                Sin dbId directo (match por Element ID): {rowsWithoutDirectDbId}
              </Badge>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_2fr]">
            <div className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Viewer</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedModel?.name || "Selecciona un modelo para visualizar"}
                  </p>
                </div>
                {selectedUrn ? (
                  <Badge variant="secondary" className="max-w-[320px] truncate">
                    URN lista
                  </Badge>
                ) : null}
              </div>

              <div className="relative h-[620px] bg-slate-100">
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

            <div className="min-w-0">
              <ParameterComplianceTable
                discipline={selectedDiscipline}
                categoryResults={disciplineResults}
                activeCategoryId={effectiveActiveCategoryId}
                onActiveCategoryChange={setActiveCategoryId}
              />
            </div>
          </div>
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

            autoAnalyzePendingRef.current = true
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
