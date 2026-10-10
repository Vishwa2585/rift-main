import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, Stat, StatusPill, Mono, EmptyState } from "@/components/rift/ui";
import { Sparkline } from "@/components/rift/charts";
import { useRift, CLIENTS, CHAINS } from "@/lib/rift/store";
import { fmtMoney } from "@/lib/rift/data";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview — RIFT" },
      { name: "description", content: "RIFT command overview: simulated assets, transaction volume, active incidents, and chain status." },
      { property: "og:title", content: "Overview — RIFT" },
      { property: "og:description", content: "Simulated interchain fraud-tracking overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { state } = useRift();
  const transfers = state.transfers || [];
  const incidents = state.incidents || [];
  const events = state.events || [];
  const totalAssets = CLIENTS.reduce((s, c) => s + c.accounts.reduce((a, acc) => a + acc.balance, 0), 0);
  const volume = transfers.reduce((s, t) => s + t.amount, 0);
  const openIncidents = incidents.filter((i) => i.status !== "resolved");
  const unmatched = events.filter((e) => e.type === "ALERT").length;
  const volumeSeries = events.slice(0, 14).reverse().map((_, i) => 30 + ((i * 37) % 55) + i * 4);

  return (
    <AppLayout>
      <SectionTitle eyebrow="Command" title="Overview" />

      <div className="grid gap-3 sm:gap-4 grid-cols-2 xl:grid-cols-4">
        <Stat label="Total Simulated Assets" value={fmtMoney(totalAssets)} sub="Across 6 fictional clients" tone="gold" />
        <Stat label="Simulated Volume" value={fmtMoney(volume)} sub={`${state.transfers.length} transfers`} />
        <Stat label="Active Incidents" value={String(openIncidents.length)} sub="Simulated detection" tone={openIncidents.length ? "danger" : "success"} />
        <Stat label="Unmatched Events" value={String(unmatched)} sub="Awaiting correlation" tone={unmatched ? "danger" : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <GlassPanel className="p-4 sm:p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base sm:text-lg font-semibold">Transaction Volume</h3>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Simulated</span>
          </div>
          <Sparkline data={volumeSeries.length > 1 ? volumeSeries : [10, 20, 35, 30, 48, 60]} height={90} />
          <div className="mt-6 space-y-2">
            <p className="text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Recent Activity</p>
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
            <h3 className="mb-4 font-display text-lg font-semibold">Chain Status</h3>
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
              <p className="text-sm text-muted-foreground">Queue clear. All simulated detections resolved.</p>
            ) : (
              <ul className="space-y-2">
                {openIncidents.map((i) => (
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
