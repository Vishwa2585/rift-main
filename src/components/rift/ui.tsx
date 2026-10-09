import React from "react";
import { cn } from "@/lib/utils";

export function GlassPanel({ className, children, deep }: { className?: string; children: React.ReactNode; deep?: boolean }) {
  return (
    <div className={cn(deep ? "glass-deep" : "glass", "rounded-2xl", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.22em] text-gold">{eyebrow}</p>}
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function SimBadge({ label = "SIMULATED" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">
      <span className="size-1.5 rounded-full bg-gold" />
      {label}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "gold" | "danger" | "success" | undefined }) {
  return (
    <GlassPanel className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-2 font-display text-3xl font-semibold tracking-tight",
        tone === "gold" && "gold-text",
        tone === "danger" && "text-danger",
        tone === "success" && "text-success",
        !tone && "text-foreground",
      )}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </GlassPanel>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "border-success/40 bg-success/10 text-success",
    authorized: "border-success/40 bg-success/10 text-success",
    pending: "border-warning/40 bg-warning/10 text-warning",
    flagged: "border-danger/40 bg-danger/10 text-danger",
    rejected: "border-danger/40 bg-danger/10 text-danger",
    open: "border-danger/40 bg-danger/10 text-danger",
    investigating: "border-warning/40 bg-warning/10 text-warning",
    resolved: "border-success/40 bg-success/10 text-success",
    operational: "border-success/40 bg-success/10 text-success",
    degraded: "border-warning/40 bg-warning/10 text-warning",
  };
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]", map[status] ?? "border-border bg-secondary text-muted-foreground")}>
      {status}
    </span>
  );
}

export function GoldButton({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-gold-foreground",
        "transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function GhostButton({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 px-5 py-2.5 text-sm font-medium text-foreground",
        "transition-all hover:bg-secondary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
      <p className="font-display text-lg text-muted-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs", className)}>{children}</span>;
}
