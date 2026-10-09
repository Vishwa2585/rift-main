import React, { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, SimBadge, StatusPill, Mono, EmptyState, GhostButton, GoldButton } from "@/components/rift/ui";
import { useRift, riskBand } from "@/lib/rift/store";
import { cn } from "@/lib/utils";
import {
  Download,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Lock,
  Unlock,
  ExternalLink,
  SlidersHorizontal,
  ChevronRight,
  ArrowRight,
  FileText,
  Clock,
  Layers,
} from "lucide-react";

export const Route = createFileRoute("/incidents")({
  head: () => ({
    meta: [
      { title: "Incident Investigation Room — RIFT" },
      { name: "description", content: "Deep investigation room: evidence inspection, expected vs observed rule explanation, timeline, and audit response actions." },
      { property: "og:title", content: "Incident Investigation Room — RIFT" },
      { property: "og:description", content: "Detailed cross-chain incident evidence and response." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Incidents,
});

function Incidents() {
  const { state, dispatch } = useRift();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(state.incidents[0]?.id ?? null);
  const [noteText, setNoteText] = useState("");
  const [showFalsePositiveModal, setShowFalsePositiveModal] = useState(false);
  const [fpJustification, setFpJustification] = useState("");
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);

  const inc = state.incidents.find((i) => i.id === selectedId) ?? state.incidents[0];
  const pair = inc?.correlatedPair;

  // Export incident evidence as JSON artifact
  const exportEvidence = () => {
    if (!inc) return;
    const exportData = {
      incidentId: inc.id,
      title: inc.title,
      anomalyType: inc.anomalyType,
      severity: inc.severity,
      riskScore: inc.score,
      dataSource: inc.dataSource,
      status: inc.status,
      detectedAt: new Date(inc.createdAt).toISOString(),
      correlatedPair: inc.correlatedPair,
      ruleEvaluation: inc.ruleResults,
      evidence: inc.evidence,
      evidenceLimitations: inc.evidenceLimitations,
      investigationTimeline: inc.timeline,
      investigatorNotes: inc.notes,
      falsePositiveJustification: inc.falsePositiveJustification,
      exportedAt: new Date().toISOString(),
      softwareVersion: "RIFT Core v2.4 (FUSION 2026)",
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RIFT-Incident-${inc.id}-Evidence.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    dispatch({
      type: "AUDIT",
      actor: "OPERATOR",
      action: "EVIDENCE_EXPORTED",
      detail: `Downloaded evidence package for ${inc.id}`,
    });
  };

  const submitFalsePositive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inc || !fpJustification.trim()) return;
    dispatch({
      type: "SET_INCIDENT_STATUS",
      id: inc.id,
      status: "false_positive",
      note: `Classified False Positive: ${fpJustification.trim()}`,
    });
    setFpJustification("");
    setShowFalsePositiveModal(false);
  };

  return (
    <AppLayout>
      <SectionTitle
        eyebrow="RIFT Watch"
        title="Incident Investigation Room"
        right={<SimBadge label={`DATA SOURCE: ${inc?.dataSource || state.dataSource}`} />}
      />

      {state.incidents.length === 0 ? (
        <EmptyState title="No active incidents" hint="Launch an attack simulation from the Command Room to evaluate detector." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: Incident List (4 cols) */}
          <div className="space-y-2.5 lg:col-span-4 max-h-[380px] lg:max-h-none overflow-y-auto pr-1">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-[11px] font-mono uppercase text-muted-foreground">INCIDENT QUEUE ({state.incidents.length})</span>
              <span className="text-[10px] text-muted-foreground">Select to investigate</span>
            </div>

            {state.incidents.map((i) => {
              const band = riskBand(i.score);
              const isSelected = inc?.id === i.id;
              return (
                <button
                  key={i.id}
                  onClick={() => setSelectedId(i.id)}
                  className={cn(
                    "block w-full rounded-2xl border p-4 text-left transition-all",
                    isSelected
                      ? "border-gold/60 bg-gold/10 shadow-md ring-1 ring-gold/40"
                      : "border-border bg-secondary/30 hover:border-gold/30 hover:bg-secondary/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Mono className="font-bold text-foreground">{i.id}</Mono>
                    <span className={cn(
                      "rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase",
                      i.status === "open" ? "bg-danger/20 text-danger ring-1 ring-danger/40" :
                      i.status === "investigating" ? "bg-warning/20 text-warning" :
                      i.status === "false_positive" ? "bg-secondary text-muted-foreground" :
                      "bg-success/20 text-success",
                    )}>
                      {i.status.replace("_", " ")}
                    </span>
                  </div>

                  <p className="mt-1.5 font-semibold text-foreground text-sm line-clamp-1">{i.title}</p>

                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span className={cn("font-bold font-mono", i.score >= 40 ? "text-danger" : i.score >= 20 ? "text-warning" : "text-success")}>
                      Risk {i.score} · {band.label}
                    </span>
                    <span className="font-mono text-[10px]">{i.txId}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Column: Detailed Investigation View (8 cols) */}
          {inc && (
            <div className="space-y-6 lg:col-span-8">
              {/* A. INCIDENT SUMMARY */}
              <GlassPanel deep className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-gold/20 px-2 py-0.5 font-mono text-[11px] font-bold uppercase text-gold">
                        {inc.id}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">Tx: {inc.txId}</span>
                      <span className="rounded bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                        {inc.dataSource}
                      </span>
                    </div>

                    <h3 className="mt-2 font-display text-2xl font-bold text-foreground">{inc.title}</h3>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="size-3.5" /> Detected: {new Date(inc.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className={cn(
                      "font-display text-5xl font-black tracking-tight",
                      inc.score >= 60 ? "text-danger" : inc.score >= 35 ? "text-warning" : "text-success"
                    )}>
                      {inc.score}
                    </p>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {riskBand(inc.score).label} RISK
                    </p>
                  </div>
                </div>

                {/* Working Response Actions Panel */}
                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border/80 pt-5">
                  {inc.status === "open" && (
                    <button
                      onClick={() => {
                        dispatch({ type: "SET_INCIDENT_STATUS", id: inc.id, status: "investigating", note: "Operator acknowledged alert and initiated investigation." });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-warning px-3.5 py-2 text-xs font-bold text-warning-foreground shadow hover:opacity-95"
                    >
                      <AlertTriangle className="size-3.5" /> Acknowledge Alert
                    </button>
                  )}

                  {inc.status !== "investigating" && inc.status !== "resolved" && inc.status !== "false_positive" && (
                    <GhostButton onClick={() => dispatch({ type: "SET_INCIDENT_STATUS", id: inc.id, status: "investigating" })}>
                      Mark Investigating
                    </GhostButton>
                  )}

                  {inc.status !== "resolved" && (
                    <GoldButton onClick={() => {
                      dispatch({ type: "SET_INCIDENT_STATUS", id: inc.id, status: "resolved", note: "Incident verified and resolved by security analyst." });
                    }}>
                      <CheckCircle2 className="size-3.5" /> Resolve Incident
                    </GoldButton>
                  )}

                  {inc.status !== "false_positive" && (
                    <button
                      onClick={() => setShowFalsePositiveModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-danger/40 hover:text-danger"
                    >
                      <HelpCircle className="size-3.5" /> Mark False Positive…
                    </button>
                  )}

                  {/* Export Evidence Artifact */}
                  <button
                    onClick={exportEvidence}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gold/40 bg-gold/10 px-3.5 py-2 text-xs font-bold text-gold hover:bg-gold/20"
                    title="Export complete structured evidence package as JSON"
                  >
                    <Download className="size-3.5" /> Export Evidence
                  </button>

                  {/* Emergency Demonstration Operations Containment Toggle */}
                  <button
                    onClick={() => dispatch({ type: "TOGGLE_OPERATIONS_HELD" })}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all",
                      state.operationsHeld
                        ? "border-warning bg-warning/20 text-warning"
                        : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground",
                    )}
                    title="Simulated containment response: hold new demonstration transfers"
                  >
                    {state.operationsHeld ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                    {state.operationsHeld ? "Resume Operations" : "Hold New Operations"}
                  </button>

                  <button
                    onClick={() => setShowRulesDrawer(!showRulesDrawer)}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-secondary/30 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground"
                    title="View and configure detection rules"
                  >
                    <SlidersHorizontal className="size-3.5" /> Rules
                  </button>
                </div>
              </GlassPanel>

              {/* B. EVENT EVIDENCE & CROSS-CHAIN PATH */}
              <GlassPanel className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="font-display text-lg font-bold">Cross-Chain Event Evidence</h4>
                  <span className="font-mono text-xs text-gold">Bridge Message: {pair?.bridgeMsgId || "MSG-88412"}</span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Source Event Card */}
                  <div className="rounded-xl border border-border bg-secondary/20 p-4">
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <span className="font-mono text-xs font-bold uppercase text-foreground">
                        Source Chain: {pair?.sourceEvent?.chain || "Ethereum"}
                      </span>
                      <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        LOCK / DEPOSIT
                      </span>
                    </div>

                    {pair?.sourceEvent ? (
                      <div className="mt-3 space-y-2 text-xs">
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                          <span className="text-muted-foreground">Tx Hash:</span>
                          <Mono className="text-foreground break-all">{pair.sourceEvent.txHash.slice(0, 16)}…</Mono>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                          <span className="text-muted-foreground">Amount:</span>
                          <span className="font-bold text-foreground">{pair.sourceEvent.amount.toLocaleString()} {pair.sourceEvent.token}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                          <span className="text-muted-foreground">Sender:</span>
                          <Mono className="text-muted-foreground break-all">{pair.sourceEvent.sender}</Mono>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                          <span className="text-muted-foreground">Target Recipient:</span>
                          <Mono className="text-foreground break-all">{pair.sourceEvent.recipient}</Mono>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                          <span className="text-muted-foreground">Block & Finality:</span>
                          <span className="font-mono text-foreground">Block {pair.sourceEvent.blockNumber} ({pair.sourceEvent.confirmations}/{pair.sourceEvent.requiredConfirmations} conf)</span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-center text-xs text-danger">
                        NO SOURCE EVENT OBSERVED (Orphan Destination Withdrawal)
                      </div>
                    )}
                  </div>

                  {/* Destination Event Card */}
                  <div className="rounded-xl border border-border bg-secondary/20 p-4">
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <span className="font-mono text-xs font-bold uppercase text-foreground">
                        Dest Chain: {pair?.destEvent?.chain || "Arbitrum"}
                      </span>
                      <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        MINT / WITHDRAWAL
                      </span>
                    </div>

                    {pair?.destEvent ? (
                      <div className="mt-3 space-y-2 text-xs">
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                          <span className="text-muted-foreground">Tx Hash:</span>
                          <Mono className="text-foreground break-all">{pair.destEvent.txHash.slice(0, 16)}…</Mono>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                          <span className="text-muted-foreground">Amount:</span>
                          <span className="font-bold text-foreground">{pair.destEvent.amount.toLocaleString()} {pair.destEvent.token}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                          <span className="text-muted-foreground">Observed Recipient:</span>
                          <Mono className={cn("font-bold break-all", pair.sourceEvent && pair.destEvent.recipient !== pair.sourceEvent.recipient ? "text-danger" : "text-foreground")}>
                            {pair.destEvent.recipient}
                          </Mono>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                          <span className="text-muted-foreground">Token Contract:</span>
                          <span className="font-mono text-foreground break-all">{pair.destEvent.token}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                          <span className="text-muted-foreground">Block Number:</span>
                          <span className="font-mono text-foreground">Block {pair.destEvent.blockNumber}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-center text-xs text-warning">
                        DESTINATION EVENT MISSING (Timed out after 15s window)
                      </div>
                    )}
                  </div>
                </div>

                {/* Correlation Visual Path */}
                <div className="mt-4 rounded-xl border border-border bg-secondary/10 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-mono">CORRELATION STATUS:</span>
                    <span className={cn(
                      "font-bold font-mono uppercase",
                      pair?.status === "matched" ? "text-success" : "text-danger"
                    )}>
                      {pair?.status || "MATCHED"}
                    </span>
                  </div>
                  {pair?.timeDeltaMs && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Cross-chain transmission delta: {(pair.timeDeltaMs / 1000).toFixed(2)}s
                    </p>
                  )}
                </div>
              </GlassPanel>

              {/* C. DETECTION EXPLANATION: EXPECTED VS OBSERVED */}
              <GlassPanel className="p-6">
                <h4 className="mb-2 font-display text-lg font-bold">Rule Evaluation & Divergence Explanation</h4>
                <p className="mb-4 text-xs text-muted-foreground">
                  Deterministic conditions evaluated against the cross-chain evidence:
                </p>

                <div className="space-y-3">
                  {inc.ruleResults.filter((r) => r.triggered).map((r) => (
                    <div key={r.ruleId} className="rounded-xl border border-danger/40 bg-danger/10 p-4">
                      <div className="flex items-center justify-between pb-2 border-b border-danger/20">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-danger">{r.ruleId}</span>
                          <span className="font-semibold text-foreground text-sm">{r.ruleName}</span>
                        </div>
                        <span className="rounded bg-danger/20 px-2 py-0.5 font-mono text-xs font-bold text-danger">
                          +{r.riskContribution} PTS
                        </span>
                      </div>

                      <p className="mt-2.5 text-xs text-foreground font-medium">{r.reason}</p>

                      {/* Expected vs Observed Callout Boxes */}
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                        <div className="rounded-lg border border-border bg-secondary/40 p-2.5">
                          <span className="text-[10px] font-mono uppercase text-muted-foreground">EXPECTED VALUE</span>
                          <p className="mt-0.5 font-mono font-semibold text-foreground">{r.expectedValue || "Valid matching invariant"}</p>
                        </div>
                        <div className="rounded-lg border border-danger/30 bg-danger/20 p-2.5">
                          <span className="text-[10px] font-mono uppercase text-danger">OBSERVED VALUE</span>
                          <p className="mt-0.5 font-mono font-bold text-danger">{r.observedValue || "Violation observed"}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {inc.ruleResults.filter((r) => !r.triggered).map((r) => (
                    <div key={r.ruleId} className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 px-3 py-2 text-xs opacity-60">
                      <span className="text-muted-foreground">
                        <Mono className="mr-2">{r.ruleId}</Mono> {r.ruleName}: {r.reason}
                      </span>
                      <span className="font-mono text-muted-foreground">0 PTS</span>
                    </div>
                  ))}
                </div>

                {inc.evidenceLimitations && inc.evidenceLimitations.length > 0 && (
                  <div className="mt-4 rounded-xl border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground mb-1">Evidence Limitations:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {inc.evidenceLimitations.map((lim, idx) => (
                        <li key={idx}>{lim}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </GlassPanel>

              {/* E. INCIDENT TIMELINE */}
              <GlassPanel className="p-6">
                <h4 className="mb-4 font-display text-lg font-bold">Investigation Audit Timeline</h4>
                <div className="relative space-y-3 pl-4 border-l-2 border-border/80">
                  {inc.timeline.map((entry, idx) => (
                    <div key={idx} className="relative group">
                      <div className={cn(
                        "absolute -left-[21px] top-1 size-2.5 rounded-full ring-4 ring-background",
                        entry.status === "alert" ? "bg-danger" :
                        entry.status === "warning" ? "bg-warning" :
                        entry.status === "action" ? "bg-gold" : "bg-muted-foreground"
                      )} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold uppercase text-foreground">{entry.step}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
                    </div>
                  ))}
                </div>
              </GlassPanel>

              {/* INVESTIGATION NOTES */}
              <GlassPanel className="p-6">
                <h4 className="mb-3 font-display text-lg font-bold">Analyst Notes & Logged Justifications</h4>
                <div className="space-y-2 mb-4">
                  {inc.notes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No notes recorded for this incident.</p>
                  ) : (
                    inc.notes.map((n, i) => (
                      <div key={i} className="rounded-xl border border-border bg-secondary/30 p-3 text-xs text-foreground">
                        {n}
                      </div>
                    ))
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!noteText.trim()) return;
                    dispatch({ type: "ADD_NOTE", id: inc.id, note: noteText.trim() });
                    setNoteText("");
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Enter analyst note…"
                    className="flex-1 rounded-xl border border-input bg-secondary/40 px-4 py-2 text-xs outline-none focus:border-gold"
                  />
                  <GoldButton type="submit">Add Note</GoldButton>
                </form>
              </GlassPanel>
            </div>
          )}
        </div>
      )}

      {/* False Positive Required Justification Modal */}
      {showFalsePositiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-gold/40 bg-background p-6 shadow-2xl">
            <h4 className="font-display text-xl font-bold text-foreground">Mark False Positive</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              A written justification is strictly required to archive this alert as a false positive.
            </p>

            <form onSubmit={submitFalsePositive} className="mt-4 space-y-4">
              <textarea
                value={fpJustification}
                onChange={(e) => setFpJustification(e.target.value)}
                required
                rows={3}
                placeholder="Explain why this anomaly was expected or benign (e.g. authorized router migration, known fee adjustment)…"
                className="w-full rounded-xl border border-input bg-secondary/40 p-3 text-xs outline-none focus:border-gold"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFalsePositiveModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-danger px-4 py-2 text-xs font-bold text-white hover:bg-danger/90"
                >
                  Confirm False Positive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rules Drawer / Modal */}
      {showRulesDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="font-display text-lg font-bold">Detection Rules Configuration</h4>
              <button onClick={() => setShowRulesDrawer(false)} className="text-muted-foreground hover:text-foreground text-xs font-mono">
                CLOSE [×]
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {state.rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Mono className="font-bold text-xs text-gold">{rule.id}</Mono>
                      <span className="text-xs font-semibold text-foreground">{rule.name}</span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase font-mono text-muted-foreground">{rule.severity}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{rule.description}</p>
                  </div>
                  <button
                    onClick={() => dispatch({ type: "TOGGLE_RULE", id: rule.id })}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-mono font-bold transition-all",
                      rule.enabled ? "bg-success/20 text-success border border-success/30" : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {rule.enabled ? "ENABLED" : "DISABLED"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
