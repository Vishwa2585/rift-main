import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, SimBadge, Stat } from "@/components/rift/ui";
import { Bars, Donut, Sparkline } from "@/components/rift/charts";
import { useRift, CLIENTS } from "@/lib/rift/store";
import { riskBand } from "@/lib/rift/engine";
import { fmtMoney } from "@/lib/rift/data";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — RIFT" },
      { name: "description", content: "Risk distribution, chain volume, and detection analytics derived from the RIFT demo state." },
      { property: "og:title", content: "Analytics — RIFT" },
      { property: "og:description", content: "Simulated risk and volume analytics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Analytics,
});

function Analytics() {
  const { state } = useRift();
  const bands = { LOW: 0, ELEVATED: 0, HIGH: 0, CRITICAL: 0 } as Record<string, number>;
  state.incidents.forEach((i) => { const b = riskBand(i.score).label; bands[b] = (bands[b] ?? 0) + 1; });
  const byChain: Record<string, number> = {};
  state.events.forEach((e) => { byChain[e.chain] = (byChain[e.chain] ?? 0) + 1; });
  const ruleHits: Record<string, number> = {};
  state.incidents.forEach((i) => i.contributions.forEach((c) => { if (c.applied) ruleHits[c.ruleId] = (ruleHits[c.ruleId] ?? 0) + 1; }));
  const totalIncidents = state.incidents.length || 1;

  return (
    <AppLayout>
      <SectionTitle eyebrow="Insight" title="Analytics" right={<SimBadge label="DERIVED FROM DEMO STATE" />} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Incidents" value={String(state.incidents.length)} />
        <Stat label="Average risk" value={String(Math.round(state.incidents.reduce((s, i) => s + i.score, 0) / totalIncidents))} tone="gold" />
        <Stat label="Clients under watch" value={String(CLIENTS.length)} sub={fmtMoney(CLIENTS.reduce((s, c) => s + c.netWorthB * 1e9, 0)) + " fictional net worth"} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <GlassPanel className="p-6">
          <h3 className="mb-6 font-display text-lg font-semibold">Risk distribution</h3>
          <Bars data={Object.entries(bands).map(([label, value]) => ({ label, value, tone: label === "CRITICAL" || label === "HIGH" ? "danger" : "gold" }))} />
        </GlassPanel>
        <GlassPanel className="p-6">
          <h3 className="mb-6 font-display text-lg font-semibold">Events by chain</h3>
          <Bars data={Object.entries(byChain).map(([label, value]) => ({ label: label.slice(0, 8), value }))} />
        </GlassPanel>
        <GlassPanel className="p-6">
          <h3 className="mb-6 font-display text-lg font-semibold">Rule activations</h3>
          <Bars data={state.rules.map((r) => ({ label: r.id, value: ruleHits[r.id] ?? 0, tone: r.enabled ? "gold" : "muted" }))} />
        </GlassPanel>
        <GlassPanel className="p-6">
          <h3 className="mb-6 font-display text-lg font-semibold">Aggregate allocation</h3>
          <Donut slices={["Equities", "Real Assets", "Digital Assets", "Cash & Bonds"].map((label) => ({
            label, pct: Math.round(CLIENTS.reduce((s, c) => s + (c.allocation.find((a) => a.label === label)?.pct ?? 0), 0) / CLIENTS.length),
          }))} />
          <div className="mt-6"><Sparkline data={state.incidents.map((i) => i.score).reverse().concat([0]).slice(-12)} /></div>
          <p className="mt-1 text-[10px] text-muted-foreground">Risk score per incident over time</p>
        </GlassPanel>
      </div>
    </AppLayout>
  );
}
