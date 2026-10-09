// Real Web NFC reading via NDEFReader. Never simulated.
import { useCallback, useRef, useState } from "react";
import { ENROLLED_DEVICES } from "./data";

export type NfcStatus =
  | "idle" | "unsupported" | "insecure" | "requesting" | "scanning"
  | "read" | "denied" | "error";

export interface NfcReadResult {
  serialNumber: string;
  records: { recordType: string; data: string }[];
  payload: string | null;
  recognized: (typeof ENROLLED_DEVICES)[number] | null;
  at: number;
}

export function nfcSupport(): { supported: boolean; secure: boolean } {
  if (typeof window === "undefined") return { supported: false, secure: false };
  return { supported: "NDEFReader" in window, secure: window.isSecureContext };
}

export function useNfc() {
  const [status, setStatus] = useState<NfcStatus>("idle");
  const [result, setResult] = useState<NfcReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((s) => (s === "scanning" || s === "requesting" ? "idle" : s));
  }, []);

  const scan = useCallback(async (): Promise<NfcReadResult | null> => {
    const { supported, secure } = nfcSupport();
    setError(null);
    setResult(null);
    if (!secure) { setStatus("insecure"); return null; }
    if (!supported) { setStatus("unsupported"); return null; }

    setStatus("requesting");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reader = new (window as any).NDEFReader();
      await reader.scan({ signal: ctrl.signal });
      setStatus("scanning");

      return await new Promise<NfcReadResult | null>((resolve) => {
        reader.onreadingerror = () => {
          setError("A tag was detected but could not be read. Ensure it is NDEF-formatted and try again.");
          setStatus("error");
          resolve(null);
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reader.onreading = (event: any) => {
          const records = (event.message?.records ?? []).map((r: any) => {
            let data = "";
            try {
              const decoder = new TextDecoder(r.encoding || "utf-8");
              data = r.data ? decoder.decode(r.data) : "";
            } catch { data = "(binary)"; }
            return { recordType: r.recordType, data };
          });
          const payload = records.find((r: any) => r.data.startsWith("RIFT-KEY:"))?.data ?? records[0]?.data ?? null;
          const recognized = ENROLLED_DEVICES.find((d) => d.payload === payload) ?? null;
          const res: NfcReadResult = { serialNumber: event.serialNumber || "(not exposed)", records, payload, recognized, at: Date.now() };
          setResult(res);
          setStatus("read");
          ctrl.abort();
          resolve(res);
        };
      });
    } catch (e: any) {
      if (e?.name === "NotAllowedError") {
        setStatus("denied");
        setError("NFC permission was denied. Allow NFC access in site settings and retry.");
      } else if (e?.name === "AbortError") {
        setStatus("idle");
      } else {
        setStatus("error");
        setError(e?.message || "NFC scan failed. Ensure NFC is enabled on this device.");
      }
      return null;
    }
  }, []);

  return { status, result, error, scan, stop };
}
