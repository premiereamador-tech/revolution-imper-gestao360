"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const C = {
  primary: "#176ca0",
  accent: "#3eb7c1",
  secondary: "#6f9e3a",
  danger: "#bd2c1e",
  muted: "#5b6b76",
  grid: "#e5eaed",
  ink: "#10212c",
};

const brl0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR");
};
const axis = { fontSize: 12, fill: C.muted } as const;
const tooltipStyle = { borderRadius: 10, border: `1px solid ${C.grid}`, fontSize: 13, boxShadow: "0 8px 24px rgb(14 42 59 / .12)" };

export function MonthlyFinanceChart({ data }: { data: Array<{ label: string; invoiced: number; received: number; paid: number }> }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
          <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compact} width={52} />
          <Tooltip formatter={(v) => brl0(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: "rgb(23 108 160 / .06)" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar isAnimationActive={false} dataKey="invoiced" name="Faturado" fill={C.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar isAnimationActive={false} dataKey="received" name="Recebido" fill={C.accent} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar isAnimationActive={false} dataKey="paid" name="Pago" fill="#c9d3d9" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashflowChart({ data, height = 300 }: { data: Array<{ label: string; balance: number; inflow: number; outflow: number }>; height?: number }) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.accent} stopOpacity={0.35} />
              <stop offset="1" stopColor={C.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compact} width={56} />
          <Tooltip formatter={(v) => brl0(Number(v))} contentStyle={tooltipStyle} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke={C.danger} strokeDasharray="4 4" />
          <Bar isAnimationActive={false} dataKey="inflow" name="Entradas" fill={C.secondary} maxBarSize={14} radius={[3, 3, 0, 0]} />
          <Bar isAnimationActive={false} dataKey="outflow" name="Saídas" fill="#e0a39d" maxBarSize={14} radius={[3, 3, 0, 0]} />
          <Area isAnimationActive={false} type="stepAfter" dataKey="balance" name="Saldo projetado" stroke={C.primary} strokeWidth={2.5} fill="url(#bal)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SCurveChart({ data }: { data: Array<{ label: string; planned: number; actual: number | null; financial: number | null }> }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={axis} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={44} />
          <Tooltip formatter={(v) => (v === null ? "—" : `${Number(v).toFixed(1)}%`)} contentStyle={tooltipStyle} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Line isAnimationActive={false} type="monotone" dataKey="planned" name="Físico planejado" stroke={C.muted} strokeDasharray="5 4" dot={false} strokeWidth={2} />
          <Line isAnimationActive={false} type="monotone" dataKey="actual" name="Físico realizado" stroke={C.primary} dot={false} strokeWidth={2.5} connectNulls={false} />
          <Line isAnimationActive={false} type="monotone" dataKey="financial" name="Financeiro (custo)" stroke={C.secondary} dot={false} strokeWidth={2} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HorizontalBars({ data, valueLabel, format = "number" }: { data: Array<{ label: string; value: number; highlight?: boolean }>; valueLabel: string; format?: "number" | "money" }) {
  return (
    <div className="w-full" style={{ height: Math.max(140, data.length * 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={format === "money" ? compact : undefined} />
          <YAxis type="category" dataKey="label" tick={{ ...axis, fill: C.ink }} axisLine={false} tickLine={false} width={120} />
          <Tooltip formatter={(v) => (format === "money" ? brl0(Number(v)) : Number(v).toLocaleString("pt-BR"))} contentStyle={tooltipStyle} cursor={{ fill: "rgb(23 108 160 / .06)" }} />
          <Bar isAnimationActive={false} dataKey="value" name={valueLabel} fill={C.primary} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
