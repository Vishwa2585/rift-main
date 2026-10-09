import React, { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, SimBadge, GoldButton, GhostButton, Mono, StatusPill } from "@/components/rift/ui";
import { FractureMap } from "@/components/rift/FractureMap";
import { useRift, ATTACK_SCENARIOS, riskBand } from "@/lib/rift/store";
import { cn } from "@/lib/utils";
import { Crosshair, Play, Pause, Square, RotateCcw, ShieldCheck, AlertTriangle, ArrowRight, Activity } from "lucide-react";

export const Route = createFileRoute("/command-room")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Command Room — RIFT" },
      { name: "description", content: "Live security control panel: ingest cross-chain events, evaluate detection rules, and trigger real-time anomaly alerts." },
      { property: "og:title", content: "Command Room — RIFT" },
      { property: "og:description", content: "Interactive interchain attack simulation and 3D fracture map." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommandRoom,
});

function CommandRoom() {
  const { state, dispatch } = useRift();
  const navigate = useNavigate();
  const [selectedScenarioId, setSelectedScenarioId] = useState(ATTACK_SCENARIOS[0]!.id);
  const [executing, setExecuting] = useState(false);

  const scenario = ATTACK_SCENARIOS.find((s) => s.id === selectedScenarioId) || ATTACK_SCENARIOS[0]!;

  const handleSimulateExploit = () => {
    setExecuting(true);
    dispatch({ type: "SET_SCANNING_STATE", state: "CORRELATING" });

    // Step 1: Ingest source/destination events through the real detector pipeline
    setTimeout(() => {
      dispatch({ type: "PROCESS_ATTACK_SCENARIO", scenarioId: selectedScenarioId });
      setExecuting(false);
    }, 600);
  };

  const handleVerifyCleanTransfer = () => {
    setExecuting(true);
    dispatch({ type: "SET_SCANNING_STATE", state: "CORRELATING" });

    setTimeout(() => {
      dispatch({ type: "PROCESS_NORMAL_DEMO" });
      setExecuting(false);
    }, 600);
  };

  const openIncidents = state.incidents.filter((i) => i.status === "open");

  return (
    <AppLayout>
      <SectionTitle
        eyebrow="RIFT Watch"
        title="Command Room"
        right={<SimBadge label="DETERMINISTIC DETECTION ENGINE" />}
      />

      {/* Control Panel: Data Source + Scan Controls */}
      <GlassPanel className="mb-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Engine Control Center</p>
            <h3 className="font-display text-lg font-bold text-foreground">Live Detection Controls</h3>
          </div>

          {/* Source Selector */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[11px] sm:text-xs text-muted-foreground">Source:</span>
            {(["CONTROLLED DEMO STREAM", "LIVE LOCAL CHAIN", "HISTORICAL REPLAY"] as const).map((source) => (
              <button
                key={source}
                onClick={() => dispatch({ type: "SET_DATA_SOURCE", source })}
                className={cn(
                  "rounded-lg px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs font-semibold transition-all",
                  state.dataSource === source
                    ? "border border-gold/60 bg-gold/15 text-gold shadow-sm"
                    : "border border-border bg-secondary/30 text-muted-foreground hover:text-foreground",
                )}
              >
                {source}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Scanning Action Buttons: 2x2 grid on mobile, flex on desktop */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <button
              onClick={() => dispatch({ type: "SET_SCANNING_STATE", state: "SCANNING" })}
              disabled={state.scanningState === "SCANNING"}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold transition-all min-h-[40px]",
                state.scanningState === "SCANNING"
                  ? "bg-success text-success-foreground shadow-md shadow-success/20 ring-2 ring-success/30"
                  : "border border-border bg-secondary/40 text-foreground hover:bg-secondary",
              )}
            >
              <Play className="size-3.5 fill-current" /> START
            </button>

            <button
              onClick={() => dispatch({ type: "SET_SCANNING_STATE", state: "PAUSED" })}
              disabled={state.scanningState === "PAUSED"}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold transition-all min-h-[40px]",
                state.scanningState === "PAUSED"
                  ? "bg-warning text-warning-foreground shadow-md"
                  : "border border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <Pause className="size-3.5" /> PAUSE
            </button>

            <button
              onClick={() => dispatch({ type: "SET_SCANNING_STATE", state: "IDLE" })}
              disabled={state.scanningState === "IDLE"}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold transition-all min-h-[40px]",
                state.scanningState === "IDLE"
                  ? "border border-border bg-secondary text-foreground"
                  : "border border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <Square className="size-3.5" /> STOP
            </button>

            <button
              onClick={() => dispatch({ type: "RESET" })}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary/20 px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs text-muted-foreground hover:text-foreground min-h-[40px]"
              title="Reset state to initial baseline"
            >
              <RotateCcw className="size-3.5" /> RESET
            </button>
          </div>

          {/* Real-time State Monitor */}
          <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/50">
            <span className="text-[11px] font-mono uppercase text-muted-foreground">STATUS:</span>
            <span className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-bold",
              state.scanningState === "SCANNING" ? "bg-success/15 text-success ring-1 ring-success/30" :
              state.scanningState === "ALERT_GENERATED" ? "bg-danger/20 text-danger ring-1 ring-danger/40 animate-pulse" :
              state.scanningState === "CORRELATING" ? "bg-gold/20 text-gold ring-1 ring-gold/40 animate-pulse" :
              "bg-secondary text-muted-foreground",
            )}>
              <span className="size-2 rounded-full bg-current" />
              {state.scanningState}
            </span>
          </div>
        </div>
      </GlassPanel>

      {/* Main Grid: Attack Scenarios vs 3D Fracture Map */}
      <div className="grid gap-6 lg:grid-cols-5">
        <GlassPanel className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between pb-3">
            <h3 className="font-display text-lg font-semibold text-foreground">Attack Demonstrations</h3>
            <span className="text-[10px] font-mono uppercase text-muted-foreground">CSB-01 Testbed</span>
          </div>

          <div className="space-y-2">
            {ATTACK_SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedScenarioId(s.id)}
                className={cn(
                  "block w-full rounded-xl border px-3.5 py-2.5 text-left transition-all",
                  selectedScenarioId === s.id
                    ? "border-gold/60 bg-gold/10 shadow-sm"
                    : "border-border bg-secondary/20 hover:border-gold/30",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{s.name}</p>
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                    {s.anomalyType}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.summary}</p>
              </button>
            ))}
          </div>

          {/* Trigger Actions */}
          <div className="mt-5 space-y-2.5">
            <button
              onClick={handleSimulateExploit}
              disabled={executing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-danger to-gold px-4 py-3 text-sm font-bold text-white shadow-lg shadow-danger/20 transition-all hover:opacity-95 active:scale-[0.99]"
            >
              <Crosshair className="size-4" />
              {executing ? "EVALUATING INGESTED EVENTS…" : "SIMULATE BRIDGE EXPLOIT"}
            </button>

            <button
              onClick={handleVerifyCleanTransfer}
              disabled={executing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-xs font-semibold text-success transition-all hover:bg-success/20"
            >
              <ShieldCheck className="size-4" />
              Verify Legitimate Transfer (Zero Alert Baseline)
            </button>
          </div>

          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            Runs raw events through real normalization, cross-chain correlation, and deterministic rule evaluation.
          </p>
        </GlassPanel>

        <div className="lg:col-span-3">
          <FractureMap height={500} />
        </div>
      </div>

      {/* Live Event Stream Table */}
      <GlassPanel className="mt-6 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-semibold">Live Event Ingestion Stream</h3>
            <p className="text-xs text-muted-foreground">Events arriving, normalized, and correlated across chains</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2 animate-ping rounded-full bg-success" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">STREAM ACTIVE</span>
          </div>
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {state.events.slice(0, 40).map((e) => (
            <div
              key={e.id}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 rounded-xl border p-3 sm:px-4 sm:py-2.5 transition-colors",
                e.type === "ALERT" ? "border-danger/60 bg-danger/10 text-danger shadow-sm" :
                e.type === "DEPOSIT" ? "border-gold/30 bg-gold/5" :
                e.type === "WITHDRAWAL" ? "border-border bg-secondary/30" :
                "border-border bg-secondary/15",
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <span className={cn(
                  "size-2 shrink-0 rounded-full",
                  e.type === "ALERT" ? "bg-danger" : e.type === "DEPOSIT" ? "bg-gold" : "bg-muted-foreground",
                )} />
                <span className="shrink-0 rounded bg-secondary/60 px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase text-foreground">
                  {e.chain}
                </span>
                <span className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] sm:text-[10px] font-semibold",
                  e.type === "ALERT" ? "bg-danger/20 text-danger" : "text-muted-foreground",
                )}>
                  {e.type}
                </span>
                <p className="truncate text-xs sm:text-sm font-medium text-foreground">{e.detail}</p>
              </div>

              <div className="flex shrink-0 items-center justify-between sm:justify-end gap-3 pl-5 sm:pl-0">
                <Mono className="hidden text-xs text-muted-foreground md:block">{e.hash.slice(0, 14)}…</Mono>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {new Date(e.at).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      {/* Investigation Prompt if Alert Triggered */}
      {openIncidents.length > 0 && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-danger/40 bg-danger/10 p-5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="size-6 text-danger" />
            <div>
              <p className="font-semibold text-foreground">
                {openIncidents.length} Active Incident(s) Awaiting Investigation
              </p>
              <p className="text-xs text-muted-foreground">
                Latest: {openIncidents[0]?.title} · Risk Score {openIncidents[0]?.score}/100
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate({ to: "/incidents" })}
            className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-danger/90"
          >
            Open Investigation Room <ArrowRight className="size-4" />
          </button>
        </div>
      )}
    </AppLayout>
  );
}
