import React, { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, SimBadge, StatusPill, GoldButton, GhostButton, Mono } from "@/components/rift/ui";
import { Donut } from "@/components/rift/charts";
import { NfcPanel } from "@/components/rift/NfcPanel";
import { useRift, CLIENTS, CHAINS, STAGES, makeEvent, nextTxId } from "@/lib/rift/store";
import { ASSETS, fmtMoney, simHash, type ChainId } from "@/lib/rift/data";
import { cn } from "@/lib/utils";
import { ArrowRight, Check } from "lucide-react";

export const Route = createFileRoute("/bank")({
  head: () => ({
    meta: [
      { title: "RIFT Bank — Simulated Private Banking" },
      { name: "description", content: "Fictional billionaire clients, simulated accounts and transfers. Test data only — no real bank connection." },
      { property: "og:title", content: "RIFT Bank — Simulated Private Banking" },
      { property: "og:description", content: "Fictional clients, test data, no real bank connection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Bank,
});

type Step = "clients" | "form" | "preview" | "lifecycle";

function Bank() {
  const { state, dispatch } = useRift();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("clients");
  const [clientId, setClientId] = useState(CLIENTS[0]!.id);
  const client = CLIENTS.find((c) => c.id === clientId)!;
  const [fromAccount, setFromAccount] = useState(client.accounts[0]!.id);
  const [toAccount, setToAccount] = useState(client.accounts[1]!.id);
  const [asset, setAsset] = useState(ASSETS[0]!);
  const [amount, setAmount] = useState(250_000_000);
  const [destChain, setDestChain] = useState<ChainId>("ethereum");
  const [recipient, setRecipient] = useState("0x7a41…e9c0");
  const [txId, setTxId] = useState<string | null>(null);

  const tx = state.transfers.find((t) => t.id === txId) ?? null;
  const stageIdx = tx ? STAGES.indexOf(tx.stage) : -1;

  const selectClient = (id: string) => {
    setClientId(id);
    const c = CLIENTS.find((x) => x.id === id)!;
    setFromAccount(c.accounts[0]!.id);
    setToAccount(c.accounts[1]!.id);
  };

  const createTransfer = () => {
    if (state.operationsHeld) {
      alert("DEMONSTRATION CONTAINMENT ACTIVE: New transfers are held by incident response.");
      return;
    }
    const id = nextTxId();
    dispatch({
      type: "CREATE_TRANSFER",
      transfer: {
        id, clientId, fromAccount, toAccount, asset, amount, destChain, recipient,
      stage: "CREATED" as const, status: "pending" as const, nfcVerified: false,
        sourceHash: simHash(`${id}:src`), createdAt: Date.now(),
      },
    });
    dispatch({ type: "ADD_EVENT", event: makeEvent("rift-bank", "TRANSFER", id, `Transfer created: ${fmtMoney(amount)} ${asset} → ${destChain} [Simulated]`) });
    dispatch({ type: "AUDIT", actor: "RIFT BANK", action: "TRANSFER_CREATED", detail: `${id} · ${fmtMoney(amount)} ${asset}` });
    setTxId(id);
    setStep("lifecycle");
    // advance simulated lifecycle
    setTimeout(() => dispatch({ type: "SET_STAGE", txId: id, stage: "RISK_ASSESSMENT" }), 1200);
    setTimeout(() => {
      dispatch({ type: "SET_STAGE", txId: id, stage: "AWAITING_AUTHORIZATION" });
      dispatch({ type: "ADD_EVENT", event: makeEvent("rift-watch", "RISK", id, "Risk assessment complete — authorization required (simulated)") });
    }, 2600);
  };

  const onNfcRead = (payload: string | null, recognized: boolean) => {
    if (!txId || !recognized || !payload) return;
    dispatch({ type: "NFC_VERIFIED", txId, payload });
    dispatch({ type: "ADD_EVENT", event: makeEvent("rift-key", "AUTH", txId, `RIFT Key read: ${payload} — authorization granted (simulated after real tag read)`) });
    dispatch({ type: "AUDIT", actor: "RIFT KEY", action: "AUTHORIZATION", detail: `${txId} authorized via physical tag read` });
    setTimeout(() => {
      dispatch({ type: "SET_STAGE", txId, stage: "SOURCE_TRANSACTION" });
      dispatch({ type: "ADD_EVENT", event: makeEvent("ethereum", "DEBIT", txId, `Source debit finalized (simulated hash)`) });
    }, 1400);
    setTimeout(() => {
      dispatch({ type: "SET_STAGE", txId, stage: "DESTINATION_TRANSACTION" });
      dispatch({ type: "ADD_EVENT", event: makeEvent(destChain, "CREDIT", txId, `Destination credit observed (simulated hash)`) });
    }, 3000);
    setTimeout(() => dispatch({ type: "SET_STAGE", txId, stage: "CORRELATION" }), 4400);
    setTimeout(() => {
      dispatch({ type: "SET_STAGE", txId, stage: "FINAL_RESULT" });
      // Security invariant: A valid NFC approval must never automatically override a high-risk security flag
      if (tx?.status !== "flagged") {
        dispatch({ type: "SET_STATUS", txId, status: "completed" });
        dispatch({ type: "AUDIT", actor: "RIFT BANK", action: "TRANSFER_COMPLETED", detail: `${txId} settled (simulated)` });
      } else {
        dispatch({ type: "ADD_EVENT", event: makeEvent("rift-watch", "ALERT", txId, "NFC read recorded, but transfer remains flagged due to active high-risk assessment") });
        dispatch({ type: "AUDIT", actor: "RIFT SECURITY", action: "OVERRIDE_REJECTED", detail: `${txId} flagged transfer cannot be overridden by NFC key` });
      }
    }, 5800);
  };

  return (
    <AppLayout>
      <SectionTitle
        eyebrow="RIFT Bank"
        title="The Vault"
        right={<SimBadge label="FICTIONAL CLIENTS · TEST DATA" />}
      />

      {step === "clients" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CLIENTS.map((c) => (
              <GlassPanel key={c.id} className="group p-6 transition-transform hover:-translate-y-1">
                <div className="flex items-start justify-between">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 font-display text-lg font-bold text-gold">
                    {c.initials}
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{c.tier}</span>
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold">{c.name}</h3>
                <p className="gold-text font-display text-3xl font-bold">{c.netWorth}</p>
                <p className="mt-1 text-xs text-muted-foreground">Client since {c.since} · {c.riskProfile} · fictional figure</p>
                <GoldButton className="mt-5 w-full" onClick={() => { selectClient(c.id); setStep("form"); }}>
                  Open profile <ArrowRight className="size-4" />
                </GoldButton>
              </GlassPanel>
            ))}
          </div>
        </>
      )}

      {step === "form" && (
        <div className="grid gap-6 lg:grid-cols-5">
          <GlassPanel className="p-6 lg:col-span-2">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 font-display text-xl font-bold text-gold">{client.initials}</div>
              <div>
                <h3 className="font-display text-xl font-semibold">{client.name}</h3>
                <p className="text-sm text-muted-foreground">{client.netWorth} · {client.tier} tier (fictional)</p>
              </div>
            </div>
            <div className="my-5 shimmer-line" />
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Asset allocation</p>
            <Donut slices={client.allocation} size={150} />
            <div className="mt-5 space-y-2">
              {client.accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{a.label}</p>
                    <Mono className="text-muted-foreground">{a.number} · {a.chain}</Mono>
                  </div>
                  <p className="font-display font-semibold text-gold">{fmtMoney(a.balance)}</p>
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6 lg:col-span-3">
            <h3 className="mb-1 font-display text-xl font-semibold">New simulated transfer</h3>
            <p className="mb-6 text-xs text-muted-foreground">Blockchain activity is simulated. Generated identifiers are not real on-chain evidence.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Source account">
                <select value={fromAccount} onChange={(e) => setFromAccount(e.target.value)} className={inputCls}>
                  {client.accounts.map((a) => <option key={a.id} value={a.id}>{a.label} · {fmtMoney(a.balance)}</option>)}
                </select>
              </Field>
              <Field label="Destination account">
                <select value={toAccount} onChange={(e) => setToAccount(e.target.value)} className={inputCls}>
                  {client.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </Field>
              <Field label="Asset">
                <select value={asset} onChange={(e) => setAsset(e.target.value)} className={inputCls}>
                  {ASSETS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="Amount (USD)">
                <input type="number" value={amount} min={1} onChange={(e) => setAmount(Number(e.target.value))} className={inputCls} />
              </Field>
              <Field label="Destination chain">
                <select value={destChain} onChange={(e) => setDestChain(e.target.value as ChainId)} className={inputCls}>
                  {CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Recipient address">
                <input value={recipient} onChange={(e) => setRecipient(e.target.value)} className={cn(inputCls, "font-mono")} />
              </Field>
            </div>
            <div className="mt-6 flex gap-3">
              <GhostButton onClick={() => setStep("clients")}>Back</GhostButton>
              <GoldButton onClick={() => setStep("preview")} disabled={amount <= 0}>Preview transfer</GoldButton>
            </div>
          </GlassPanel>
        </div>
      )}

      {step === "preview" && (
        <GlassPanel deep className="mx-auto max-w-2xl p-8">
          <h3 className="font-display text-2xl font-semibold">Transfer preview</h3>
          <p className="mt-1 text-xs text-muted-foreground">Review before creating the simulated transfer.</p>
          <div className="my-6 shimmer-line" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Client</dt><dd className="font-medium">{client.name}</dd>
            <dt className="text-muted-foreground">From</dt><dd>{client.accounts.find((a) => a.id === fromAccount)?.label}</dd>
            <dt className="text-muted-foreground">To</dt><dd>{client.accounts.find((a) => a.id === toAccount)?.label}</dd>
            <dt className="text-muted-foreground">Amount</dt><dd className="gold-text font-display text-2xl font-bold">{fmtMoney(amount)} {asset}</dd>
            <dt className="text-muted-foreground">Destination chain</dt><dd>{CHAINS.find((c) => c.id === destChain)?.name}</dd>
            <dt className="text-muted-foreground">Recipient</dt><dd><Mono>{recipient}</Mono></dd>
          </dl>
          <div className="mt-8 flex gap-3">
            <GhostButton onClick={() => setStep("form")}>Edit</GhostButton>
            <GoldButton onClick={createTransfer}>Create simulated transfer</GoldButton>
          </div>
        </GlassPanel>
      )}

      {step === "lifecycle" && tx && (
        <div className="grid gap-6 lg:grid-cols-5">
          <GlassPanel className="p-6 lg:col-span-3">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold">{tx.id}</h3>
              <StatusPill status={tx.status} />
            </div>
            <p className="mb-6 text-xs text-muted-foreground">{fmtMoney(tx.amount)} {tx.asset} · {client.name} · SIMULATED lifecycle</p>
            <ol className="space-y-1">
              {STAGES.map((s, i) => {
                const done = i < stageIdx;
                const current = i === stageIdx;
                return (
                  <li key={s} className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 transition-all",
                    current ? "border border-gold/40 bg-gold/10" : "border border-transparent",
                  )}>
                    <span className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                      done ? "border-success bg-success/20 text-success" : current ? "animate-scan-pulse border-gold text-gold" : "border-border text-muted-foreground",
                    )}>
                      {done ? <Check className="size-3" /> : i + 1}
                    </span>
                    <span className={cn("text-sm tracking-wide", current ? "font-semibold text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/50")}>
                      {s.replaceAll("_", " ")}
                    </span>
                    {current && tx.status === "flagged" && <span className="ml-auto text-[10px] font-semibold text-danger">FLAGGED</span>}
                  </li>
                );
              })}
            </ol>
            {tx.stage === "FINAL_RESULT" && (
              <div className="mt-5 rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
                <p className="font-semibold text-success">Transfer {tx.status === "completed" ? "settled" : tx.status} — simulated final result</p>
                <Mono className="mt-1 block text-muted-foreground">src {tx.sourceHash.slice(0, 26)}… (simulated)</Mono>
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <GhostButton onClick={() => navigate({ to: "/transactions" })}>View all transactions</GhostButton>
              <GhostButton onClick={() => navigate({ to: "/command-room" })}>Open Command Room</GhostButton>
              <GoldButton onClick={() => { setStep("clients"); setTxId(null); }}>New transfer</GoldButton>
            </div>
          </GlassPanel>

          <GlassPanel className="p-6 lg:col-span-2">
            <h3 className="mb-1 font-display text-lg font-semibold">RIFT Key authorization</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              {tx.nfcVerified
                ? "Physical tag read recorded; authorization workflow simulated."
                : "Requires a real NFC tag tap. No simulated taps."}
            </p>
            {tx.nfcVerified ? (
              <div className="rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
                <p className="font-semibold text-success">Authorized via RIFT Key</p>
                <Mono className="mt-1 block text-muted-foreground">Payload: {tx.nfcPayload}</Mono>
              </div>
            ) : (
              <NfcPanel compact onRead={(r) => onNfcRead(r.payload, !!r.recognized)} />
            )}
          </GlassPanel>
        </div>
      )}
    </AppLayout>
  );
}

const inputCls = "w-full rounded-xl border border-input bg-secondary/40 px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-gold";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
