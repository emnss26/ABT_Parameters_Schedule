import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";

const norm = (s) => String(s || "").toLowerCase().trim();

export default function AlertsTable({ data = [] }) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const base = Array.isArray(data) ? data : [];
    if (!q) return base;
    const qq = norm(q);
    return base.filter((r) =>
      norm(r.sheet_number).includes(qq) ||
      norm(r.sheet_name).includes(qq) ||
      norm(r.model_ids).includes(qq) ||
      norm(r.current_revision).includes(qq)
    );
  }, [data, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between rounded-xl border border-border bg-muted/30 p-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 bg-background"
            placeholder="Buscar por número, nombre, revisión o modelo..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Badge variant="secondary" className="h-9 px-3">
          {rows.length} alertas
        </Badge>
      </div>

      <div className="rounded-md border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table className="w-full text-xs">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead className="min-w-[140px]">N° Plano</TableHead>
                <TableHead className="min-w-[260px]">Nombre</TableHead>
                <TableHead className="w-24 text-center">Rev</TableHead>
                <TableHead className="w-32">Fecha Rev</TableHead>
                <TableHead className="min-w-[220px]">Modelos</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                    No hay alertas (por ahora… disfrútalo 😄)
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={r.id ?? `${r.sheet_key}-${i}`} className="hover:bg-muted/40">
                    <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono">{r.sheet_number || "—"}</TableCell>
                    <TableCell>{r.sheet_name || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-white">
                        {r.current_revision || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.current_revision_date || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                    {(r.model_ids || "")
                        .split("|")
                        .map(s => s.trim())
                        .filter(Boolean)
                        .map((name, idx) => (
                        <Badge key={idx} variant="secondary" className="mr-1 mb-1">
                            {name}
                        </Badge>
                        ))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
