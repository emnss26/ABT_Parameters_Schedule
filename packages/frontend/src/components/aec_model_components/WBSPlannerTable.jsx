import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileText, Plus, Save, Trash2 } from "lucide-react";

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

const formatIso = (iso) => {
  if (!iso) return "-";
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "-";
};

const formatMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
};

const getDerivedDurationDays = (startDate, endDate) => {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return "";

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs)) return "";

  return String(Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24))));
};

const getDurationLabel = (row) => {
  const derived = getDerivedDurationDays(row?.startDate, row?.endDate);
  if (derived !== "") return `${derived} d`;

  const fallback = toText(row?.duration);
  return fallback || "-";
};

const sortWbsRows = (rows = []) =>
  [...rows].sort((left, right) => {
    const byCode = compareWbsCodes(left?.code, right?.code);
    if (byCode !== 0) return byCode;
    return toText(left?.id).localeCompare(toText(right?.id));
  });

export default function WBSPlannerTable({
  rows = [],
  readOnly = false,
  saving = false,
  invalidRowsCount = 0,
  viewportClassName = "h-[680px]",
  onChangeField = () => {},
  onAddLevel1 = () => {},
  onAddChild = () => {},
  onDeleteRow = () => {},
  onSave = () => {},
  onExportExcel = () => {},
  onExportPdf = () => {},
}) {
  const sortedRows = useMemo(() => sortWbsRows(rows), [rows]);

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          Tabla WBS {readOnly ? "(solo lectura)" : "(editable)"}
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {!readOnly ? (
            <>
              <Button size="sm" variant="outline" className="gap-1" onClick={onAddLevel1}>
                <Plus className="h-4 w-4" /> Agregar N1
              </Button>
              <Button
                size="sm"
                className="gap-1"
                onClick={onSave}
                disabled={saving || !sortedRows.length || invalidRowsCount > 0}
              >
                <Save className="h-4 w-4" /> {saving ? "Guardando..." : "Guardar WBS"}
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="outline" className="gap-1" onClick={onExportExcel} disabled={!sortedRows.length}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={onExportPdf} disabled={!sortedRows.length}>
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {!readOnly ? (
        <div className="border-b border-border px-4 py-2 text-xs">
          {invalidRowsCount > 0 ? (
            <span className="text-destructive">
              Hay {invalidRowsCount} fila(s) con error (codigo duplicado/invalido o actividad vacia).
            </span>
          ) : (
            <span className="text-muted-foreground">
              Los codigos hijo se autogeneran al agregar una fila desde su padre.
            </span>
          )}
        </div>
      ) : null}

      <div className={`${viewportClassName} min-w-0 overflow-auto`}>
        <Table className="min-w-[1440px] text-xs">
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[90px]">Nivel</TableHead>
              <TableHead className="w-[160px]">C&oacute;digo</TableHead>
              <TableHead className="min-w-[280px]">Actividad</TableHead>
              <TableHead className="w-[130px]">Inicio Planeado</TableHead>
              <TableHead className="w-[130px]">Fin Planeado</TableHead>
              <TableHead className="w-[130px]">Inicio Real</TableHead>
              <TableHead className="w-[130px]">Fin Real</TableHead>
              <TableHead className="w-[130px]">Costo</TableHead>
              <TableHead className="w-[120px]">Duraci&oacute;n</TableHead>
              {!readOnly ? <TableHead className="w-[220px] text-right">Acciones</TableHead> : null}
            </TableRow>
          </TableHeader>

          <TableBody>
            {!sortedRows.length ? (
              <TableRow>
                <TableCell colSpan={readOnly ? 9 : 10} className="h-20 text-center text-muted-foreground">
                  Carga un archivo Excel con la WBS, importa Project WBS o agrega filas manualmente.
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => {
                const level = getWbsLevel(row.code) || Number(row.level) || 0;
                const canAddChild = !readOnly && level > 0 && level < 4;

                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-center">{level || "-"}</TableCell>

                    <TableCell className="font-mono">
                      {readOnly ? (
                        toText(row.code) || "-"
                      ) : (
                        <input
                          type="text"
                          value={toText(row.code)}
                          onChange={(event) => onChangeField(row.id, "code", event.target.value)}
                          placeholder="Ej: 1.2.3"
                          className="h-8 w-full rounded border border-input bg-background px-2 text-xs font-mono"
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      {readOnly ? (
                        toText(row.title) || "-"
                      ) : (
                        <input
                          type="text"
                          value={toText(row.title)}
                          onChange={(event) => onChangeField(row.id, "title", event.target.value)}
                          placeholder="Nombre de actividad"
                          className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      {readOnly ? (
                        formatIso(row.startDate)
                      ) : (
                        <input
                          type="date"
                          value={isIsoDate(row.startDate) ? row.startDate : ""}
                          onChange={(event) => onChangeField(row.id, "startDate", event.target.value)}
                          className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      {readOnly ? (
                        formatIso(row.endDate)
                      ) : (
                        <input
                          type="date"
                          value={isIsoDate(row.endDate) ? row.endDate : ""}
                          onChange={(event) => onChangeField(row.id, "endDate", event.target.value)}
                          className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      {readOnly ? (
                        formatIso(row.actualStartDate)
                      ) : (
                        <input
                          type="date"
                          value={isIsoDate(row.actualStartDate) ? row.actualStartDate : ""}
                          onChange={(event) => onChangeField(row.id, "actualStartDate", event.target.value)}
                          className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      {readOnly ? (
                        formatIso(row.actualEndDate)
                      ) : (
                        <input
                          type="date"
                          value={isIsoDate(row.actualEndDate) ? row.actualEndDate : ""}
                          onChange={(event) => onChangeField(row.id, "actualEndDate", event.target.value)}
                          className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      {readOnly ? (
                        formatMoney(row.plannedCost)
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          value={toText(row.plannedCost)}
                          onChange={(event) => onChangeField(row.id, "plannedCost", event.target.value)}
                          placeholder="0.00"
                          className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="text-muted-foreground">{getDurationLabel(row)}</span>
                    </TableCell>

                    {!readOnly ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canAddChild ? (
                            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => onAddChild(row.id)}>
                              <Plus className="h-3.5 w-3.5" /> +N{level + 1}
                            </Button>
                          ) : null}

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive"
                            onClick={() => onDeleteRow(row.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
