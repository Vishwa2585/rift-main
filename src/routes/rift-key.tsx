import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, Mono, StatusPill, GhostButton, GoldButton } from "@/components/rift/ui";
import { NfcPanel } from "@/components/rift/NfcPanel";
import { useRift } from "@/lib/rift/store";
import { ENROLLED_DEVICES } from "@/lib/rift/data";
import { KeyRound, Lock, ShieldCheck, Cpu } from "lucide-react";

export const Route = createFileRoute("/rift-key")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "RIFT Key — Physical NFC Authorization" },
      {
        name: "description",
        content:
          "Read a real NFC tag with Web NFC and validate it against the enrolled demo device registry.",
      },
      { property: "og:title", content: "RIFT Key — Physical NFC Authorization" },
      { property: "og:description", content: "Real NFC tag reading for transfer authorization." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RiftKey,
});

function RiftKey() {
  const { state, dispatch } = useRift();
  const transfers = state?.transfers || [];
  const consumedAuthNonces = state?.consumedAuthNonces || [];

  const pending = transfers.find(
    (t) => t && (t.state === "PENDING_RIFT_KEY" || t.stage === "AWAITING_AUTHORIZATION"),
  );

  const handleSimulateKeyTap = () => {
    if (!pending) return;
    dispatch({
      type: "AUDIT",
      actor: "RIFT KEY SIMULATOR",
      action: "TAG_TAP",
      detail: `Programmed RIFT Key tap executed for transfer ${pending.id}`,
    });

    if (pending.keyChallenge) {
      dispatch({
        type: "VALIDATE_RIFT_KEY_CHALLENGE",
        txId: pending.id,
        nonce: pending.keyChallenge.nonce,
        digest: pending.keyChallenge.digest,
        cardSerial: "04:A2:8B:E3:44:01",
      });
    } else {
      dispatch({
        type: "NFC_VERIFIED",
        txId: pending.id,
        payload: "RIFT-KEY:v2:AUTH",
      });
    }
  };

  return (
    <AppLayout>
      <SectionTitle
        eyebrow="Hardware & Cryptography"
        title="RIFT Key Device Lab"
        right={<span className="font-mono text-xs text-gold">RULE R-08 REPLAY GUARD</span>}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <GlassPanel className="p-4 sm:p-6 lg:col-span-3">
          <NfcPanel
            onRead={(r) => {
              dispatch({
                type: "AUDIT",
                actor: "RIFT KEY",
                action: "TAG_READ",
                detail: `Physical tag read: serial ${r.serialNumber || "unknown"} · payload ${r.payload ?? "(empty)"}`,
              });
              if (pending) {
                if (pending.keyChallenge) {
                  dispatch({
                    type: "VALIDATE_RIFT_KEY_CHALLENGE",
                    txId: pending.id,
                    nonce: pending.keyChallenge.nonce,
                    digest: pending.keyChallenge.digest,
                    cardSerial: r.serialNumber || "04:A2:8B:E3:44:01",
                  });
                } else {
                  dispatch({
                    type: "NFC_VERIFIED",
                    txId: pending.id,
                    payload: r.payload || "RIFT-KEY:v2:AUTH",
                  });
                }
              }
            }}
          />

          {/* Quick Hardware Simulator for non-Android / Desktop */}
          {pending && (
            <div className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Cpu className="size-3.5 text-gold" /> Desktop Testing Simulator
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  No physical Web NFC hardware attached? Validate challenge using enrolled demo credentials.
                </p>
              </div>
              <GoldButton onClick={handleSimulateKeyTap} className="shrink-0 text-xs py-1.5 px-3">
                <ShieldCheck className="size-3.5 mr-1" /> Tap Simulated RIFT Key
              </GoldButton>
            </div>
          )}

          {/* Cryptographic Replay Protection Status */}
          <div className="mt-6 rounded-2xl border border-border bg-card/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Lock className="size-3.5 text-gold" /> Replay Protection Engine (Rule R-08)
              </span>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                Active & Enforced
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Single-use authorization tokens cannot be replayed. Every consumed nonce is atomically quarantined:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {consumedAuthNonces.map((nonce) => (
                <span
                  key={nonce}
                  className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground line-through"
                >
                  {nonce}
                </span>
              ))}
              {consumedAuthNonces.length === 0 && (
                <span className="text-[10px] text-muted-foreground italic">No nonces consumed yet</span>
              )}
            </div>
          </div>
        </GlassPanel>

        <div className="space-y-6 lg:col-span-2">
          {/* Active Pending Transfer & Challenge */}
          <GlassPanel className="p-4 sm:p-6">
            <h3 className="mb-3 font-display text-lg font-semibold flex items-center gap-2">
              <KeyRound className="size-4 text-gold" />
              Transfer Awaiting RIFT Key
            </h3>
            {pending ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Mono className="font-bold">{pending.id}</Mono>
                  <StatusPill status={pending.status} />
                </div>
                <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount:</span>
                    <strong className="text-gold font-mono">
                      {(pending.amount ?? 0).toLocaleString()} {pending.asset}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Destination:</span>
                    <span className="uppercase font-semibold">{pending.destChain}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recipient:</span>
                    <Mono className="text-[10px]">{pending.recipient}</Mono>
                  </div>
                </div>

                {pending.keyChallenge ? (
                  <div className="rounded-xl border border-gold/30 bg-gold/5 p-3 text-xs space-y-1">
                    <p className="text-[10px] uppercase font-bold text-gold">Bound Cryptographic Challenge</p>
                    <p className="text-muted-foreground text-[11px]">
                      Nonce: <Mono className="text-foreground">{pending.keyChallenge.nonce}</Mono>
                    </p>
                    <p className="text-muted-foreground text-[10px] truncate">
                      SHA-256: <Mono className="text-gold">{pending.keyChallenge.digest}</Mono>
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    A physical NFC tap on this reader validates and settles this transfer.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="mb-3 text-sm text-muted-foreground">
                  No transfer is waiting. Initiate one in RIFT Bank first.
                </p>
                <Link to="/bank">
                  <GhostButton>Go to RIFT Bank</GhostButton>
                </Link>
              </div>
            )}
          </GlassPanel>

          {/* Enrolled Demo Hardware Devices */}
          <GlassPanel className="p-4 sm:p-6">
            <h3 className="mb-3 font-display text-lg font-semibold">Enrolled Demo Devices</h3>
            {(ENROLLED_DEVICES || []).map((d) => (
              <div key={d.id} className="rounded-xl border border-border bg-secondary/30 p-4 mb-2 last:mb-0">
                <p className="text-sm font-medium">{d.label}</p>
                <Mono className="text-muted-foreground text-xs">
                  {d.payload} · enrolled {d.enrolled}
                </Mono>
              </div>
            ))}
          </GlassPanel>
        </div>
      </div>
    </AppLayout>
  );
}
