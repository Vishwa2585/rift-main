import React from "react";
import { Nfc, ShieldCheck, ShieldX, AlertTriangle } from "lucide-react";
import { useNfc, nfcSupport, type NfcReadResult } from "@/lib/rift/nfc";
import { DEMO_TAG_PAYLOAD } from "@/lib/rift/data";
import { GoldButton, GhostButton, Mono } from "./ui";
import { cn } from "@/lib/utils";

const STATUS_COPY: Record<string, string> = {
  idle: "Reader idle",
  requesting: "Requesting NFC access…",
  scanning: "Waiting for tap — hold the RIFT Key tag to the back of the phone",
  read: "Tag read (real NFC event)",
  unsupported: "Web NFC is not supported in this browser",
  insecure: "Web NFC requires HTTPS",
  denied: "NFC permission denied",
  error: "NFC error",
};

export function NfcPanel({ onRead, compact }: { onRead?: (r: NfcReadResult) => void; compact?: boolean }) {
  const { status, result, error, scan, stop } = useNfc();
  const support = typeof window !== "undefined" ? nfcSupport() : { supported: false, secure: false };

  const start = async () => {
    const r = await scan();
    if (r) onRead?.(r);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em]">
        <span className={cn("rounded-full border px-2.5 py-0.5", support.supported ? "border-success/40 text-success" : "border-danger/40 text-danger")}>
          Web NFC: {support.supported ? "available" : "unavailable"}
        </span>
        <span className={cn("rounded-full border px-2.5 py-0.5", support.secure ? "border-success/40 text-success" : "border-danger/40 text-danger")}>
          Secure context: {support.secure ? "yes" : "no"}
        </span>
      </div>

      <div className="flex flex-col items-center rounded-2xl border border-border bg-secondary/30 px-6 py-8 text-center">
        <div className={cn(
          "flex size-24 items-center justify-center rounded-full border-2",
          status === "scanning" ? "animate-pulse-ring border-gold text-gold" :
          status === "read" && result?.recognized ? "border-success text-success" :
          status === "read" ? "border-danger text-danger" : "border-border text-muted-foreground",
        )}>
          {status === "read" && result?.recognized ? <ShieldCheck className="size-10" /> :
           status === "read" ? <ShieldX className="size-10" /> :
           <Nfc className={cn("size-10", status === "scanning" && "animate-scan-pulse")} />}
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">{STATUS_COPY[status]}</p>
        {error && <p className="mt-2 max-w-sm text-xs text-danger">{error}</p>}

        <div className="mt-5 flex gap-3">
          {status !== "scanning" && status !== "requesting" ? (
            <GoldButton onClick={start}><Nfc className="size-4" /> Authorize with RIFT Key</GoldButton>
          ) : (
            <GhostButton onClick={stop}>Cancel scan</GhostButton>
          )}
        </div>
      </div>

      {result && (
        <div className="rounded-2xl border border-border bg-secondary/30 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Actual NFC read result</p>
          <dl className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs min-w-0">
            <dt className="text-muted-foreground">Serial</dt><dd className="min-w-0"><Mono className="break-all">{result.serialNumber}</Mono></dd>
            <dt className="text-muted-foreground">Payload</dt><dd className="min-w-0"><Mono className="break-all">{result.payload ?? "(empty)"}</Mono></dd>
            <dt className="text-muted-foreground">Records</dt><dd className="min-w-0"><Mono className="break-all">{result.records.map((r) => r.recordType).join(", ") || "none"}</Mono></dd>
            <dt className="text-muted-foreground">Read at</dt><dd className="min-w-0"><Mono>{new Date(result.at).toLocaleTimeString()}</Mono></dd>
            <dt className="text-muted-foreground">Device</dt>
            <dd className={cn("min-w-0", result.recognized ? "text-success" : "text-danger")}>
              {result.recognized ? result.recognized.label : "Not enrolled — authorization refused"}
            </dd>
          </dl>
        </div>
      )}

      {(status === "unsupported" || status === "insecure") && (
        <div className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/5 p-4 text-xs text-muted-foreground">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <div>
            <p className="font-semibold text-foreground">Use a supported device</p>
            <p className="mt-1">Open this app over HTTPS in Chrome on an NFC-capable Android phone with NFC turned on. Desktop browsers and iOS do not support Web NFC. No simulated tap is offered.</p>
          </div>
        </div>
      )}

      {!compact && (
        <div className="rounded-2xl border border-border p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">Preparing a demo tag</p>
          Write a single NDEF text record containing <Mono className="text-gold">{DEMO_TAG_PAYLOAD}</Mono> to any NTAG213/215/216 tag (e.g. with the free “NFC Tools” app → Write → Add a record → Text).
          <p className="mt-3 font-semibold text-foreground">Security honesty</p>
          An ordinary NDEF tag is not a cryptographic signing device. A successful read proves a compatible tag was physically read — not identity, and not protection against cloning. The authorization that follows is simulated for this demo.
        </div>
      )}
    </div>
  );
}
