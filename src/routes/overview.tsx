import React, { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, Stat, StatusPill, Mono, EmptyState, GoldButton, GhostButton, SimBadge } from "@/components/rift/ui";
import { Sparkline } from "@/components/rift/charts";
import { useRift, CLIENTS, CHAINS } from "@/lib/rift/store";
import { fmtMoney } from "@/lib/rift/data";
import { useAuth } from "@/lib/rift/auth-context";
import {
  fetchRecentLedgerTransactions,
  fetchRecentSecurityFindings,
  type SupabaseLedgerTransaction,
  type SupabaseSecurityFinding,
} from "@/lib/rift/supabase";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  ShieldCheck,
  Play,
  RotateCcw,
  Database,
  ArrowRight,
  TrendingUp,
  Layers,
  AlertTriangle,
  Zap,
  Activity,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview — RIFT" },
      { name: "description", content: "RIFT command overview: live Supabase ledger, CSB-01 exploit breakdown, active incidents, and attack simulation." },
      { property: "og:title", content: "Overview — RIFT" },
      { property: "og:description", content: "Live cross-chain fraud-tracking and exploit detection command centre." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

export function Overview() {
  const { state, dispatch } = useRift();
  const { user } = useAuth();
  const transfers = state.transfers || [];
  const incidents = state.incidents || [];
  const events = state.events || [];

  const [supabaseTxs, setSupabaseTxs] = useState<SupabaseLedgerTransaction[]>([]);
  const [supabaseFindings, setSupabaseFindings] = useState<SupabaseSecurityFinding[]>([]);
  const [simulatingScenario, setSimulatingScenario] = useState<string | null>(null);
  const [simulationToast, setSimulationToast] = useState<string | null>(null);
  const [loadingDb, setLoadingDb] = useState(false);

  // Load real-time Supabase transactions & findings
  const loadDbData = async () => {
    try {
      setLoadingDb(true);
      const [txs, findings] = await Promise.all([
        fetchRecentLedgerTransactions(10),
        fetchRecentSecurityFindings(20),
      ]);
      setSupabaseTxs(txs);
      setSupabaseFindings(findings);
    } catch (e) {
      console.warn("Failed to fetch live Supabase data:", e);
    } finally {
      setLoadingDb(false);
    }
  };

  useEffect(() => {
    loadDbData();
    const iv = setInterval(loadDbData, 10000);
    return () => clearInterval(iv);
  }, []);

  // Exploit Type Breakdown stats
  const exploitBreakdown = {
    signatureForgery: supabaseFindings.filter(
      (f) =>
        f.rule_name?.toLowerCase().includes("signer") ||
        f.rule_id === "POL_UNUSUAL_SIGNER_BEHAVIOR" ||
        f.finding_type?.includes("SIGNATURE"),
    ).length,
    liquidityDraining: supabaseFindings.filter(
      (f) =>
        f.rule_name?.toLowerCase().includes("drain") ||
        f.rule_name?.toLowerCase().includes("spike") ||
        f.rule_id === "POL_VOLUME_SPIKE" ||
        f.rule_id === "POL_RAPID_LIQUIDITY_DRAIN",
    ).length,
    fakeDeposit: supabaseFindings.filter(
      (f) =>
        f.rule_name?.toLowerCase().includes("bridge leg") ||
        f.rule_name?.toLowerCase().includes("inbound") ||
        f.rule_id === "POL_MISMATCHED_BRIDGE_LEG" ||
        f.rule_id === "POL_INBOUND_EXPLOIT_INTERCEPT",
    ).length,
  };

  const totalBreakdown =
    exploitBreakdown.signatureForgery +
    exploitBreakdown.liquidityDraining +
    exploitBreakdown.fakeDeposit || 1;

  // Trigger interactive simulated attack replay
  const handleTriggerAttackReplay = async (scenarioKey: string) => {
    try {
      setSimulatingScenario(scenarioKey);
      let payload = {
        ruleId: "POL_VOLUME_SPIKE",
        ruleName: "POL_VOLUME_SPIKE: Sudden Surge in Transfer Amount (>3x 24h Volume)",
        amount: 500_000,
      };

      if (scenarioKey === "liquidity_drain") {
        payload = {
          ruleId: "POL_RAPID_LIQUIDITY_DRAIN",
          ruleName: "POL_RAPID_LIQUIDITY_DRAIN: High Velocity Drain in 1-Hour Window",
          amount: 850_000,
        };
      } else if (scenarioKey === "compromised_signer") {
        payload = {
          ruleId: "POL_UNUSUAL_SIGNER_BEHAVIOR",
          ruleName: "POL_UNUSUAL_SIGNER_BEHAVIOR: Signer Trust Score Below Safe Threshold (<400)",
          amount: 250_000,
        };
      } else if (scenarioKey === "incompatible_leg") {
        payload = {
          ruleId: "POL_MISMATCHED_BRIDGE_LEG",
          ruleName: "POL_MISMATCHED_BRIDGE_LEG: Incompatible or Unmapped Cross-Chain Bridge Route",
          amount: 400_000,
        };
      }

      const res = await fetch("/api/v1/rift/security-findings/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          senderUserId: user?.id || "1ca32bb1-839a-4d04-9e06-1ed9cc5432c8",
          receiverUserId: "cf1c80fb-1a06-4a9f-9a03-e76f44c92878",
        }),
      });

      const resData = await res.json();
      if (resData.success) {
        setSimulationToast(
          `Attack Replay Intercepted! Exploit ${payload.ruleId} blocked. Two-party alerts inserted for Sender and Receiver in Supabase.`,
        );
        setTimeout(() => setSimulationToast(null), 7000);
        await loadDbData();
      }
    } catch (e) {
      console.error("Simulation failed:", e);
    } finally {
      setSimulatingScenario(null);
    }
  };

  const totalAssets = CLIENTS.reduce(
    (s, c) => s + c.accounts.reduce((a, acc) => a + acc.balance, 0),
    0,
  );
  const volume = transfers.reduce((s, t) => s + t.amount, 0);
  const openIncidents = incidents.filter((i) => i.status !== "resolved");
  const unmatched = events.filter((e) => e.type === "ALERT").length;
  const volumeSeries = events.slice(0, 14).reverse().map((_, i) => 30 + ((i * 37) % 55) + i * 4);

  return (
    <AppLayout>
      <SectionTitle
        eyebrow="Command & Intelligence"
        title="Live Fraud Overview"
        right={<SimBadge label="CHAINALYSIS CSB-01 INTEGRATION" />}
      />

      {/* Simulation Feedback Alert */}
      {simulationToast && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-rose-500/50 bg-rose-500/15 p-4 text-xs font-semibold text-rose-200 backdrop-blur-md shadow-lg shadow-rose-500/10 animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="flex size-3 rounded-full bg-rose-500 animate-ping" />
            <span>{simulationToast}</span>
          </div>
          <button
            onClick={() => setSimulationToast(null)}
            className="text-rose-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Level Metric Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total Monitored Assets"
          value={fmtMoney(totalAssets)}
          sub="Institutional Vault Reserves"
          tone="gold"
        />
        <Stat
          label="Bridge Transfer Volume"
          value={fmtMoney(volume)}
          sub={`${transfers.length} monitored operations`}
        />
        <Stat
          label="Supabase Security Alerts"
          value={String(supabaseFindings.length)}
          sub="Two-party recorded alerts"
          tone={supabaseFindings.length > 0 ? "danger" : "success"}
        />
        <Stat
          label="Ledger Ingested TXs"
          value={String(supabaseTxs.length)}
          sub="Live synced from RIFT Bank"
          tone="gold"
        />
      </div>

      {/* CSB-01 Exploit Breakdown & Attack Replay Section */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* CSB-01 Exploit Breakdown Chart */}
        <GlassPanel className="p-4 sm:p-6 lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base sm:text-lg font-semibold text-foreground">
              Exploit Type Breakdown
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gold">CSB-01</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Categorization of cross-chain exploit vectors intercepted by RIFT heuristics:
          </p>

          <div className="space-y-4">
            {/* Liquidity Draining & Surge */}
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-foreground">Liquidity Draining / Spike</span>
                <span className="text-gold">
                  {exploitBreakdown.liquidityDraining} alerts (
                  {Math.round((exploitBreakdown.liquidityDraining / totalBreakdown) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-gold transition-all duration-500"
                  style={{
                    width: `${Math.max(10, Math.round((exploitBreakdown.liquidityDraining / totalBreakdown) * 100))}%`,
                  }}
                />
              </div>
            </div>

            {/* Signature Forgery / Signer Anomaly */}
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-foreground">Signature Forgery / Key Misuse</span>
                <span className="text-rose-400">
                  {exploitBreakdown.signatureForgery} alerts (
                  {Math.round((exploitBreakdown.signatureForgery / totalBreakdown) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-rose-500 transition-all duration-500"
                  style={{
                    width: `${Math.max(10, Math.round((exploitBreakdown.signatureForgery / totalBreakdown) * 100))}%`,
                  }}
                />
              </div>
            </div>

            {/* Fake Deposit / Route Incompatibility */}
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-foreground">Fake Deposit / Unmapped Leg</span>
                <span className="text-amber-400">
                  {exploitBreakdown.fakeDeposit} alerts (
                  {Math.round((exploitBreakdown.fakeDeposit / totalBreakdown) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-500"
                  style={{
                    width: `${Math.max(10, Math.round((exploitBreakdown.fakeDeposit / totalBreakdown) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-border bg-card/40 p-3 text-xs text-muted-foreground flex items-center justify-between">
            <span>Database Table:</span>
            <Mono className="text-gold text-[11px]">rift_security_findings</Mono>
          </div>
        </GlassPanel>

        {/* Interactive Attack Replay Launcher */}
        <GlassPanel className="p-4 sm:p-6 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400">
                Simulated Exploit Replay
              </p>
              <h3 className="font-display text-base sm:text-lg font-bold text-foreground">
                Trigger Real-Time CSB-01 Bridge Exploit Tests
              </h3>
            </div>
            <Link to="/replay">
              <GhostButton className="text-xs py-1.5 px-3">Full Replay Lab →</GhostButton>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Execute simulated exploit attempts through RIFT's live detection engine. Verifies invariant
            halts and triggers two-party alert records in Supabase:
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => handleTriggerAttackReplay("volume_spike")}
              disabled={simulatingScenario !== null}
              className="flex flex-col text-left rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 hover:bg-rose-500/20 transition-all disabled:opacity-50"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs text-rose-300 flex items-center gap-1.5">
                  <Zap className="size-3.5" /> 5x Volume Spike
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">POL_VOLUME_SPIKE</span>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">
                Simulate sudden surge in transfer amount exceeding 3x 24h baseline. Intercepts transaction & alerts both parties.
              </p>
              <span className="mt-2 text-[10px] font-bold text-rose-400">
                {simulatingScenario === "volume_spike" ? "Executing..." : "Trigger Attack Replay →"}
              </span>
            </button>

            <button
              onClick={() => handleTriggerAttackReplay("liquidity_drain")}
              disabled={simulatingScenario !== null}
              className="flex flex-col text-left rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 hover:bg-amber-500/20 transition-all disabled:opacity-50"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs text-amber-300 flex items-center gap-1.5">
                  <TrendingUp className="size-3.5" /> Rapid Liquidity Drain
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">POL_RAPID_LIQUIDITY_DRAIN</span>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">
                Simulate high transaction frequency (&gt;5 in 1h window) draining pool liquidity reserves.
              </p>
              <span className="mt-2 text-[10px] font-bold text-amber-400">
                {simulatingScenario === "liquidity_drain" ? "Executing..." : "Trigger Attack Replay →"}
              </span>
            </button>

            <button
              onClick={() => handleTriggerAttackReplay("compromised_signer")}
              disabled={simulatingScenario !== null}
              className="flex flex-col text-left rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 hover:bg-rose-500/20 transition-all disabled:opacity-50"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5" /> Compromised Low-Trust Signer
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">POL_UNUSUAL_SIGNER_BEHAVIOR</span>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">
                Simulate degraded signer reputation (trust score &lt;400) or new profile executing cross-chain bridge transfer.
              </p>
              <span className="mt-2 text-[10px] font-bold text-rose-400">
                {simulatingScenario === "compromised_signer" ? "Executing..." : "Trigger Attack Replay →"}
              </span>
            </button>

            <button
              onClick={() => handleTriggerAttackReplay("incompatible_leg")}
              disabled={simulatingScenario !== null}
              className="flex flex-col text-left rounded-xl border border-gold/30 bg-gold/10 p-3.5 hover:bg-gold/20 transition-all disabled:opacity-50"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs text-gold flex items-center gap-1.5">
                  <Layers className="size-3.5" /> Fake Deposit / Incompatible Leg
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">POL_MISMATCHED_BRIDGE_LEG</span>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">
                Simulate cross-chain claim with incompatible or unmapped destination chain routing.
              </p>
              <span className="mt-2 text-[10px] font-bold text-gold">
                {simulatingScenario === "incompatible_leg" ? "Executing..." : "Trigger Attack Replay →"}
              </span>
            </button>
          </div>
        </GlassPanel>
      </div>

      {/* Live Ingested Transactions from Shared Supabase Ledger */}
      <div className="mt-6">
        <GlassPanel className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Database className="size-4 text-emerald-400" />
                <h3 className="font-display text-base sm:text-lg font-semibold text-foreground">
                  Live Shared Ledger Feed (Supabase `ledger_transactions`)
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Authoritative transaction stream ingested directly from RIFT Bank core ledger.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                POSTGREST SYNC ACTIVE
              </span>
              <button
                onClick={loadDbData}
                className="text-xs text-muted-foreground hover:text-foreground p-1.5"
                title="Refresh ledger data"
              >
                <RotateCcw className={cn("size-3.5", loadingDb && "animate-spin")} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {supabaseTxs.length === 0 ? (
              <EmptyState
                title="No database transactions found"
                hint="Transactions submitted from RIFT Bank will appear here."
              />
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-3 font-semibold">TX ID</th>
                    <th className="pb-3 font-semibold">Type</th>
                    <th className="pb-3 font-semibold">Amount</th>
                    <th className="pb-3 font-semibold">Currency</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold">RIFT Status</th>
                    <th className="pb-3 font-semibold text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {supabaseTxs.map((tx) => (
                    <tr key={tx.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-3">
                        <Mono className="text-[11px] text-foreground">{tx.id.slice(0, 13)}…</Mono>
                      </td>
                      <td className="py-3 font-medium text-foreground">{tx.transaction_type}</td>
                      <td className="py-3 font-mono font-bold text-gold">
                        {(tx.amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 font-mono text-muted-foreground">{tx.currency_id}</td>
                      <td className="py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase",
                            tx.status === "COMPLETED"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : tx.status === "REJECTED"
                                ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                : "bg-amber-500/15 text-amber-300 border border-amber-500/30",
                          )}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {tx.rift_status || "N/A"}
                        </span>
                      </td>
                      <td className="py-3 text-right text-[11px] text-muted-foreground">
                        {new Date(tx.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </GlassPanel>
      </div>

      {/* Recent Activity & Chain Status */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <GlassPanel className="p-4 sm:p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base sm:text-lg font-semibold">Transaction Volume Activity</h3>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Simulated Timeline</span>
          </div>
          <Sparkline data={volumeSeries.length > 1 ? volumeSeries : [10, 20, 35, 30, 48, 60]} height={90} />
          <div className="mt-6 space-y-2">
            <p className="text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Recent Security Events</p>
            {events.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3 sm:px-4 sm:py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs sm:text-sm text-foreground">{e.detail}</p>
                  <Mono className="text-muted-foreground text-[10px] sm:text-xs">{e.chain} · {e.txId}</Mono>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</span>
              </div>
            ))}
            {events.length === 0 && <EmptyState title="No activity yet" hint="Create a transfer or launch an attack simulation." />}
          </div>
        </GlassPanel>

        <div className="space-y-6">
          <GlassPanel className="p-6">
            <h3 className="mb-4 font-display text-lg font-semibold">Monitored Bridge Networks</h3>
            <ul className="space-y-3">
              {CHAINS.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{c.latencyMs}s</span>
                    <StatusPill status={c.status} />
                  </div>
                </li>
              ))}
            </ul>
          </GlassPanel>

          <GlassPanel className="p-6">
            <h3 className="mb-4 font-display text-lg font-semibold">Incident Queue</h3>
            {openIncidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Queue clear. All detections resolved.</p>
            ) : (
              <ul className="space-y-2">
                {openIncidents.slice(0, 4).map((i) => (
                  <li key={i.id}>
                    <Link to="/incidents" className="block rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 transition-colors hover:bg-danger/10">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{i.title}</span>
                        <span className="font-mono text-xs text-danger">{i.score}</span>
                      </div>
                      <Mono className="text-muted-foreground">{i.id} · {i.txId}</Mono>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>
        </div>
      </div>
    </AppLayout>
  );
}
export default Overview;
