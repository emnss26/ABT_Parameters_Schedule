import React, { useMemo } from "react"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Download, FileText } from "lucide-react"

const REQUIRED_FIELDS = [
  { key: "revitElementId", aliases: ["Revit Element ID", "Element Id", "ElementId", "Id"] },
  { key: "category", aliases: ["Revit Category Type Id", "Category", "Category Name"] },
  { key: "familyName", aliases: ["Family Name", "Family"] },
  { key: "elementName", aliases: ["Element Name", "Name"] },
  { key: "typeMark", aliases: ["Type Mark", "Mark"] },
  { key: "description", aliases: ["Description", "Type Description"] },
  { key: "model", aliases: ["Model", "Model Number", "Modelo"] },
  { key: "manufacturer", aliases: ["Manufacturer", "Fabricante"] },
  { key: "assemblyCode", aliases: ["Assembly Code", "OmniClass Number"] },
  { key: "assemblyDescription", aliases: ["Assembly Description", "OmniClass Title"] },
]

const hasValue = (value) => String(value || "").trim() !== ""
const normalize = (value) => String(value || "").trim().toLowerCase()
const normalizeKey = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const compactKey = (value) => normalizeKey(value).replace(/\s+/g, "")
const safeText = (value) => (hasValue(value) ? String(value) : "-")

const pickRawPropertyValue = (row, aliases = []) => {
  const wanted = aliases.map(normalizeKey).filter(Boolean)
  const wantedCompact = wanted.map(compactKey).filter(Boolean)
  const props = Array.isArray(row?.rawProperties) ? row.rawProperties : []

  const exactMatch = props.find((prop) => {
    const label = normalizeKey(prop?.name)
    if (!label) return false
    const compact = compactKey(prop?.name)
    return wanted.includes(label) || wantedCompact.includes(compact)
  })
  if (exactMatch) return exactMatch?.value ?? ""

  const partialMatch = props.find((prop) => {
    const label = normalizeKey(prop?.name)
    if (!label) return false
    const compact = compactKey(prop?.name)
    return wanted.some((alias, idx) => {
      const aliasCompact = wantedCompact[idx]
      return (
        label.includes(alias) ||
        alias.includes(label) ||
        compact.includes(aliasCompact) ||
        aliasCompact.includes(compact)
      )
    })
  })

  return partialMatch?.value ?? ""
}

const resolveField = (row, key, aliases = []) => {
  const direct = row?.[key]
  if (hasValue(direct)) return direct
  const fromRaw = pickRawPropertyValue(row, aliases)
  if (hasValue(fromRaw)) return fromRaw
  return direct ?? ""
}

const getCompliancePct = (row) => {
  const filled = REQUIRED_FIELDS.filter(({ key, aliases }) => hasValue(resolveField(row, key, aliases))).length
  return Math.round((filled / REQUIRED_FIELDS.length) * 100)
}

const getMetricSummary = (rows = [], summary = null) => {
  if (summary) {
    return {
      totalElements: Number(summary.totalElements) || 0,
      averageCompliancePct: Number(summary.averageCompliancePct) || 0,
      fullyCompliant: Number(summary.fullyCompliant) || 0,
    }
  }

  const totalElements = rows.length
  if (!totalElements) {
    return { totalElements: 0, averageCompliancePct: 0, fullyCompliant: 0 }
  }

  const averageCompliancePct = Math.round(
    rows.reduce((acc, row) => acc + getCompliancePct(row), 0) / totalElements
  )
  const fullyCompliant = rows.filter((row) => getCompliancePct(row) === 100).length

  return { totalElements, averageCompliancePct, fullyCompliant }
}

const ComplianceBadge = ({ pct }) => {
  const safePct = Number.isFinite(Number(pct)) ? Number(pct) : 0
  if (safePct >= 100) return <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">100%</Badge>
  if (safePct >= 70) return <Badge className="bg-amber-500 text-white hover:bg-amber-600">{safePct}%</Badge>
  return <Badge variant="destructive">{safePct}%</Badge>
}

const statusLabel = (status) => {
  if (status === "loading") return "Analizando"
  if (status === "success") return "Listo"
  if (status === "error") return "Error"
  return "Pendiente"
}

const mapRowToExport = (row = {}) => {
  const dbId = resolveField(row, "dbId", ["DbId", "dbId", "Db Id"])
  const revitElementId = resolveField(row, "revitElementId", ["Revit Element ID", "Element Id", "ElementId", "Id"])
  const category = resolveField(row, "category", ["Revit Category Type Id", "Category", "Category Name"])
  const familyName = resolveField(row, "familyName", ["Family Name", "Family"])
  const elementName = resolveField(row, "elementName", ["Element Name", "Name"])
  const typeMark = resolveField(row, "typeMark", ["Type Mark", "Mark"])
  const description = resolveField(row, "description", ["Description", "Type Description"])
  const model = resolveField(row, "model", ["Model", "Model Number", "Modelo"])
  const manufacturer = resolveField(row, "manufacturer", ["Manufacturer", "Fabricante"])
  const assemblyCode = resolveField(row, "assemblyCode", ["Assembly Code", "OmniClass Number"])
  const assemblyDescription = resolveField(row, "assemblyDescription", ["Assembly Description", "OmniClass Title"])
  const compliance = getCompliancePct(row)

  return {
    "dbId (raw)": safeText(dbId),
    "Revit Element ID": safeText(revitElementId),
    Category: safeText(category),
    "Family Name": safeText(familyName),
    "Element Name": safeText(elementName),
    "Type Mark": safeText(typeMark),
    Description: safeText(description),
    Model: safeText(model),
    Manufacturer: safeText(manufacturer),
    "Assembly Code": safeText(assemblyCode),
    "Assembly Description": safeText(assemblyDescription),
    Count: safeText(row.count),
    "Compliance %": compliance,
  }
}

export default function ParameterComplianceTable({
  discipline = null,
  categoryResults = {},
  activeCategoryId = "",
  onActiveCategoryChange = () => {},
}) {
  const categories = Array.isArray(discipline?.categories) ? discipline.categories : []
  const firstCategoryId = categories[0]?.id || ""
  const effectiveCategoryId = activeCategoryId || firstCategoryId

  const activeCategory = categories.find((category) => category.id === effectiveCategoryId) || null
  const activeResult = useMemo(
    () => categoryResults?.[effectiveCategoryId] || null,
    [categoryResults, effectiveCategoryId]
  )
  const activeRows = useMemo(
    () => (Array.isArray(activeResult?.rows) ? activeResult.rows : []),
    [activeResult]
  )
  const activeStatus = activeResult?.status || "idle"
  const activeError = activeResult?.error || ""

  const metrics = useMemo(
    () => getMetricSummary(activeRows, activeResult?.summary || null),
    [activeRows, activeResult?.summary]
  )

  const exportRows = useMemo(() => activeRows.map((row) => mapRowToExport(row)), [activeRows])

  const handleExportExcel = () => {
    if (!exportRows.length) return
    const wb = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(exportRows)
    XLSX.utils.book_append_sheet(wb, sheet, "Compliance")
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")
    XLSX.writeFile(wb, `Parameter_Check_${effectiveCategoryId || "Category"}_${stamp}.xlsx`)
  }

  const handleExportPdf = () => {
    if (!exportRows.length) return
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
    doc.setFontSize(12)
    doc.text(`Parameter Checker - ${activeCategory?.name || "Categoria"}`, 40, 30)
    autoTable(doc, {
      startY: 40,
      styles: { fontSize: 7, cellPadding: 3 },
      head: [Object.keys(exportRows[0])],
      body: exportRows.map((row) => Object.values(row)),
    })
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")
    doc.save(`Parameter_Check_${effectiveCategoryId || "Category"}_${stamp}.pdf`)
  }

  return (
    <div className="flex h-[600px] max-h-[600px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            {discipline?.name || "Parameter Compliance"}
          </h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcel} disabled={!exportRows.length}>
              <Download className="h-4 w-4" /> Excel
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdf} disabled={!exportRows.length}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="border-b border-border px-4 py-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => {
            const categoryStatus = categoryResults?.[category.id]?.status || "idle"
            const categoryTotal = Number(categoryResults?.[category.id]?.summary?.totalElements) || 0
            const isActive = category.id === effectiveCategoryId
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => onActiveCategoryChange(category.id)}
                className={[
                  "inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-xs transition-colors",
                  isActive
                    ? "border-[rgb(170,32,47)] bg-[rgb(170,32,47)]/10 text-[rgb(170,32,47)]"
                    : "border-border bg-background hover:bg-muted/40",
                ].join(" ")}
              >
                <span>{category.name}</span>
                <Badge variant={isActive ? "default" : "secondary"} className="h-5 text-[10px]">
                  {categoryTotal}
                </Badge>
                <span className="text-[10px] text-muted-foreground">{statusLabel(categoryStatus)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-border px-4 py-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total items analizados</p>
          <p className="text-xl font-bold text-foreground">{metrics.totalElements}</p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Nivel de compliance</p>
          <p className="text-xl font-bold text-foreground">{metrics.averageCompliancePct}%</p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Elementos con todos los parametros
          </p>
          <p className="text-xl font-bold text-foreground">{metrics.fullyCompliant}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-2">
        <Table className="min-w-[1750px] text-xs">
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[120px]">dbId (raw)</TableHead>
              <TableHead className="w-[130px]">Revit Element ID</TableHead>
              <TableHead className="min-w-[120px]">Category</TableHead>
              <TableHead className="min-w-[140px]">Family Name</TableHead>
              <TableHead className="min-w-[180px]">Element Name</TableHead>
              <TableHead className="min-w-[130px]">Type Mark</TableHead>
              <TableHead className="min-w-[180px]">Description</TableHead>
              <TableHead className="min-w-[130px]">Model</TableHead>
              <TableHead className="min-w-[130px]">Manufacturer</TableHead>
              <TableHead className="min-w-[130px]">Assembly Code</TableHead>
              <TableHead className="min-w-[170px]">Assembly Description</TableHead>
              <TableHead className="w-[80px] text-center">Count</TableHead>
              <TableHead className="w-[120px] text-center">Compliance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeStatus === "loading" ? (
              <TableRow>
                <TableCell colSpan={13} className="h-20 text-center text-muted-foreground">
                  Analizando categoria {activeCategory?.name || "..."}...
                </TableCell>
              </TableRow>
            ) : activeStatus === "error" ? (
              <TableRow>
                <TableCell colSpan={13} className="h-20 text-center text-red-600">
                  {activeError || "Error analizando la categoria seleccionada."}
                </TableCell>
              </TableRow>
            ) : activeRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="h-20 text-center text-muted-foreground">
                  No hay resultados para la categoria seleccionada.
                </TableCell>
              </TableRow>
            ) : (
              activeRows.map((row, idx) => {
                const dbId = resolveField(row, "dbId", ["DbId", "dbId", "Db Id"])
                const revitElementId = resolveField(row, "revitElementId", [
                  "Revit Element ID",
                  "Element Id",
                  "ElementId",
                  "Id",
                ])
                const category = resolveField(row, "category", [
                  "Revit Category Type Id",
                  "Category",
                  "Category Name",
                ])
                const familyName = resolveField(row, "familyName", ["Family Name", "Family"])
                const elementName = resolveField(row, "elementName", ["Element Name", "Name"])
                const typeMark = resolveField(row, "typeMark", ["Type Mark", "Mark"])
                const description = resolveField(row, "description", ["Description", "Type Description"])
                const model = resolveField(row, "model", ["Model", "Model Number", "Modelo"])
                const manufacturer = resolveField(row, "manufacturer", ["Manufacturer", "Fabricante"])
                const assemblyCode = resolveField(row, "assemblyCode", ["Assembly Code", "OmniClass Number"])
                const assemblyDescription = resolveField(row, "assemblyDescription", [
                  "Assembly Description",
                  "OmniClass Title",
                ])
                const compliance = getCompliancePct(row)

                return (
                  <TableRow
                    key={`${dbId || revitElementId || row.elementId || idx}`}
                    className="hover:bg-muted/30"
                  >
                    <TableCell className={!hasValue(dbId) ? "text-red-500 font-mono" : "font-mono"}>
                      {safeText(dbId)}
                    </TableCell>
                    <TableCell className={!hasValue(revitElementId) ? "text-red-500 font-mono" : "font-mono"}>
                      {safeText(revitElementId)}
                    </TableCell>
                    <TableCell className={!hasValue(category) ? "text-red-500" : ""}>{safeText(category)}</TableCell>
                    <TableCell className={!hasValue(familyName) ? "text-red-500" : ""}>{safeText(familyName)}</TableCell>
                    <TableCell className={!hasValue(elementName) ? "text-red-500" : ""}>{safeText(elementName)}</TableCell>
                    <TableCell className={!hasValue(typeMark) ? "text-red-500" : ""}>{safeText(typeMark)}</TableCell>
                    <TableCell className={!hasValue(description) ? "text-red-500" : ""}>{safeText(description)}</TableCell>
                    <TableCell className={!hasValue(model) ? "text-red-500" : ""}>{safeText(model)}</TableCell>
                    <TableCell className={!hasValue(manufacturer) ? "text-red-500" : ""}>{safeText(manufacturer)}</TableCell>
                    <TableCell className={!hasValue(assemblyCode) ? "text-red-500" : ""}>{safeText(assemblyCode)}</TableCell>
                    <TableCell className={!hasValue(assemblyDescription) ? "text-red-500" : ""}>
                      {safeText(assemblyDescription)}
                    </TableCell>
                    <TableCell className="text-center">{safeText(row.count)}</TableCell>
                    <TableCell className="text-center">
                      <ComplianceBadge pct={compliance} />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
