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
        <div className="space-y-2 lg:col-span-3 max-h-[380px] lg:max-h-none overflow-y-auto pr-1">
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

        <GlassPanel className="h-fit p-4 sm:p-6 lg:col-span-2">
          {!tx ? (
            <p className="text-sm text-muted-foreground">Select a transfer to inspect its simulated details.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{tx.id}</h3>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    tx.state === "SETTLED" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                    tx.state === "PENDING_PARTY_APPROVAL" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse" :
                    tx.state === "REJECTED" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" :
                    tx.state === "EXPIRED" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                    tx.state === "PENDING_RIFT_KEY" ? "bg-gold/20 text-gold border border-gold/30" :
                    "bg-secondary text-muted-foreground border border-border"
                  )}>
                    {tx.state || "PENDING"}
                  </span>
                  <StatusPill status={tx.status} />
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm min-w-0">
                <dt className="text-muted-foreground">Client</dt><dd className="min-w-0 break-words">{CLIENTS.find((x) => x.id === tx.clientId)?.name}</dd>
                <dt className="text-muted-foreground">Amount</dt><dd className="font-semibold text-gold min-w-0">{fmtMoney(tx.amount)} {tx.asset}</dd>
                <dt className="text-muted-foreground">Recipient</dt><dd className="min-w-0"><Mono className="break-all">{tx.recipient}</Mono></dd>
                <dt className="text-muted-foreground">Identity</dt>
                <dd className="min-w-0 text-xs">
                  <span className="font-semibold">{tx.recipientType || "REGISTERED"}</span>
                  {tx.counterpartyId && <span className="text-gold font-mono ml-1.5">({tx.counterpartyId})</span>}
                  {tx.claimToken && <span className="text-gold font-mono ml-1.5">(Token: {tx.claimToken})</span>}
                </dd>
                <dt className="text-muted-foreground">Chain Lock</dt><dd className="min-w-0"><Mono className="break-all">{tx.sourceHash.slice(0, 24)}…</Mono></dd>
                <dt className="text-muted-foreground">Finality</dt><dd className="min-w-0 text-xs font-mono">{tx.confirmations ?? 32}/{tx.requiredConfirmations ?? 32} blocks (Block #{tx.sourceBlockNumber ?? 21044200})</dd>
                <dt className="text-muted-foreground">RIFT Key</dt><dd className="min-w-0 text-xs">{tx.nfcVerified ? `Verified · ${tx.nfcPayload || "One-Time Signed"}` : tx.requiresNfc ? "Hardware Token Required" : "Standard Transfer"}</dd>
                <dt className="text-muted-foreground">Created</dt><dd className="min-w-0 text-xs">{new Date(tx.createdAt).toLocaleString()}</dd>
              </dl>

              {/* Two-Party Approval Callout */}
              {tx.twoPartyApproval && (
                <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300">Two-Party Consent Status</span>
                    <span className="font-mono text-[10px] text-amber-200">
                      S: {tx.twoPartyApproval.senderDecision} · R: {tx.twoPartyApproval.receiverDecision}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{tx.twoPartyApproval.reason}</p>
                  {(tx.twoPartyApproval.senderDecision === "PENDING" || tx.twoPartyApproval.receiverDecision === "PENDING") && (
                    <button
                      onClick={() => dispatch({ type: "SET_ACTIVE_APPROVAL", txId: tx.id })}
                      className="w-full rounded-lg bg-gold/20 border border-gold/40 py-1.5 font-bold text-gold hover:bg-gold/30 text-xs transition-colors"
                    >
                      Open Two-Party Consent Console
                    </button>
                  )}
                </div>
              )}

              {/* RIFT KEY Prompt */}
              {tx.state === "PENDING_RIFT_KEY" && (
                <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-3 text-xs">
                  <p className="font-bold text-gold mb-1">Awaiting RIFT Key Hardware Tap</p>
                  <p className="text-[11px] text-muted-foreground mb-2">Program physical NFC card or validate on Receiver Account.</p>
                  <Link to="/rift-key">
                    <button className="w-full rounded-lg bg-gold py-1.5 font-bold text-black text-xs hover:opacity-90">
                      Open RIFT Key Device Lab
                    </button>
                  </Link>
                </div>
              )}
            </>
          )}
        </GlassPanel>
      </div>
    </AppLayout>
  );
}
