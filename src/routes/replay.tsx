import React, { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, SimBadge, GoldButton, GhostButton, Mono } from "@/components/rift/ui";
import { useRift, SCENARIOS } from "@/lib/rift/store";
import { evaluateScenario, DEFAULT_RULES, riskBand } from "@/lib/rift/engine";
import { cn } from "@/lib/utils";
import { Play, Pause, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/replay")({
  head: () => ({
    meta: [
      { title: "Replay Lab — RIFT" },
      { name: "description", content: "Replay a curated sample incident, scrub the timeline, toggle detection rules, and compare outcomes." },
      { property: "og:title", content: "Replay Lab — RIFT" },
      { property: "og:description", content: "Curated demonstration replay with rule toggles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Replay,
});

const SAMPLE = [
  { t: 0, chain: "source", label: "Transfer request received", detail: "250M USDC · Veyron Vault Reserve" },
  { t: 1, chain: "source", label: "Authorization token AUTH-55231 consumed", detail: "RIFT Key Demo Unit 01" },
  { t: 2, chain: "source", label: "Bridge lock event", detail: "MSG-88412 emitted" },
  { t: 3, chain: "destination", label: "Mint credit 250M", detail: "Correlated with MSG-88412" },
  { t: 4, chain: "source", label: "Second request with AUTH-55231", detail: "New session · device mismatch" },
  { t: 5, chain: "source", label: "Bridge lock reuses MSG-88412", detail: "Relayer key 0x9c…" },
  { t: 6, chain: "destination", label: "No matching credit", detail: "Finality window elapsed" },
  { t: 7, chain: "watch", label: "Detection evaluated", detail: "Rule engine verdict" },
];

function Replay() {
  const { state, dispatch } = useRift();
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const scenario = SCENARIOS.find((s: { id: string }) => s.id === "sc-replay-auth")!;

  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      setPos((p) => {
        if (p >= SAMPLE.length - 1) { setPlaying(false); return p; }
        return p + 1;
      });
    }, 1200 / speed);
    return () => clearInterval(iv);
  }, [playing, speed]);

  const before = useMemo(() => evaluateScenario(scenario, DEFAULT_RULES), [scenario]);
  const after = useMemo(() => evaluateScenario(scenario, state.rules), [scenario, state.rules]);
  const verdictVisible = pos >= SAMPLE.length - 1;

  return (
    <AppLayout>
      <SectionTitle eyebrow="Historical investigation" title="Replay Lab" right={<SimBadge label="CURATED SAMPLE DATASET" />} />

      <GlassPanel className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          {playing ? (
            <GoldButton onClick={() => setPlaying(false)}><Pause className="size-4" /> Pause</GoldButton>
          ) : (
            <GoldButton onClick={() => { if (pos >= SAMPLE.length - 1) setPos(0); setPlaying(true); }}>
              <Play className="size-4" /> {pos > 0 && pos < SAMPLE.length - 1 ? "Resume" : "Play"}
            </GoldButton>
          )}
          <GhostButton onClick={() => { setPos(0); setPlaying(false); }}><RotateCcw className="size-4" /> Restart</GhostButton>
          <div className="w-full sm:w-auto sm:ml-auto flex items-center justify-end gap-1 rounded-xl border border-border p-1">
            {[0.5, 1, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={cn("rounded-lg px-2.5 sm:px-3 py-1 text-xs", speed === s ? "bg-gold text-gold-foreground" : "text-muted-foreground")}>{s}×</button>
            ))}
          </div>
        </div>
        <input
          type="range" min={0} max={SAMPLE.length - 1} value={pos}
          onChange={(e) => { setPos(Number(e.target.value)); setPlaying(false); }}
          className="mt-6 w-full accent-[var(--color-gold)]"
          aria-label="Timeline scrubber"
        />
        <div className="mt-4 grid gap-2">
          {SAMPLE.map((e, i) => (
            <button
              key={i}
              onClick={() => { setPos(i); setPlaying(false); }}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 rounded-xl border px-4 py-2.5 text-left transition-all",
                i === pos ? "border-gold/50 bg-gold/10" : i < pos ? "border-border bg-secondary/30" : "border-border/50 opacity-40",
              )}
            >
              <div className="flex items-center gap-3">
                <Mono className="text-muted-foreground shrink-0">T+{e.t}s</Mono>
                <span className="text-sm font-medium text-foreground">{e.label}</span>
              </div>
              <span className="text-xs text-muted-foreground sm:text-right">{e.chain} · {e.detail}</span>
            </button>
          ))}
        </div>
      </GlassPanel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <GlassPanel className="p-6">
          <h3 className="mb-1 font-display text-lg font-semibold">Rule toggles</h3>
          <p className="mb-4 text-xs text-muted-foreground">Toggle a rule to see how the simulated verdict changes. Shared with the Command Room.</p>
          <div className="space-y-1.5">
            {state.rules.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 hover:bg-secondary/40">
                <span className="text-sm"><Mono className="mr-2 text-muted-foreground">{r.id}</Mono>{r.name}</span>
                <input type="checkbox" checked={r.enabled} onChange={() => dispatch({ type: "TOGGLE_RULE", id: r.id })} className="size-4 accent-[var(--color-gold)]" />
              </label>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel deep className="p-6">
          <h3 className="mb-4 font-display text-lg font-semibold">Before / after comparison</h3>
          {!verdictVisible ? (
            <p className="text-sm text-muted-foreground">Play the replay to the end to evaluate the verdict.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {[{ label: "Default rules", r: before }, { label: "Current rules", r: after }].map(({ label, r }) => (
                <div key={label} className="rounded-xl border border-border p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className={cn("mt-2 font-display text-4xl font-bold", r.score >= 40 ? "text-danger" : r.score >= 20 ? "text-warning" : "text-success")}>{r.score}</p>
                  <p className="text-xs text-muted-foreground">{riskBand(r.score).label}</p>
                  <p className="mt-2 text-xs">{r.score > 0 ? "Alert raised" : "Missed — no alert"}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-[10px] text-muted-foreground">Sample incident is curated demonstration data — not a verified historical benchmark.</p>
        </GlassPanel>
      </div>
    </AppLayout>
  );
}
