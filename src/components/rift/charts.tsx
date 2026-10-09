import React, { useState } from "react";
import { cn } from "@/lib/utils";

// Lightweight dependency-free SVG charts driven by demo state.

export function Sparkline({ data, className, height = 48 }: { data: number[]; className?: string; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const w = 200;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - 4 - ((v - min) / (max - min || 1)) * (height - 8)}`);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className={cn("w-full", className)} preserveAspectRatio="none" style={{ height }}>
      <polyline points={pts.join(" ")} fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <polygon points={`0,${height} ${pts.join(" ")} ${w},${height}`} fill="var(--color-gold)" opacity="0.12" />
    </svg>
  );
}

export function Donut({ slices, size = 160 }: { slices: { label: string; pct: number }[]; size?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const colors = ["var(--color-gold)", "oklch(0.65 0.08 220)", "oklch(0.6 0.1 160)", "oklch(0.55 0.06 300)"];
  const r = 60, cx = 70, cy = 70, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 140 140">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth="14" />
        {slices.map((s, i) => {
          const len = (s.pct / 100) * circ;
          const el = (
            <circle
              key={s.label} cx={cx} cy={cy} r={r} fill="none"
              stroke={colors[i % colors.length]} strokeWidth={hover === s.label ? 18 : 14}
              strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt"
              onMouseEnter={() => setHover(s.label)} onMouseLeave={() => setHover(null)}
              style={{ transition: "stroke-width 0.2s" }}
            />
          );
          offset += len;
          return el;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--color-foreground)" fontSize="15" fontWeight="600" fontFamily="var(--font-display)">
          {hover ?? "Allocation"}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="10">
          {hover ? `${slices.find((s) => s.label === hover)?.pct}%` : "simulated"}
        </text>
      </svg>
      <ul className="space-y-1.5">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-sm" style={{ background: colors[i % colors.length] }} />
            {s.label} <span className="font-mono text-foreground">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Bars({ data, height = 120 }: { data: { label: string; value: number; tone?: "gold" | "danger" | "muted" }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="group relative flex flex-1 flex-col items-center justify-end gap-1.5 self-stretch"
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          {hover === i && (
            <div className="pointer-events-none absolute -top-8 z-10 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-lg">
              {d.label}: {d.value}
            </div>
          )}
          <div
            className="w-full rounded-t-md transition-all"
            style={{
              height: `${(d.value / max) * 100}%`,
              background: d.tone === "danger" ? "var(--color-danger)" : d.tone === "muted" ? "var(--color-muted)" : "linear-gradient(180deg, oklch(0.9 0.09 95), var(--color-gold))",
              opacity: hover === null || hover === i ? 1 : 0.45,
            }}
          />
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
