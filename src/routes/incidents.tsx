import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, SimBadge, StatusPill, Mono, EmptyState, GhostButton, GoldButton } from "@/components/rift/ui";
import { useRift } from "@/lib/rift/store";
import { riskBand } from "@/lib/rift/engine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/incidents")({
  head: () => ({
    meta: [
      { title: "Incident Investigation — RIFT" },
      { name: "description", content: "Investigate simulated incidents: evidence, triggered rules, risk-score explanation, and notes." },
      { property: "og:title", content: "Incident Investigation — RIFT" },
      { property: "og:description", content: "Simulated incident evidence and risk explanation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Incidents,
});

function Incidents() {
  const { state, dispatch } = useRift();
  const [selectedId, setSelectedId] = useState<string | null>(state.incidents[0]?.id ?? null);
  const [note, setNote] = useState("");
  const inc = state.incidents.find((i) => i.id === selectedId) ?? state.incidents[0];
  const events = inc ? state.events.filter((e) => e.txId === inc.txId) : [];

  return (
    <AppLayout>
      <SectionTitle eyebrow="RIFT Watch" title="Incident Investigation" right={<SimBadge label="SIMULATED RECORDS" />} />

      {state.incidents.length === 0 ? (
        <EmptyState title="No incidents" hint="Launch an attack simulation from the Command Room." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-2">
            {state.incidents.map((i) => (
              <button
                key={i.id}
                onClick={() => setSelectedId(i.id)}
                className={cn("block w-full rounded-2xl border p-4 text-left transition-all", inc?.id === i.id ? "glass-deep border-gold/50" : "glass")}
              >
                <div className="flex items-center justify-between">
                  <Mono className="font-semibold text-foreground">{i.id}</Mono>
                  <StatusPill status={i.status} />
                </div>
                <p className="mt-1 text-sm text-foreground">{i.title}</p>
                <p className="text-xs text-muted-foreground">Risk {i.score} · {i.txId}</p>
              </button>
            ))}
          </div>

          {inc && (
            <div className="space-y-6 lg:col-span-2">
              <GlassPanel deep className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-gold">{inc.id} · {inc.txId}</p>
                    <h3 className="font-display text-2xl font-semibold">{inc.title}</h3>
                    <p className="text-xs text-muted-foreground">Opened {new Date(inc.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-display text-5xl font-bold", inc.score >= 40 ? "text-danger" : inc.score >= 20 ? "text-warning" : "text-success")}>{inc.score}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{riskBand(inc.score).label}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {inc.status !== "investigating" && inc.status !== "resolved" && (
                    <GhostButton onClick={() => dispatch({ type: "SET_INCIDENT_STATUS", id: inc.id, status: "investigating" })}>Begin investigation</GhostButton>
                  )}
                  {inc.status !== "resolved" && (
                    <GoldButton onClick={() => { dispatch({ type: "SET_INCIDENT_STATUS", id: inc.id, status: "resolved" }); dispatch({ type: "AUDIT", actor: "OPERATOR", action: "INCIDENT_RESOLVED", detail: inc.id }); }}>Resolve</GoldButton>
                  )}
                  {inc.status === "resolved" && (
                    <GhostButton onClick={() => dispatch({ type: "SET_INCIDENT_STATUS", id: inc.id, status: "open" })}>Reopen</GhostButton>
                  )}
                </div>
              </GlassPanel>

              <GlassPanel className="p-6">
                <h4 className="mb-3 font-display text-lg font-semibold">Risk-score explanation</h4>
                <div className="space-y-1.5">
                  {inc.contributions.map((c) => (
                    <div key={c.ruleId} className={cn("flex items-center justify-between rounded-lg px-3 py-2 text-sm", c.applied ? "bg-danger/10" : "opacity-50")}>
                      <span><Mono className="mr-2 text-muted-foreground">{c.ruleId}</Mono>{c.name}</span>
                      <span className={cn("font-mono text-xs", c.applied ? "text-danger" : "text-muted-foreground")}>{c.applied ? `+${c.weight}` : "0"}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-border px-3 pt-2 text-sm font-semibold">
                    <span>Total</span><span className="font-mono">{inc.score}</span>
                  </div>
                </div>
              </GlassPanel>

              <GlassPanel className="p-6">
                <h4 className="mb-3 font-display text-lg font-semibold">Evidence</h4>
                <ul className="space-y-2">
                  {inc.evidence.map((e, i) => (
                    <li key={i} className="flex gap-3 text-sm text-foreground"><span className="text-gold">◆</span>{e}</li>
                  ))}
                </ul>
                <h5 className="mb-2 mt-5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Timeline · simulated event records</h5>
                <div className="space-y-1">
                  {events.length === 0 && <p className="text-xs text-muted-foreground">No linked events in the current stream.</p>}
                  {events.map((e) => (
                    <div key={e.id} className="flex justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs">
                      <span className="text-foreground">{e.type} · {e.detail}</span>
                      <Mono className="shrink-0 text-muted-foreground">{e.id}</Mono>
                    </div>
                  ))}
                </div>
              </GlassPanel>

              <GlassPanel className="p-6">
                <h4 className="mb-3 font-display text-lg font-semibold">Investigation notes</h4>
                <ul className="mb-3 space-y-1.5">
                  {inc.notes.length === 0 && <li className="text-xs text-muted-foreground">No notes yet.</li>}
                  {inc.notes.map((n, i) => <li key={i} className="rounded-lg bg-secondary/40 px-3 py-2 text-sm">{n}</li>)}
                </ul>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; dispatch({ type: "ADD_NOTE", id: inc.id, note: note.trim() }); setNote(""); }}
                >
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="flex-1 rounded-xl border border-input bg-secondary/40 px-4 py-2 text-sm outline-none focus:border-gold" />
                  <GoldButton type="submit">Add</GoldButton>
                </form>
              </GlassPanel>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
