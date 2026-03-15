import React, { useMemo } from "react"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Download, FileText, RefreshCw } from "lucide-react"

const toText = (value) => String(value ?? "").trim()
const toInt = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}
const formatDateTime = (value) => {
  const raw = toText(value)
  if (!raw) return "-"
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("es-MX")
}

export default function ProjectParameterComplianceTable({
  rows = [],
  grandTotal = null,
  loading = false,
  resolveModelName = (modelId) => modelId || "-",
  resolveDisciplineName = (disciplineId) => disciplineId || "-",
  onRefresh = () => {},
}) {
  const normalizedRows = useMemo(
    () =>
      (Array.isArray(rows) ? rows : []).map((row) => {
        const totalElements = toInt(row?.totalElements)
        const fullyCompliant = toInt(row?.fullyCompliant)
        const avg = toInt(row?.averageCompliancePct)
        return {
          modelId: toText(row?.modelId),
          modelName: toText(resolveModelName(row?.modelId)) || toText(row?.modelId) || "-",
          disciplineId: toText(row?.disciplineId),
          disciplineName:
            toText(resolveDisciplineName(row?.disciplineId)) || toText(row?.disciplineId) || "-",
          totalElements,
          fullyCompliant,
          averageCompliancePct: avg,
          lastCheckAt: toText(row?.lastCheckAt),
        }
      }),
    [rows, resolveDisciplineName, resolveModelName]
  )

  const computedGrandTotal = useMemo(() => {
    if (grandTotal && typeof grandTotal === "object") {
      return {
        totalElements: toInt(grandTotal.totalElements),
        fullyCompliant: toInt(grandTotal.fullyCompliant),
        averageCompliancePct: toInt(grandTotal.averageCompliancePct),
        analyzedModels: toInt(grandTotal.analyzedModels),
        analyzedDisciplines: toInt(grandTotal.analyzedDisciplines),
        updatedAt: toText(grandTotal.updatedAt),
      }
    }

    const totalElements = normalizedRows.reduce((acc, row) => acc + row.totalElements, 0)
    const fullyCompliant = normalizedRows.reduce((acc, row) => acc + row.fullyCompliant, 0)
    const weightedSum = normalizedRows.reduce(
      (acc, row) => acc + row.averageCompliancePct * row.totalElements,
      0
    )

    return {
      totalElements,
      fullyCompliant,
      averageCompliancePct: totalElements > 0 ? Math.round(weightedSum / totalElements) : 0,
      analyzedModels: new Set(normalizedRows.map((row) => row.modelId).filter(Boolean)).size,
      analyzedDisciplines: normalizedRows.length,
      updatedAt: "",
    }
  }, [grandTotal, normalizedRows])

  const exportRows = useMemo(
    () =>
      normalizedRows.map((row) => ({
        Modelo: row.modelName,
        Disciplina: row.disciplineName,
        "Total Analizado": row.totalElements,
        "Total Completo": row.fullyCompliant,
        "Cumplimiento %": row.averageCompliancePct,
        "Ultima revision": formatDateTime(row.lastCheckAt),
      })),
    [normalizedRows]
  )

  const handleExportExcel = () => {
    if (!exportRows.length) return
    const wb = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(exportRows)
    XLSX.utils.book_append_sheet(wb, sheet, "Cumplimiento_Proyecto")
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")
    XLSX.writeFile(wb, `Cumplimiento_Parametros_Proyecto_${stamp}.xlsx`)
  }

  const handleExportPdf = () => {
    if (!exportRows.length) return
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
    doc.setFontSize(12)
    doc.text("Cumplimiento del Proyecto", 40, 30)
    autoTable(doc, {
      startY: 40,
      styles: { fontSize: 8, cellPadding: 3 },
      head: [Object.keys(exportRows[0])],
      body: exportRows.map((row) => Object.values(row)),
    })
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")
    doc.save(`Cumplimiento_Parametros_Proyecto_${stamp}.pdf`)
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Cumplimiento del Proyecto</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={onRefresh} disabled={loading}>
            <RefreshCw className="h-4 w-4" /> {loading ? "Actualizando..." : "Actualizar"}
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcel} disabled={!exportRows.length}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdf} disabled={!exportRows.length}>
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-border px-4 py-3 md:grid-cols-5">
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Modelos</p>
          <p className="text-xl font-bold text-foreground">{computedGrandTotal.analyzedModels}</p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Modelo/Disciplina</p>
          <p className="text-xl font-bold text-foreground">{computedGrandTotal.analyzedDisciplines}</p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Analizado</p>
          <p className="text-xl font-bold text-foreground">{computedGrandTotal.totalElements}</p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Completo</p>
          <p className="text-xl font-bold text-foreground">{computedGrandTotal.fullyCompliant}</p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Promedio Global</p>
          <p className="text-xl font-bold text-foreground">{computedGrandTotal.averageCompliancePct}%</p>
        </div>
      </div>

      <div className="max-h-[600px] overflow-auto">
        <Table className="min-w-[980px] text-xs">
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="min-w-[220px]">Modelo</TableHead>
              <TableHead className="min-w-[220px]">Disciplina</TableHead>
              <TableHead className="w-[150px] text-right">Total Analizado</TableHead>
              <TableHead className="w-[150px] text-right">Total Completo</TableHead>
              <TableHead className="w-[140px] text-right">Cumplimiento %</TableHead>
              <TableHead className="min-w-[180px]">Ultima revision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                  Cargando resumen de cumplimiento...
                </TableCell>
              </TableRow>
            ) : !normalizedRows.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                  Aun no hay datos de cumplimiento guardados para este proyecto.
                </TableCell>
              </TableRow>
            ) : (
              normalizedRows.map((row) => (
                <TableRow key={`${row.modelId}-${row.disciplineId}`}>
                  <TableCell>{row.modelName}</TableCell>
                  <TableCell>{row.disciplineName}</TableCell>
                  <TableCell className="text-right font-mono">{row.totalElements}</TableCell>
                  <TableCell className="text-right font-mono">{row.fullyCompliant}</TableCell>
                  <TableCell className="text-right font-semibold">{row.averageCompliancePct}%</TableCell>
                  <TableCell>{formatDateTime(row.lastCheckAt)}</TableCell>
                </TableRow>
              ))
            )}
            {!loading && normalizedRows.length ? (
              <TableRow className="bg-muted/30">
                <TableCell className="font-semibold">TOTAL PROYECTO</TableCell>
                <TableCell className="text-muted-foreground">Promedio ponderado global</TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {computedGrandTotal.totalElements}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {computedGrandTotal.fullyCompliant}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {computedGrandTotal.averageCompliancePct}%
                </TableCell>
                <TableCell>{formatDateTime(computedGrandTotal.updatedAt)}</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
