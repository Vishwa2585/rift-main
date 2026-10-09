import React, { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useRift, type Transfer } from "@/lib/rift/store";
import { Mono, GoldButton, GhostButton, StatusPill } from "./ui";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/rift/data";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Lock,
} from "lucide-react";

interface TwoPartyAlertModalProps {
  txId?: string | null;
  onClose?: () => void;
  embedded?: boolean;
}

export function TwoPartyAlertModal({ txId, onClose, embedded = false }: TwoPartyAlertModalProps) {
  const { state, dispatch } = useRift();
  const navigate = useNavigate();

  const targetTxId = txId || state.activeApprovalTxId;
  const transfer = state.transfers.find((t) => t.id === targetTxId);
  const approval = transfer?.twoPartyApproval;

  const [activeRole, setActiveRole] = useState<"sender" | "receiver">("sender");
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60);

  // Synchronize countdown with store's deadlineTimestamp
  useEffect(() => {
    if (!approval?.deadlineTimestamp) return;

    const updateTimer = () => {
      const diff = Math.max(0, Math.ceil((approval.deadlineTimestamp - Date.now()) / 1000));
      setSecondsRemaining(diff);
      if (diff <= 0 && transfer && (approval.senderDecision === "PENDING" || approval.receiverDecision === "PENDING")) {
        dispatch({ type: "EXPIRE_APPROVAL", txId: transfer.id });
      }
    };

    updateTimer();
    const iv = setInterval(updateTimer, 1000);
    return () => clearInterval(iv);
  }, [approval?.deadlineTimestamp, approval?.senderDecision, approval?.receiverDecision, transfer?.id, dispatch]);

  if (!transfer || !approval) return null;

  const handleApprove = (party: "sender" | "receiver") => {
    dispatch({
      type: "SUBMIT_PARTY_APPROVAL",
      txId: transfer.id,
      party,
      decision: "APPROVED",
      note: `Approved via ${party.toUpperCase()} portal`,
    });
  };

  const handleReject = (party: "sender" | "receiver") => {
    dispatch({
      type: "SUBMIT_PARTY_APPROVAL",
      txId: transfer.id,
      party,
      decision: "REJECTED",
      note: `Rejected via ${party.toUpperCase()} portal`,
    });
  };

  const content = (
    <div className={cn("space-y-5", embedded ? "" : "max-w-2xl w-full")}>
      {/* Top Threat Alert Header */}
      <div className="rounded-2xl border border-danger/50 bg-danger/10 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-danger/20 text-danger ring-2 ring-danger/30">
              <ShieldAlert className="size-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  TWO-PARTY SECURITY ALERT
                </span>
                <span className="font-mono text-xs font-bold text-danger">Risk {approval.riskScore}/100</span>
              </div>
              <h3 className="mt-1 font-display text-lg font-bold text-foreground">
                {approval.reason}
              </h3>
            </div>
          </div>

          {/* Countdown timer badge */}
          <div className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-1.5 self-start sm:self-auto",
            secondsRemaining > 15
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-danger/60 bg-danger/20 text-danger animate-pulse"
          )}>
            <Clock className="size-4" />
            <div className="text-right">
              <span className="font-mono text-xs font-bold">{secondsRemaining}s</span>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Response Deadline</p>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground border-t border-danger/20 pt-2.5">
          {approval.anomalySummary} — Execution policy mandates independent explicit consent from both parties prior to cross-chain fund release.
        </p>
      </div>

      {/* Transaction Snapshot Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-xl border border-border bg-secondary/30 p-3 text-xs">
        <div>
          <span className="text-[10px] font-mono uppercase text-muted-foreground">RIFT TX ID</span>
          <p className="font-mono font-bold text-foreground truncate">{transfer.id}</p>
        </div>
        <div>
          <span className="text-[10px] font-mono uppercase text-muted-foreground">AMOUNT & ASSET</span>
          <p className="font-display font-bold text-gold">{fmtMoney(transfer.amount)} {transfer.asset}</p>
        </div>
        <div>
          <span className="text-[10px] font-mono uppercase text-muted-foreground">ROUTE</span>
          <p className="font-mono text-foreground capitalize">Ethereum → {transfer.destChain}</p>
        </div>
        <div>
          <span className="text-[10px] font-mono uppercase text-muted-foreground">RECIPIENT TYPE</span>
          <p className="font-mono font-semibold text-foreground uppercase">{transfer.recipientType || "REGISTERED"}</p>
        </div>
      </div>

      {/* Dual Party Decision Progress Overview */}
      <div className="grid sm:grid-cols-2 gap-3">
        {/* Sender State Card */}
        <div className={cn(
          "rounded-xl border p-3.5 transition-all",
          approval.senderDecision === "APPROVED"
            ? "border-success/40 bg-success/5"
            : approval.senderDecision === "REJECTED"
            ? "border-danger/40 bg-danger/5"
            : "border-border bg-secondary/20"
        )}>
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">Sender Signer</span>
            <span className={cn(
              "rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase",
              approval.senderDecision === "APPROVED" ? "bg-success/20 text-success" :
              approval.senderDecision === "REJECTED" ? "bg-danger/20 text-danger" : "bg-warning/20 text-warning"
            )}>
              {approval.senderDecision}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {approval.senderDecision === "APPROVED" ? "Verified and approved by client vault operator." :
             approval.senderDecision === "REJECTED" ? "Explicitly rejected. Operation terminated." :
             "Pending sender consent."}
          </p>
        </div>

        {/* Receiver State Card */}
        <div className={cn(
          "rounded-xl border p-3.5 transition-all",
          approval.receiverDecision === "APPROVED"
            ? "border-success/40 bg-success/5"
            : approval.receiverDecision === "REJECTED"
            ? "border-danger/40 bg-danger/5"
            : "border-border bg-secondary/20"
        )}>
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">Receiver Beneficiary</span>
            <span className={cn(
              "rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase",
              approval.receiverDecision === "APPROVED" ? "bg-success/20 text-success" :
              approval.receiverDecision === "REJECTED" ? "bg-danger/20 text-danger" : "bg-warning/20 text-warning"
            )}>
              {approval.receiverDecision}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {approval.receiverDecision === "APPROVED" ? "Verified and confirmed by destination counterparty." :
             approval.receiverDecision === "REJECTED" ? "Rejected by recipient. Transfer blocked." :
             "Awaiting receiver validation and authorization."}
          </p>
        </div>
      </div>

      {/* Role Console Toggle Switch */}
      <div className="rounded-xl border border-border bg-secondary/40 p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-foreground">Simulate Approval Role:</span>
          <div className="flex rounded-lg border border-border p-0.5 bg-background">
            <button
              onClick={() => setActiveRole("sender")}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                activeRole === "sender" ? "bg-gold text-gold-foreground font-bold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Sender View
            </button>
            <button
              onClick={() => setActiveRole("receiver")}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                activeRole === "receiver" ? "bg-gold text-gold-foreground font-bold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Receiver View
            </button>
          </div>
        </div>

        {/* Active Role Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-border/60">
          <div className="text-xs text-muted-foreground">
            Reviewing as: <strong className="text-foreground capitalize">{activeRole}</strong> · Decisions are logged in audit ledger.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleReject(activeRole)}
              disabled={transfer.state === "REJECTED" || transfer.state === "EXPIRED" || (activeRole === "sender" ? approval.senderDecision === "REJECTED" : approval.receiverDecision === "REJECTED")}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-bold text-danger hover:bg-danger/20 transition-all disabled:opacity-50"
            >
              <XCircle className="size-4" /> REJECT TRANSACTION
            </button>

            <button
              onClick={() => handleApprove(activeRole)}
              disabled={transfer.state === "REJECTED" || transfer.state === "EXPIRED" || (activeRole === "sender" ? approval.senderDecision === "APPROVED" : approval.receiverDecision === "APPROVED")}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-success px-4 py-2 text-xs font-bold text-success-foreground hover:bg-success/90 shadow transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="size-4" /> CONTINUE TRANSACTION
            </button>
          </div>
        </div>
      </div>

      {/* Footer Navigation: View Evidence & Close */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-border/80">
        <button
          onClick={() => {
            onClose?.();
            navigate({ to: "/incidents" });
          }}
          className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline font-semibold"
        >
          <ExternalLink className="size-3.5" /> VIEW SECURITY EVIDENCE IN INCIDENT ROOM
        </button>

        {!embedded && (
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground font-mono"
          >
            DISMISS MODAL [×]
          </button>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return <div className="rounded-2xl border border-gold/40 bg-background/80 p-4 sm:p-6 backdrop-blur-xl">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-4">
      <div className="rounded-2xl border border-gold/50 bg-background p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto w-full max-w-2xl ring-1 ring-gold/20 animate-in fade-in zoom-in-95 duration-150">
        {content}
      </div>
    </div>
  );
}
