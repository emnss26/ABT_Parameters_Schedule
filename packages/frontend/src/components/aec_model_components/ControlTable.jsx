import React, { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const INFO_COLUMNS = [
  { key: "number", label: "N. Plano", width: "min-w-[120px] w-[120px]" },
  { key: "name", label: "Nombre", width: "min-w-[220px] w-[220px]" },
  { key: "plannedGenDate", label: "Gen. Prog.", width: "min-w-[105px] w-[105px]" },
  { key: "actualGenDate", label: "Gen. Real", width: "min-w-[105px] w-[105px]" },
  { key: "plannedReviewDate", label: "Rev. Prog.", width: "min-w-[105px] w-[105px]" },
  { key: "actualReviewDate", label: "Rev. Real", width: "min-w-[105px] w-[105px]" },
  { key: "plannedIssueDate", label: "Em. Prog.", width: "min-w-[105px] w-[105px]" },
  { key: "actualIssueDate", label: "Em. Real", width: "min-w-[105px] w-[105px]" },
];

const DATE_FIELDS = [
  "plannedGenDate",
  "actualGenDate",
  "plannedReviewDate",
  "actualReviewDate",
  "plannedIssueDate",
  "actualIssueDate",
];

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const ROW_H = "h-10";
const WEEK_COL_W = 56;

const toMiddayDate = (year, month, day) => {
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return toMiddayDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return toMiddayDate(y, m, d);
  }

  const dmyMatch = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmyMatch) {
    let [, d, m, y] = dmyMatch;
    if (y.length === 2) y = `20${y}`;
    return toMiddayDate(y, m.padStart(2, "0"), d.padStart(2, "0"));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return toMiddayDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
};

const formatDate = (value) => {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return value ? String(value) : "-";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const addDays = (date, days) => {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
};

const startOfWeekMonday = (date) => {
  const d = new Date(date);
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  d.setHours(12, 0, 0, 0);
  return d;
};

const endOfWeekMonday = (date) => addDays(startOfWeekMonday(date), 6);

const findWeekIndex = (value, weeks) => {
  const date = parseDate(value);
  if (!date) return null;
  const idx = weeks.findIndex(
    (week) => date.getTime() >= week.startDate.getTime() && date.getTime() <= week.endDate.getTime()
  );
  return idx >= 0 ? idx : null;
};

const pick = (obj, ...keys) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
};

const normalizeRow = (plan, index) => ({
  rowKey: String(plan?.id ?? plan?.plan_id ?? `temp-${index}`),
  number: pick(plan, "number", "sheet_number"),
  name: pick(plan, "name", "sheet_name"),
  plannedGenDate: pick(plan, "plannedGenDate", "planned_gen_date"),
  actualGenDate: pick(plan, "actualGenDate", "actual_gen_date"),
  plannedReviewDate: pick(plan, "plannedReviewDate", "planned_review_date"),
  actualReviewDate: pick(plan, "actualReviewDate", "actual_review_date"),
  plannedIssueDate: pick(plan, "plannedIssueDate", "planned_issue_date"),
  actualIssueDate: pick(plan, "actualIssueDate", "actual_issue_date"),
});

function WeekHeaderCell({ week, isCurrentWeek }) {
  const startDay = String(week.startDate.getDate()).padStart(2, "0");
  const startMonth = String(week.startDate.getMonth() + 1).padStart(2, "0");
  const endDay = String(week.endDate.getDate()).padStart(2, "0");
  const endMonth = String(week.endDate.getMonth() + 1).padStart(2, "0");

  return (
    <th
      className={cn(
        "border-r border-border px-0.5 py-1 text-center align-middle font-normal",
        isCurrentWeek ? "bg-blue-100" : "bg-muted/20"
      )}
      style={{ minWidth: WEEK_COL_W, width: WEEK_COL_W }}
    >
      <div className="flex flex-col items-center gap-0.5 leading-none">
        <span className={cn("text-[10px] font-bold", isCurrentWeek ? "text-blue-700" : "text-foreground")}>
          S{week.weekNumber}
        </span>
        <span className="text-[8px] text-muted-foreground">{startDay}-{startMonth}</span>
        <span className="text-[8px] text-muted-foreground">{endDay}-{endMonth}</span>
      </div>
    </th>
  );
}

function CalendarWeekCell({
  row,
  weekIndex,
  isCurrentWeek,
  plannedIssueWeek,
  actualIssueWeek,
}) {
  const isPlanned = plannedIssueWeek === weekIndex;
  const isActual = actualIssueWeek === weekIndex;

  return (
    <td
      className={cn(
        "border-r border-b border-border p-0 text-center align-middle",
        isCurrentWeek && "bg-blue-50/60"
      )}
      style={{ minWidth: WEEK_COL_W, width: WEEK_COL_W }}
    >
      {isPlanned || isActual ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-pointer items-center justify-center gap-0.5">
              {isPlanned && (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-blue-500 text-[10px] font-bold text-card">
                  X
                </span>
              )}
              {isActual && (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-emerald-500 text-[10px] font-bold text-card">
                  X
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {isPlanned && (
              <p>
                <span className="font-semibold">Em. Prog:</span> {formatDate(row.plannedIssueDate)}
              </p>
            )}
            {isActual && (
              <p>
                <span className="font-semibold">Em. Real:</span> {formatDate(row.actualIssueDate)}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </td>
  );
}

export default function ControlTable({ data = [] }) {
  const scrollRef = useRef(null);

  const rows = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.map(normalizeRow);
  }, [data]);

  const weeks = useMemo(() => {
    const allDates = [];

    rows.forEach((row) => {
      DATE_FIELDS.forEach((field) => {
        const date = parseDate(row[field]);
        if (date) allDates.push(date);
      });
    });

    let startDate;
    let endDate;

    if (allDates.length === 0) {
      const today = new Date();
      startDate = startOfWeekMonday(today);
      endDate = endOfWeekMonday(today);
    } else {
      const minTime = Math.min(...allDates.map((d) => d.getTime()));
      const maxTime = Math.max(...allDates.map((d) => d.getTime()));
      startDate = startOfWeekMonday(new Date(minTime));
      endDate = endOfWeekMonday(new Date(maxTime));
    }

    const result = [];
    let cursor = new Date(startDate);
    let weekNumber = 1;

    while (cursor.getTime() <= endDate.getTime()) {
      const start = new Date(cursor);
      const end = addDays(start, 6);
      result.push({
        weekNumber,
        startDate: start,
        endDate: end,
      });
      cursor = addDays(cursor, 7);
      weekNumber += 1;
    }

    return result;
  }, [rows]);

  const monthGroups = useMemo(() => {
    const groups = [];
    weeks.forEach((week) => {
      const month = week.startDate.getMonth();
      const year = week.startDate.getFullYear();
      const key = `${year}-${month}`;
      const last = groups[groups.length - 1];

      if (!last || last.key !== key) {
        groups.push({
          key,
          name: MONTHS_ES[month],
          year,
          weeksCount: 1,
        });
      } else {
        last.weeksCount += 1;
      }
    });
    return groups;
  }, [weeks]);

  const currentWeekIndex = useMemo(() => {
    const now = new Date();
    const today = toMiddayDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    if (!today) return null;
    const idx = weeks.findIndex(
      (week) => today.getTime() >= week.startDate.getTime() && today.getTime() <= week.endDate.getTime()
    );
    return idx >= 0 ? idx : null;
  }, [weeks]);

  const deliveryWeekByRow = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      map[row.rowKey] = {
        plannedIssue: findWeekIndex(row.plannedIssueDate, weeks),
        actualIssue: findWeekIndex(row.actualIssueDate, weeks),
      };
    });
    return map;
  }, [rows, weeks]);

  useEffect(() => {
    if (!scrollRef.current) return;

    let targetIdx = currentWeekIndex;
    if (targetIdx === null) {
      const firstWithDelivery = Object.values(deliveryWeekByRow).find(
        (item) => item.plannedIssue !== null || item.actualIssue !== null
      );
      targetIdx = firstWithDelivery?.plannedIssue ?? firstWithDelivery?.actualIssue ?? null;
    }

    if (targetIdx === null) return;

    const container = scrollRef.current;
    const scrollTo = targetIdx * WEEK_COL_W - container.clientWidth / 2 + WEEK_COL_W / 2;
    container.scrollLeft = Math.max(0, scrollTo);
  }, [currentWeekIndex, deliveryWeekByRow]);

  const rangeLabel = useMemo(() => {
    if (weeks.length === 0) return "Sin fechas disponibles";
    return `${formatDate(weeks[0].startDate)} - ${formatDate(weeks[weeks.length - 1].endDate)}`;
  }, [weeks]);

  return (
    <TooltipProvider delayDuration={120}>
      <div className="w-full rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Control de Entrega Semanal</h2>
            <p className="text-[11px] text-muted-foreground">Rango de calendario: {rangeLabel}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-blue-500 text-[8px] font-bold text-card">
                X
              </span>
              <span className="text-[11px] text-muted-foreground">Entrega Programada</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-emerald-500 text-[8px] font-bold text-card">
                X
              </span>
              <span className="text-[11px] text-muted-foreground">Entrega Real</span>
            </div>
            {currentWeekIndex !== null && (
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-sm border border-blue-300 bg-blue-100" />
                <span className="text-[11px] text-muted-foreground">Semana actual</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex overflow-hidden">
          <div className="z-10 flex-shrink-0 overflow-hidden border-r-2 border-border bg-card">
            <table className="border-collapse text-[11px]">
              <thead>
                <tr>
                  <th
                    colSpan={INFO_COLUMNS.length}
                    className="h-7 border-b border-border bg-muted/40 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Informacion del Plano
                  </th>
                </tr>
                <tr className="bg-muted/20">
                  {INFO_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "whitespace-nowrap border-r border-b border-border px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground",
                        column.width
                      )}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.rowKey}
                    className={cn("border-b border-border transition-colors hover:bg-muted/30", ROW_H)}
                  >
                    <td className="min-w-[120px] whitespace-nowrap border-r border-border px-2 font-mono font-medium text-foreground">
                      {row.number || "-"}
                    </td>
                    <td className="max-w-[220px] truncate border-r border-border px-2 text-foreground">
                      <span title={row.name || ""}>{row.name || "-"}</span>
                    </td>
                    <td className="whitespace-nowrap border-r border-border px-2 text-muted-foreground">
                      {formatDate(row.plannedGenDate)}
                    </td>
                    <td className="whitespace-nowrap border-r border-border px-2 text-muted-foreground">
                      {formatDate(row.actualGenDate)}
                    </td>
                    <td className="whitespace-nowrap border-r border-border px-2 text-muted-foreground">
                      {formatDate(row.plannedReviewDate)}
                    </td>
                    <td className="whitespace-nowrap border-r border-border px-2 text-muted-foreground">
                      {formatDate(row.actualReviewDate)}
                    </td>
                    <td className="whitespace-nowrap border-r border-border px-2 font-medium text-blue-700">
                      {formatDate(row.plannedIssueDate)}
                    </td>
                    <td className="whitespace-nowrap border-r border-border px-2 font-medium text-emerald-700">
                      {formatDate(row.actualIssueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-x-auto">
            <table className="border-collapse text-[11px]">
              <thead>
                <tr>
                  {monthGroups.map((group) => (
                    <th
                      key={group.key}
                      colSpan={group.weeksCount}
                      className="h-7 border-r border-b border-border bg-muted/40 text-center text-[10px] font-semibold text-foreground"
                    >
                      {group.name} {group.year}
                    </th>
                  ))}
                </tr>
                <tr>
                  {weeks.map((week, idx) => (
                    <WeekHeaderCell
                      key={`${week.startDate.toISOString()}-${idx}`}
                      week={week}
                      isCurrentWeek={currentWeekIndex === idx}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const delivery = deliveryWeekByRow[row.rowKey];
                  return (
                    <tr key={row.rowKey} className={ROW_H}>
                      {weeks.map((week, weekIdx) => (
                        <CalendarWeekCell
                          key={`${row.rowKey}-${week.startDate.toISOString()}`}
                          row={row}
                          weekIndex={weekIdx}
                          isCurrentWeek={currentWeekIndex === weekIdx}
                          plannedIssueWeek={delivery?.plannedIssue ?? null}
                          actualIssueWeek={delivery?.actualIssue ?? null}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
