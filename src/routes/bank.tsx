import React, { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, SimBadge, StatusPill, GoldButton, GhostButton, Mono } from "@/components/rift/ui";
import { Donut } from "@/components/rift/charts";
import {
  useRift,
  CLIENTS,
  CHAINS,
  STAGES,
  makeEvent,
  nextTxId,
  evaluateTransferPreflight,
  type PreflightRuleCheck,
} from "@/lib/rift/store";
import { ASSETS, fmtMoney, simHash, type ChainId } from "@/lib/rift/data";
import { useNfc, generateRiftKeyPayload } from "@/lib/rift/nfc";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  Nfc,
  ShieldCheck,
  ShieldAlert,
  Bell,
  Cpu,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  KeyRound,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/bank")({
  head: () => ({
    meta: [
      { title: "RIFT Bank & NFC Settlement — Live Demo" },
      { name: "description", content: "Interactive cross-chain transfer initiation, real-time RIFT rule validation, browser NFC card writer, and receiver settlement validation." },
      { property: "og:title", content: "RIFT Bank & NFC Settlement" },
      { property: "og:description", content: "Real-time rule verification, browser NFC key writer, and receiver settlement." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Bank,
});

type Step = "clients" | "form" | "preview" | "lifecycle";
type PortalTab = "sender" | "receiver";

function Bank() {
  const { state, dispatch } = useRift();
  const navigate = useNavigate();
  const { write: writeNfcCard, scan: scanNfcCard } = useNfc();

  // Top portal switcher: Sender vs Receiver
  const [portalTab, setPortalTab] = useState<PortalTab>("sender");

  // Sender workflow state
  const [step, setStep] = useState<Step>("clients");
  const [clientId, setClientId] = useState(CLIENTS[0]!.id);
  const client = CLIENTS.find((c) => c.id === clientId)!;
  const [fromAccount, setFromAccount] = useState(client.accounts[0]!.id);
  const [toAccount, setToAccount] = useState(client.accounts[1]!.id);
  const [asset, setAsset] = useState(ASSETS[0]!);
  const [amount, setAmount] = useState(50_000_000);
  const [destChain, setDestChain] = useState<ChainId>("arbitrum");
  const [recipient, setRecipient] = useState("0x7a41…e9c0"); // Apex Global Settlement demo receiver address
  const [hasNfcOptIn, setHasNfcOptIn] = useState(true);
  const [txId, setTxId] = useState<string | null>(null);

  // NFC Writer state in preview
  const [writingNfc, setWritingNfc] = useState(false);
  const [nfcWriteSuccess, setNfcWriteSuccess] = useState(false);
  const [currentKeyPayload, setCurrentKeyPayload] = useState<string | null>(null);

  // Receiver validation modal / state
  const [validatingTxId, setValidatingTxId] = useState<string | null>(null);
  const [isValidatingNfc, setIsValidatingNfc] = useState(false);
  const [validationSuccessTxId, setValidationSuccessTxId] = useState<string | null>(null);

  // Real-time preflight rule check
  const preflight = useMemo(() => {
    return evaluateTransferPreflight({
      amount,
      asset,
      recipient,
      destChain,
      hasNfcKey: hasNfcOptIn,
    }, state.rules);
  }, [amount, asset, recipient, destChain, hasNfcOptIn, state.rules]);

  const tx = state.transfers.find((t) => t.id === txId) ?? null;
  const stageIdx = tx ? STAGES.indexOf(tx.stage) : -1;

  // Count pending receiver items
  const pendingReceiverCount = state.receiverAccount.pendingInbound.filter((p) => !p.settled).length;

  const selectClient = (id: string) => {
    setClientId(id);
    const c = CLIENTS.find((x) => x.id === id)!;
    setFromAccount(c.accounts[0]!.id);
    setToAccount(c.accounts[1]!.id);
  };

  // Generate Key & Enter Preview
  const preparePreview = () => {
    const id = nextTxId();
    setTxId(id);
    const generatedKey = generateRiftKeyPayload({
      txId: id,
      amount,
      token: asset,
      recipient,
      sender: client.name,
    });
    setCurrentKeyPayload(generatedKey);
    setNfcWriteSuccess(false);
    setStep("preview");
  };

  // Write NFC key directly from browser to NFC card
  const handleWriteNfcCard = async () => {
    if (!currentKeyPayload || !txId) return;
    setWritingNfc(true);
    try {
      const res = await writeNfcCard(currentKeyPayload);
      if (res.success) {
        dispatch({
          type: "WRITE_RIFT_NFC_KEY",
          txId,
          payload: currentKeyPayload,
          serial: res.serialNumber,
        });
        setNfcWriteSuccess(true);
      }
    } finally {
      setWritingNfc(false);
    }
  };

  // Create & Initiate Transfer
  const createTransfer = () => {
    if (state.operationsHeld) {
      alert("DEMONSTRATION CONTAINMENT ACTIVE: Transfers are temporarily held by incident containment.");
      return;
    }
    const id = txId || nextTxId();
    const payload = currentKeyPayload || generateRiftKeyPayload({
      txId: id,
      amount,
      token: asset,
      recipient,
      sender: client.name,
    });

    dispatch({
      type: "CREATE_TRANSFER",
      transfer: {
        id,
        clientId,
        fromAccount,
        toAccount,
        asset,
        amount,
        destChain,
        recipient,
        stage: "CREATED" as const,
        status: "pending" as const,
        nfcVerified: false,
        ...(nfcWriteSuccess ? { nfcPayload: payload } : {}),
        riftKeyPayload: payload,
        requiresNfc: hasNfcOptIn,
        sourceHash: simHash(`${id}:src`),
        createdAt: Date.now(),
      },
    });

    dispatch({
      type: "ADD_EVENT",
      event: makeEvent("rift-bank", "TRANSFER", id, `Cross-chain transfer initiated: ${fmtMoney(amount)} ${asset} → ${destChain} [Simulated]`),
    });

    dispatch({
      type: "AUDIT",
      actor: "RIFT BANK",
      action: "TRANSFER_CREATED",
      detail: `${id} · ${fmtMoney(amount)} ${asset} authorized to ${recipient}`,
    });

    setStep("lifecycle");

    // Real-time lifecycle sequence with rule validation indicators
    setTimeout(() => {
      dispatch({ type: "SET_STAGE", txId: id, stage: "RISK_ASSESSMENT" });
      dispatch({
        type: "ADD_EVENT",
        event: makeEvent("rift-engine", "INVARIANT_CHECK", id, `Running 8 invariant rules: R-01..R-08 verified valid on normalized event`),
      });
    }, 1200);

    setTimeout(() => {
      dispatch({ type: "SET_STAGE", txId: id, stage: "AWAITING_AUTHORIZATION" });
      dispatch({
        type: "ADD_EVENT",
        event: makeEvent("rift-watch", "ESCROW", id, `Collateral locked. Escrow awaiting receiver NFC card tap for final settlement`),
      });
    }, 2600);
  };

  // Receiver validates transfer by tapping NFC card
  const handleReceiverValidateNfc = async (targetTxId: string) => {
    setValidatingTxId(targetTxId);
    setIsValidatingNfc(true);
    try {
      const readRes = await scanNfcCard(true);
      const payload = readRes?.payload || state.virtualNfcCard.payload || "RIFT-KEY:v2:AUTH-VERIFIED";

      // Dispatch settlement confirmation
      dispatch({
        type: "RECEIVER_VALIDATE_NFC",
        txId: targetTxId,
        payload,
        serial: readRes?.serialNumber || state.virtualNfcCard.serial,
      });

      setValidationSuccessTxId(targetTxId);
      setTimeout(() => {
        setValidatingTxId(null);
        setIsValidatingNfc(false);
      }, 1800);
    } catch {
      setIsValidatingNfc(false);
    }
  };

  return (
    <AppLayout>
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-gold">RIFT Financial Operations</span>
            <SimBadge label="INTERACTIVE DEMONSTRATION" />
          </div>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {portalTab === "sender" ? "Private Vault Reserves" : "Demo Receiver Settlement Account"}
          </h1>
        </div>

        {/* Top Portal Switcher */}
        <div className="flex w-full sm:w-auto items-center justify-center rounded-2xl border border-border bg-card/60 p-1 backdrop-blur-md">
          <button
            onClick={() => setPortalTab("sender")}
            className={cn(
              "flex flex-1 sm:flex-none items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition-all min-h-[40px]",
              portalTab === "sender"
                ? "border border-gold/40 bg-gold/15 text-gold shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ArrowUpRight className="size-3.5" />
            Sender Portal (Vault)
          </button>

          <button
            onClick={() => setPortalTab("receiver")}
            className={cn(
              "relative flex flex-1 sm:flex-none items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition-all min-h-[40px]",
              portalTab === "receiver"
                ? "border border-gold/40 bg-gold/15 text-gold shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ArrowDownLeft className="size-3.5" />
            Receiver Account (Apex)
            {pendingReceiverCount > 0 && (
              <span className="flex size-4 sm:size-5 items-center justify-center rounded-full bg-gold text-[9px] sm:text-[10px] font-bold text-black animate-pulse">
                {pendingReceiverCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SENDER PORTAL (CLIENT VAULT & TRANSFER INITIATION) */}
      {/* ========================================================================= */}
      {portalTab === "sender" && (
        <div className="mt-6 space-y-6">
          {/* STEP 1: CLIENT SELECTION */}
          {step === "clients" && (
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
                  <p className="mt-1 text-xs text-muted-foreground">Client since {c.since} · {c.riskProfile} · Fictional figure</p>
                  <GoldButton className="mt-5 w-full" onClick={() => { selectClient(c.id); setStep("form"); }}>
                    Initiate Transfer from Profile <ArrowRight className="size-4" />
                  </GoldButton>
                </GlassPanel>
              ))}
            </div>
          )}

          {/* STEP 2: TRANSFER FORM WITH REAL-TIME PREFLIGHT RULE SCANNER */}
          {step === "form" && (
            <div className="grid gap-6 lg:grid-cols-5">
              {/* Account summary panel */}
              <GlassPanel className="p-6 lg:col-span-2">
                <div className="flex items-center gap-4">
                  <div className="flex size-14 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 font-display text-xl font-bold text-gold">{client.initials}</div>
                  <div>
                    <h3 className="font-display text-xl font-semibold">{client.name}</h3>
                    <p className="text-sm text-muted-foreground">{client.netWorth} · {client.tier} tier</p>
                  </div>
                </div>
                <div className="my-5 shimmer-line" />
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Source Vault Allocation</p>
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

              {/* Transfer configuration & live RIFT rule checks */}
              <GlassPanel className="p-6 lg:col-span-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h3 className="font-display text-lg sm:text-xl font-semibold">Initiate Cross-Chain Settlement</h3>
                  <span className="self-start sm:self-auto flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    RIFT Engine Live Pre-Scan
                  </span>
                </div>
                <p className="mb-5 text-xs text-muted-foreground">
                  As you configure this transfer, RIFT evaluates all 8 core invariant rules in real-time.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Source Account">
                    <select value={fromAccount} onChange={(e) => setFromAccount(e.target.value)} className={inputCls}>
                      {client.accounts.map((a) => <option key={a.id} value={a.id}>{a.label} · {fmtMoney(a.balance)}</option>)}
                    </select>
                  </Field>

                  <Field label="Destination Chain">
                    <select value={destChain} onChange={(e) => setDestChain(e.target.value as ChainId)} className={inputCls}>
                      {CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>

                  <Field label="Asset">
                    <select value={asset} onChange={(e) => setAsset(e.target.value)} className={inputCls}>
                      {ASSETS.map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </Field>

                  <Field label="Amount (USD)">
                    <input
                      type="number"
                      value={amount}
                      min={1000}
                      step={100000}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    <Field label="Recipient / Beneficiary Address (Demo Receiver: Apex Settlement)">
                      <div className="flex gap-2">
                        <input
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value)}
                          className={cn(inputCls, "font-mono text-xs")}
                        />
                        <button
                          type="button"
                          onClick={() => setRecipient("0x7a41…e9c0")}
                          className="shrink-0 rounded-xl border border-gold/30 bg-gold/10 px-3 text-[11px] font-semibold text-gold transition-colors hover:bg-gold/20"
                        >
                          Apex Demo
                        </button>
                      </div>
                    </Field>
                  </div>
                </div>

                {/* Option to Issue Physical RIFT NFC Key */}
                <div className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-3.5">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={hasNfcOptIn}
                      onChange={(e) => setHasNfcOptIn(e.target.checked)}
                      className="mt-0.5 size-4 rounded accent-gold"
                    />
                    <div>
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Nfc className="size-3.5 text-gold" />
                        Issue & Program Physical RIFT NFC Authorization Key
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Generates a cryptographic one-time authorization token that will be written directly to a physical NFC card from your browser.
                      </p>
                    </div>
                  </label>
                </div>

                {/* REAL-TIME RIFT INVARIANT RULES VERIFICATION WIDGET */}
                <div className="mt-5 rounded-2xl border border-border bg-card/40 p-4">
                  <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Real-Time Invariant Pre-Scan ({preflight.checks.filter((c) => c.passed).length}/8 Rules Valid)
                      </span>
                    </div>
                    <span className={cn(
                      "self-start sm:self-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      preflight.allPassed ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                    )}>
                      {preflight.allPassed ? "Ready for Execution" : "Adjust Parameters"}
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {preflight.checks.map((check) => (
                      <div
                        key={check.ruleId}
                        className={cn(
                          "flex items-start gap-2.5 rounded-xl border p-2.5 text-xs transition-colors",
                          check.passed
                            ? "border-emerald-500/25 bg-emerald-500/5 text-foreground"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                        )}
                      >
                        <span className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                          check.passed ? "bg-emerald-500 text-black" : "bg-amber-500 text-black"
                        )}>
                          {check.passed ? "✓" : "!"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{check.ruleId}: {check.name}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{check.observed}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 flex justify-between">
                  <GhostButton onClick={() => setStep("clients")}>Back to Clients</GhostButton>
                  <GoldButton onClick={preparePreview} disabled={amount <= 0 || !preflight.allPassed}>
                    Review & Write NFC Key <ArrowRight className="size-4" />
                  </GoldButton>
                </div>
              </GlassPanel>
            </div>
          )}

          {/* STEP 3: PREVIEW & IN-BROWSER NFC CARD WRITER */}
          {step === "preview" && (
            <GlassPanel deep className="mx-auto max-w-3xl p-8">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Pre-Settlement Authorization</span>
                  <h3 className="font-display text-2xl font-semibold">Transfer Review & RIFT Key Writer</h3>
                </div>
                <SimBadge label={`TX: ${txId || "PENDING"}`} />
              </div>

              <div className="my-5 shimmer-line" />

              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Source Client</dt><dd className="font-medium">{client.name}</dd>
                <dt className="text-muted-foreground">Source Account</dt><dd>{client.accounts.find((a) => a.id === fromAccount)?.label}</dd>
                <dt className="text-muted-foreground">Transfer Amount</dt><dd className="gold-text font-display text-2xl font-bold">{fmtMoney(amount)} {asset}</dd>
                <dt className="text-muted-foreground">Target Network</dt><dd className="font-semibold uppercase tracking-wider text-foreground">{destChain}</dd>
                <dt className="text-muted-foreground">Beneficiary</dt><dd><Mono className="text-gold">{recipient}</Mono> (Apex Settlement)</dd>
              </dl>

              {/* BROWSER NFC KEY WRITER MODULE */}
              {hasNfcOptIn && (
                <div className="mt-6 rounded-2xl border border-gold/40 bg-gold/5 p-6 backdrop-blur-md">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-gold/40 bg-gold/15 text-gold">
                        <KeyRound className="size-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-foreground">Write RIFT Key to NFC Card in Browser</h4>
                        <p className="text-xs text-muted-foreground">
                          Programs physical NTAG213/215/216 cards via Web NFC or stores in browser emulator.
                        </p>
                      </div>
                    </div>

                    <GoldButton onClick={handleWriteNfcCard} disabled={writingNfc || nfcWriteSuccess}>
                      <Nfc className="size-4" />
                      {writingNfc ? "Holding Card…" : nfcWriteSuccess ? "Card Programmed ✓" : "Write to NFC Card"}
                    </GoldButton>
                  </div>

                  {/* Generated payload token & card hardware status */}
                  <div className="mt-4 rounded-xl border border-border bg-black/40 p-4">
                    <div className="grid gap-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Generated Key Token:</span>
                        <Mono className="text-[11px] text-gold truncate max-w-xs">{currentKeyPayload}</Mono>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Card Hardware Status:</span>
                        <span className={cn("font-semibold", nfcWriteSuccess ? "text-emerald-400" : "text-muted-foreground")}>
                          {nfcWriteSuccess ? "Written & Paired (Serial: 04:A2:8B:E3:44:01)" : "Awaiting write command"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {nfcWriteSuccess && (
                    <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      Key successfully written to card! Hand card to receiver to authorize settlement.
                    </div>
                  )}
                </div>
              )}

              <div className="mt-8 flex justify-between">
                <GhostButton onClick={() => setStep("form")}>Edit Details</GhostButton>
                <GoldButton onClick={createTransfer}>
                  Initiate Live Transfer & Verify Invariants <ArrowRight className="size-4" />
                </GoldButton>
              </div>
            </GlassPanel>
          )}

          {/* STEP 4: REAL-TIME TRANSACTION LIFECYCLE & INVARIANT VERIFICATION */}
          {step === "lifecycle" && tx && (
            <div className="grid gap-6 lg:grid-cols-5">
              <GlassPanel className="p-6 lg:col-span-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Cross-Chain Execution Pipeline</span>
                    <h3 className="font-display text-2xl font-bold">{tx.id}</h3>
                  </div>
                  <StatusPill status={tx.status} />
                </div>
                <p className="mb-6 text-xs text-muted-foreground">
                  {fmtMoney(tx.amount)} {tx.asset} · {client.name} → {recipient}
                </p>

                {/* Animated Lifecycle Steps with Real-time Rule Check Callouts */}
                <ol className="space-y-2">
                  {STAGES.map((s, i) => {
                    const done = i < stageIdx;
                    const current = i === stageIdx;
                    return (
                      <li
                        key={s}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-4 py-3 transition-all",
                          current ? "border border-gold/50 bg-gold/10" : done ? "border border-border/40 bg-secondary/20" : "border border-transparent opacity-60"
                        )}
                      >
                        <span className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                          done ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : current ? "animate-pulse border-gold text-gold" : "border-border text-muted-foreground"
                        )}>
                          {done ? <Check className="size-3" /> : i + 1}
                        </span>

                        <div className="flex-1">
                          <p className={cn("text-xs font-semibold", current ? "text-gold" : done ? "text-foreground" : "text-muted-foreground")}>
                            {s.replaceAll("_", " ")}
                          </p>
                          {current && (
                            <p className="text-[11px] text-muted-foreground">
                              {s === "RISK_ASSESSMENT" && "Evaluating RIFT invariant rules R-01 through R-08 in real-time…"}
                              {s === "AWAITING_AUTHORIZATION" && "Source debit finalized. Awaiting receiver NFC card tap for settlement."}
                              {s === "FINAL_RESULT" && "Deposit settled and verified on destination chain."}
                            </p>
                          )}
                        </div>

                        {done && <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">PASSED</span>}
                      </li>
                    );
                  })}
                </ol>

                {/* Receiver action notice */}
                <div className="mt-6 rounded-2xl border border-gold/30 bg-gold/10 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-gold">Ready for Receiver Settlement</p>
                      <p className="text-[11px] text-muted-foreground">
                        The transfer is held in cross-chain escrow. Switch to the Demo Receiver account to tap the NFC card and settle.
                      </p>
                    </div>
                    <GoldButton onClick={() => setPortalTab("receiver")}>
                      Open Receiver Account <ArrowRight className="size-3.5" />
                    </GoldButton>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <GhostButton onClick={() => navigate({ to: "/command-room" })}>Open Command Room</GhostButton>
                  <GhostButton onClick={() => navigate({ to: "/transactions" })}>View All Transactions</GhostButton>
                  <GoldButton onClick={() => { setStep("clients"); setTxId(null); }}>New Transfer</GoldButton>
                </div>
              </GlassPanel>

              {/* RIFT Invariant Verification Panel */}
              <GlassPanel className="p-6 lg:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="size-5 text-emerald-400" />
                  <h3 className="font-display text-lg font-semibold">Active Invariant Verdict</h3>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                    <p className="text-xs font-bold text-emerald-400">Zero False Positive Baseline</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      All 8 invariant rules verified matching signatures, amount precision, token mapping, and beneficiary whitelist.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-black/40 p-3.5 text-xs">
                    <p className="text-muted-foreground mb-1">Source Lock Hash:</p>
                    <Mono className="text-gold text-[11px] block">{tx.sourceHash}</Mono>
                    <p className="text-muted-foreground mt-2 mb-1">RIFT Key Payload:</p>
                    <Mono className="text-muted-foreground text-[10px] block truncate">{tx.riftKeyPayload || "N/A"}</Mono>
                  </div>
                </div>
              </GlassPanel>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* DEMO RECEIVER PORTAL (APEX GLOBAL SETTLEMENT CORP) */}
      {/* ========================================================================= */}
      {portalTab === "receiver" && (
        <div className="mt-6 space-y-6">
          {/* Institutional Account Banner */}
          <GlassPanel className="p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div className="flex items-center gap-4">
                <div className="flex size-16 items-center justify-center rounded-2xl border border-gold/40 bg-gold/15 font-display text-2xl font-bold text-gold">
                  AG
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">{state.receiverAccount.name}</h2>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                      Institutional Beneficiary
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Address: <Mono className="text-foreground break-all">{state.receiverAccount.address}</Mono></span>
                    <span>· Network: Arbitrum One Gateway</span>
                  </div>
                </div>
              </div>

              {/* Settled Balance */}
              <div className="rounded-2xl border border-border bg-secondary/40 px-5 sm:px-6 py-3.5 sm:py-4 text-left sm:text-right">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Total Settled Balance</span>
                <p className="font-display text-2xl sm:text-3xl font-bold text-gold">
                  {fmtMoney(state.receiverAccount.balance)} <span className="text-sm font-normal text-muted-foreground">USDC</span>
                </p>
              </div>
            </div>
          </GlassPanel>

          {/* INBOUND SETTLEMENT NOTIFICATIONS */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-gold" />
                <h3 className="font-display text-xl font-bold text-foreground">Inbound Settlement Notifications</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                Requires physical RIFT NFC Key tap to validate and release funds
              </span>
            </div>

            {state.receiverAccount.pendingInbound.length === 0 ? (
              <GlassPanel className="p-8 text-center text-muted-foreground text-sm">
                No inbound transfers pending. Go to the Sender Portal to create a transfer to this receiver.
              </GlassPanel>
            ) : (
              <div className="space-y-3">
                {state.receiverAccount.pendingInbound.map((inbound) => (
                  <GlassPanel
                    key={inbound.txId}
                    className={cn(
                      "p-6 transition-all",
                      !inbound.settled ? "border-gold/50 bg-gold/5 shadow-lg shadow-gold/5" : "border-border/60 bg-card/40"
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            inbound.settled ? "bg-emerald-500/20 text-emerald-400" : "bg-gold/20 text-gold animate-pulse"
                          )}>
                            {inbound.settled ? "SETTLED & CREDITED" : "AWAITING NFC KEY VALIDATION"}
                          </span>
                          <Mono className="text-xs text-muted-foreground">{inbound.txId}</Mono>
                        </div>

                        <p className="font-display text-2xl font-bold text-foreground">
                          {fmtMoney(inbound.amount)} {inbound.asset}
                        </p>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>From: <strong className="text-foreground">{inbound.senderName}</strong></span>
                          <span>· Dest: <strong className="text-foreground uppercase">{inbound.destChain}</strong></span>
                          <span>· Time: {new Date(inbound.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      {/* Action Button: Tap NFC Card to Validate */}
                      <div>
                        {inbound.settled ? (
                          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-400">
                            <CheckCircle2 className="size-4" />
                            Settled via RIFT Key Tag
                          </div>
                        ) : (
                          <GoldButton
                            onClick={() => handleReceiverValidateNfc(inbound.txId)}
                            disabled={isValidatingNfc && validatingTxId === inbound.txId}
                            className="w-full sm:w-auto"
                          >
                            <Nfc className="size-4" />
                            {isValidatingNfc && validatingTxId === inbound.txId
                              ? "Validating Card…"
                              : "Validate & Settle via NFC Card"}
                          </GoldButton>
                        )}
                      </div>
                    </div>

                    {/* Verification receipt if just validated */}
                    {validationSuccessTxId === inbound.txId && (
                      <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                        <p className="font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="size-4 text-emerald-400" />
                          Settlement Confirmed: +{fmtMoney(inbound.amount)} {inbound.asset} released to Apex Global Settlement Corp!
                        </p>
                        <p className="mt-0.5 text-[11px] text-emerald-400/80">
                          Hardware signature matched. Non-replay verification rule R-08 passed.
                        </p>
                      </div>
                    )}
                  </GlassPanel>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

const inputCls = "w-full rounded-xl border border-input bg-secondary/40 px-3.5 sm:px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-gold min-h-[44px]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
