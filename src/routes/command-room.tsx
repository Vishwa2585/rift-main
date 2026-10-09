import React, { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, SimBadge, GoldButton, Mono, StatusPill } from "@/components/rift/ui";
import { FractureMap } from "@/components/rift/FractureMap";
import { useRift, SCENARIOS, makeEvent } from "@/lib/rift/store";
import { evaluateScenario, riskBand } from "@/lib/rift/engine";
import { cn } from "@/lib/utils";
import { Crosshair } from "lucide-react";

export const Route = createFileRoute("/command-room")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Command Room — RIFT" },
      { name: "description", content: "Live security simulation: launch attack scenarios, watch the 3D fracture map respond, and inspect simulated detections." },
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
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]!.id);
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const preview = evaluateScenario(scenario, state.rules);
  const band = riskBand(preview.score);

  const launch = () => {
    const txId = state.transfers[0]?.id ?? "RFT-TX-0000";
    dispatch({ type: "ADD_EVENT", event: makeEvent("rift-watch", "ATTACK", txId, `Attack simulation launched: ${scenario.name}`) });
    dispatch({ type: "LAUNCH_ATTACK", scenarioId, txId });
    dispatch({ type: "AUDIT", actor: "RIFT WATCH", action: "ATTACK_SIMULATION", detail: `${scenario.name} against ${txId}` });
  };

  return (
    <AppLayout>
      <SectionTitle eyebrow="RIFT Watch" title="Command Room" right={<SimBadge label="SIMULATED DETECTION" />} />

      <div className="grid gap-6 lg:grid-cols-5">
        <GlassPanel className="p-6 lg:col-span-2">
          <h3 className="mb-4 font-display text-lg font-semibold">Attack scenarios</h3>
          <div className="space-y-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setScenarioId(s.id)}
                className={cn(
                  "block w-full rounded-xl border px-4 py-3 text-left transition-all",
                  scenarioId === s.id ? "border-gold/50 bg-gold/10" : "border-border bg-secondary/30 hover:border-gold/25",
                )}
              >
                <p className="text-sm font-medium text-foreground">{s.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.summary}</p>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-border bg-secondary/30 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Projected risk score</p>
            <p className={cn("font-display text-4xl font-bold", band.tone === "critical" || band.tone === "high" ? "text-danger" : band.tone === "medium" ? "text-warning" : "text-success")}>
              {preview.score}
            </p>
            <p className="text-xs text-muted-foreground">{band.label} · from {preview.contributions.filter((c) => c.applied).length} triggered rule(s)</p>
          </div>

          <GoldButton className="mt-5 w-full" onClick={launch}>
            <Crosshair className="size-4" /> Launch attack simulation
          </GoldButton>
          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            Deterministic rule engine — the same scenario always produces the same result. Results are simulated detection, not measured real-world performance.
          </p>
        </GlassPanel>

        <div className="lg:col-span-3">
          <FractureMap height={480} />
        </div>
      </div>

      <GlassPanel className="mt-6 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Event stream</h3>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Live · simulated</span>
        </div>
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {state.events.map((e) => (
            <div key={e.id} className={cn(
              "flex items-center justify-between gap-3 rounded-lg border px-4 py-2",
              e.type === "ALERT" ? "border-danger/40 bg-danger/5" : "border-border bg-secondary/20",
            )}>
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn("size-1.5 shrink-0 rounded-full", e.type === "ALERT" ? "bg-danger" : "bg-gold")} />
                <p className="truncate text-sm text-foreground">{e.detail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Mono className="hidden text-muted-foreground sm:block">{e.hash.slice(0, 14)}…</Mono>
                <span className="text-[10px] text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      {state.incidents.some((i) => i.status === "open") && (
        <div className="mt-6">
          <GoldButton onClick={() => navigate({ to: "/incidents" })}>Open incident investigation →</GoldButton>
        </div>
      )}
    </AppLayout>
  );
}
