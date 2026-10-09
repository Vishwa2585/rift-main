import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, SimBadge, Mono, EmptyState } from "@/components/rift/ui";
import { useRift } from "@/lib/rift/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Ledger — RIFT" },
      { name: "description", content: "Chronological audit ledger of every simulated action in the RIFT demo." },
      { property: "og:title", content: "Audit Ledger — RIFT" },
      { property: "og:description", content: "Simulated audit trail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Audit,
});

function Audit() {
  const { state } = useRift();
  const [actor, setActor] = useState("all");
  const actors = ["all", ...Array.from(new Set(state.audit.map((a) => a.actor)))];
  const rows = state.audit.filter((a) => actor === "all" || a.actor === actor);
  return (
    <AppLayout>
      <SectionTitle eyebrow="Compliance" title="Audit Ledger" right={<SimBadge />} />
      <div className="mb-4 flex flex-wrap gap-2">
        {actors.map((a) => (
          <button key={a} onClick={() => setActor(a)} className={cn("rounded-full border px-4 py-1.5 text-xs", actor === a ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground")}>{a}</button>
        ))}
      </div>
      <GlassPanel className="overflow-hidden">
        {rows.length === 0 ? <div className="p-6"><EmptyState title="No entries" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                <tr><th className="px-5 py-3">ID</th><th className="px-5 py-3">Time</th><th className="px-5 py-3">Actor</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Detail</th></tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
                    <td className="px-5 py-3"><Mono>{a.id}</Mono></td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</td>
                    <td className="px-5 py-3 text-gold">{a.actor}</td>
                    <td className="px-5 py-3"><Mono>{a.action}</Mono></td>
                    <td className="px-5 py-3 text-muted-foreground">{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </AppLayout>
  );
}
