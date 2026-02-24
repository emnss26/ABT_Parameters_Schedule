import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import {
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Calendar,
  Target,
  Activity,
  PieChart as PieChartIcon,
  BarChart3,
  Layers,
  ClipboardCheck,
} from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export default function AnalyticsDashboard({ data = [] }) {
  const analytics = useMemo(() => {
    const total = data.length;

    const completed = data.filter((d) => d.actual_issue_date || d.actualIssueDate).length;
    const inReview = data.filter(
      (d) => d.latest_review_status === "IN_REVIEW" || d.lastReviewStatus === "IN_REVIEW"
    ).length;
    const approved = data.filter(
      (d) => d.latest_review_status === "APPROVED" || d.lastReviewStatus === "APPROVED"
    ).length;

    const pending = total - completed;
    const withApprovalFlow = data.filter((d) => d.has_approval_flow || d.hasApprovalFlow).length;

    let onTimeCount = 0;
    let delayedCount = 0;
    let earlyCount = 0;

    const delayDays = [];
    const genDeviationData = [];
    let totalGenDelay = 0;
    let genCount = 0;

    const getMonthKey = (dateStr) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };

    const timelineMap = {};

    data.forEach((item) => {
      const pIssue = item.planned_issue_date || item.plannedIssueDate;
      const aIssue = item.actual_issue_date || item.actualIssueDate;
      const pGen = item.planned_gen_date || item.plannedGenDate;
      const aGen = item.actual_gen_date || item.actualGenDate;
      const pRev = item.planned_review_date || item.plannedReviewDate;
      const aRev = item.actual_review_date || item.actualReviewDate;

      if (pIssue && aIssue) {
        const p = new Date(pIssue);
        const a = new Date(aIssue);
        const diff = Math.round((a.getTime() - p.getTime()) / (1000 * 3600 * 24));
        delayDays.push(diff);
        if (diff > 0) delayedCount++;
        else if (diff < 0) earlyCount++;
        else onTimeCount++;
      }

      if (pGen && aGen) {
        const p = new Date(pGen);
        const a = new Date(aGen);
        const diff = Math.round((a.getTime() - p.getTime()) / (1000 * 3600 * 24));
        genDeviationData.push({
          x: p.getTime(),
          y: diff,
          name: item.number || item.name,
          dateStr: new Date(pGen).toLocaleDateString(),
        });
        totalGenDelay += diff;
        genCount++;
      }

      if (pIssue) {
        const k = getMonthKey(pIssue);
        if (k) {
          if (!timelineMap[k]) timelineMap[k] = { month: k, pIssue: 0, aIssue: 0, pRev: 0, aRev: 0 };
          timelineMap[k].pIssue++;
          if (aIssue) timelineMap[k].aIssue++;
        }
      }

      if (pRev) {
        const k = getMonthKey(pRev);
        if (k) {
          if (!timelineMap[k]) timelineMap[k] = { month: k, pIssue: 0, aIssue: 0, pRev: 0, aRev: 0 };
          timelineMap[k].pRev++;
        }
      }

      if (aRev) {
        const k = getMonthKey(aRev);
        if (k) {
          if (!timelineMap[k]) timelineMap[k] = { month: k, pIssue: 0, aIssue: 0, pRev: 0, aRev: 0 };
          timelineMap[k].aRev++;
        }
      }
    });

    const avgDelay =
      delayDays.length > 0 ? Math.round(delayDays.reduce((a, b) => a + b, 0) / delayDays.length) : 0;
    const avgGenDelay = genCount > 0 ? Math.round(totalGenDelay / genCount) : 0;

    const timelineArray = Object.values(timelineMap).sort((a, b) => a.month.localeCompare(b.month));

    let accP = 0;
    let accA = 0;
    const sCurveData = timelineArray.map((t) => {
      accP += t.pIssue;
      accA += t.aIssue;
      return { month: t.month, plannedAcc: accP, actualAcc: accA, ...t };
    });

    const byVersionSetMap = data.reduce((acc, item) => {
      const set = item.sheet_version_set || item.issueVersionSetName || "Sin asignar";
      if (!acc[set]) acc[set] = { name: set, total: 0, completed: 0, inReview: 0, pending: 0 };

      acc[set].total++;

      const isCompleted = item.actual_issue_date || item.actualIssueDate;
      const status = item.latest_review_status || item.lastReviewStatus;

      if (isCompleted) acc[set].completed++;
      else if (status === "IN_REVIEW") acc[set].inReview++;
      else acc[set].pending++;

      return acc;
    }, {});
    const byVersionSet = Object.values(byVersionSetMap);

    const revisionCounts = data.reduce((acc, item) => {
      const rev = item.current_revision || item.currentRevision || "N/A";
      acc[rev] = (acc[rev] || 0) + 1;
      return acc;
    }, {});
    const revisionData = Object.entries(revisionCounts).map(([name, value]) => ({ name, value }));

    return {
      total,
      completed,
      inReview,
      approved,
      pending,
      withApprovalFlow,
      onTimeCount,
      delayedCount,
      earlyCount,
      avgDelay,
      avgGenDelay,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      genDeviationData,
      timelineArray,
      sCurveData,
      byVersionSet,
      revisionData,
    };
  }, [data]);

  const statusData = [
    { name: "Completados", value: analytics.completed, color: "#10b981" },
    { name: "En Revisión", value: analytics.inReview, color: "#f59e0b" },
    { name: "Pendientes", value: analytics.pending - analytics.inReview, color: "#6b7280" },
  ];

  const chartConfig = {
    planned: { label: "Programado", color: "#3b82f6" },
    actual: { label: "Real", color: "#10b981" },
    completados: { label: "Completados", color: "#10b981" },
    enRevision: { label: "En Revisión", color: "#f59e0b" },
    pendientes: { label: "Pendientes", color: "#6b7280" },
  };

  const deliveryCardIsDelayed = analytics.avgDelay > 0;
  const genCardIsDelayed = analytics.avgGenDelay > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card className="border-emerald-100 bg-emerald-50/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-600/80">Completados</p>
                <p className="text-2xl font-bold text-emerald-700">{analytics.completed}</p>
              </div>
              <div className="rounded-lg bg-emerald-100 p-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <div className="mt-2 text-[10px] font-medium text-emerald-600">{analytics.completionRate}% del total</div>
          </CardContent>
        </Card>

        <Card className="border-amber-100 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-600/80">En Revisión</p>
                <p className="text-2xl font-bold text-amber-700">{analytics.inReview}</p>
              </div>
              <div className="rounded-lg bg-amber-100 p-2">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-violet-100 bg-violet-50/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-violet-600/80">Aprobados</p>
                <p className="text-2xl font-bold text-violet-700">{analytics.approved}</p>
              </div>
              <div className="rounded-lg bg-violet-100 p-2">
                <Target className="h-5 w-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-600/80">Total Planos</p>
                <p className="text-2xl font-bold text-blue-700">{analytics.total}</p>
              </div>
              <div className="rounded-lg bg-blue-100 p-2">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={deliveryCardIsDelayed ? "border-red-100 bg-red-50/50" : "border-green-100 bg-green-50/50"}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-medium ${deliveryCardIsDelayed ? "text-red-600/80" : "text-green-600/80"}`}>
                  Desv. Entrega
                </p>
                <p className={`text-2xl font-bold ${deliveryCardIsDelayed ? "text-red-700" : "text-green-700"}`}>
                  {analytics.avgDelay > 0 ? "+" : ""}
                  {analytics.avgDelay}d
                </p>
              </div>
              <div className={`rounded-lg p-2 ${deliveryCardIsDelayed ? "bg-red-100" : "bg-green-100"}`}>
                {deliveryCardIsDelayed ? (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                ) : (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={genCardIsDelayed ? "border-red-100 bg-red-50/50" : "border-green-100 bg-green-50/50"}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-medium ${genCardIsDelayed ? "text-red-600/80" : "text-green-600/80"}`}>
                  Desv. Generación
                </p>
                <p className={`text-2xl font-bold ${genCardIsDelayed ? "text-red-700" : "text-green-700"}`}>
                  {analytics.avgGenDelay > 0 ? "+" : ""}
                  {analytics.avgGenDelay}d
                </p>
              </div>
              <div className={`rounded-lg p-2 ${genCardIsDelayed ? "bg-red-100" : "bg-green-100"}`}>
                <Activity className={`h-5 w-5 ${genCardIsDelayed ? "text-red-600" : "text-green-600"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChartIcon className="h-4 w-4 text-primary" /> Estado General
            </CardTitle>
            <CardDescription>Distribución actual de planos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                </PieChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-primary" /> Evolución de Entregas (Mes a Mes)
            </CardTitle>
            <CardDescription>Volumen de planos programados vs reales por mes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <AreaChart data={analytics.timelineArray} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorP" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Area type="monotone" dataKey="pIssue" name="Prog. Emisión" stroke="#3b82f6" fill="url(#colorP)" />
                  <Area type="monotone" dataKey="aIssue" name="Real Emisión" stroke="#10b981" fill="url(#colorA)" />
                </AreaChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" /> Desviación de Generación
            </CardTitle>
            <CardDescription>Puntos arriba = Retraso. Puntos abajo = Adelanto.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={["auto", "auto"]}
                    tickFormatter={(unixTime) =>
                      new Date(unixTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    }
                    name="Fecha"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis dataKey="y" type="number" name="Días" tick={{ fontSize: 10 }} />
                  <ZAxis range={[50, 50]} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded border bg-popover p-2 text-xs shadow">
                          <p className="font-bold">{d.name}</p>
                          <p>Prog: {d.dateStr}</p>
                          <p className={d.y > 0 ? "text-red-500" : "text-emerald-500"}>
                            {d.y > 0 ? `+${d.y} días` : `${d.y} días`}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Scatter name="Planos" data={analytics.genDeviationData} fill="#8884d8">
                    {analytics.genDeviationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.y > 0 ? "#ef4444" : "#10b981"} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" /> Curva S: Avance de Emisión
            </CardTitle>
            <CardDescription>Progreso acumulado programado vs real</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <AreaChart data={analytics.sCurveData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="plannedAcc"
                    name="Prog. Acumulado"
                    stroke="#3b82f6"
                    fill="transparent"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="actualAcc"
                    name="Real Acumulado"
                    stroke="#10b981"
                    fill="transparent"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Revisiones Técnicas
            </CardTitle>
            <CardDescription>Comparativa mensual: Programado vs Real</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <BarChart data={analytics.timelineArray} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey="pRev" name="Prog. Revisión" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="aRev" name="Real Revisión" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-primary" /> Versiones de Planos
            </CardTitle>
            <CardDescription>Cantidad de planos por número de revisión actual</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ChartContainer config={{}} className="h-full w-full">
                <BarChart data={analytics.revisionData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={50} tick={{ fontWeight: "bold" }} />
                  <ChartTooltip
                    cursor={{ fill: "transparent" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded border bg-popover p-2 text-sm">
                          <p>
                            Rev <strong>{payload[0].payload.name}</strong>: {payload[0].value} planos
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="#8b5cf6"
                    radius={[0, 4, 4, 0]}
                    label={{ position: "right", fill: "#666" }}
                    barSize={30}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" /> Análisis por Conjunto
          </CardTitle>
          <CardDescription>Estado de planos por paquete/conjunto</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <BarChart data={analytics.byVersionSet} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="completed" name="Completados" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                <Bar dataKey="inReview" name="En Revisión" stackId="a" fill="#f59e0b" />
                <Bar dataKey="pending" name="Pendientes" stackId="a" fill="#6b7280" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
