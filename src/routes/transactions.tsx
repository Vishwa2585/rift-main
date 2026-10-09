import React, { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, StatusPill, Mono, EmptyState, GhostButton } from "@/components/rift/ui";
import { useRift, CLIENTS, CHAINS } from "@/lib/rift/store";
import { fmtMoney } from "@/lib/rift/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — RIFT" },
      { name: "description", content: "Simulated transfer history with filters, details, and approvals." },
      { property: "og:title", content: "Transactions — RIFT" },
      { property: "og:description", content: "Simulated interchain transfer history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Transactions,
});

function Transactions() {
  const { state, dispatch } = useRift();
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(
    () => state.transfers.filter((t) => filter === "all" || t.status === filter),
    [state.transfers, filter],
  );
  const tx = state.transfers.find((t) => t.id === selected) ?? null;

  return (
    <AppLayout>
      <SectionTitle eyebrow="Ledger" title="Transactions" right={<Link to="/bank"><GhostButton>New transfer</GhostButton></Link>} />

      <div className="mb-5 flex flex-wrap gap-2">
        {["all", "pending", "authorized", "completed", "flagged", "rejected"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-medium capitalize transition-colors",
              filter === f ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-2 lg:col-span-3">
          {filtered.length === 0 && <EmptyState title="No transfers match" hint="Create a simulated transfer from RIFT Bank." />}
          {filtered.map((t) => {
            const c = CLIENTS.find((x) => x.id === t.clientId);
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={cn(
                  "block w-full rounded-2xl border p-4 text-left transition-all",
                  selected === t.id ? "glass-deep border-gold/50" : "glass hover:border-gold/30",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <Mono className="font-semibold text-foreground">{t.id}</Mono>
                  <StatusPill status={t.status} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{c?.name} · {CHAINS.find((x) => x.id === t.destChain)?.name}</p>
                  <p className="font-display text-lg font-semibold text-gold">{fmtMoney(t.amount)} {t.asset}</p>
                </div>
              </button>
            );
          })}
        </div>

        <GlassPanel className="h-fit p-6 lg:col-span-2">
          {!tx ? (
            <p className="text-sm text-muted-foreground">Select a transfer to inspect its simulated details.</p>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">{tx.id}</h3>
                <StatusPill status={tx.status} />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Client</dt><dd>{CLIENTS.find((x) => x.id === tx.clientId)?.name}</dd>
                <dt className="text-muted-foreground">Amount</dt><dd className="font-semibold text-gold">{fmtMoney(tx.amount)} {tx.asset}</dd>
                <dt className="text-muted-foreground">Stage</dt><dd>{tx.stage.replaceAll("_", " ")}</dd>
                <dt className="text-muted-foreground">Recipient</dt><dd><Mono>{tx.recipient}</Mono></dd>
                <dt className="text-muted-foreground">Source hash</dt><dd><Mono className="break-all">{tx.sourceHash.slice(0, 30)}… (simulated)</Mono></dd>
                <dt className="text-muted-foreground">RIFT Key</dt><dd>{tx.nfcVerified ? `Verified · ${tx.nfcPayload}` : "Not verified"}</dd>
                <dt className="text-muted-foreground">Created</dt><dd>{new Date(tx.createdAt).toLocaleString()}</dd>
              </dl>
              {(tx.status === "pending" || tx.status === "flagged") && (
                <div className="mt-5 flex gap-2">
                  <GhostButton
                    className="flex-1"
                    onClick={() => { dispatch({ type: "SET_STATUS", txId: tx.id, status: "rejected" }); dispatch({ type: "AUDIT", actor: "OPERATOR", action: "TRANSFER_REJECTED", detail: tx.id }); }}
                  >
                    Reject
                  </GhostButton>
                  <GhostButton
                    className="flex-1 border-success/40 text-success hover:bg-success/10"
                    onClick={() => { dispatch({ type: "SET_STATUS", txId: tx.id, status: "completed" }); dispatch({ type: "SET_STAGE", txId: tx.id, stage: "FINAL_RESULT" }); dispatch({ type: "AUDIT", actor: "OPERATOR", action: "TRANSFER_APPROVED", detail: tx.id }); }}
                  >
                    Approve
                  </GhostButton>
                </div>
              )}
            </>
          )}
        </GlassPanel>
      </div>
    </AppLayout>
  );
}
