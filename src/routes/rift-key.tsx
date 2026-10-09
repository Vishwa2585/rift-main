import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, Mono, StatusPill, GhostButton } from "@/components/rift/ui";
import { NfcPanel } from "@/components/rift/NfcPanel";
import { useRift } from "@/lib/rift/store";
import { ENROLLED_DEVICES } from "@/lib/rift/data";

export const Route = createFileRoute("/rift-key")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "RIFT Key — Physical NFC Authorization" },
      { name: "description", content: "Read a real NFC tag with Web NFC and validate it against the enrolled demo device registry." },
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
  const pending = state.transfers.find((t) => t.stage === "AWAITING_AUTHORIZATION");

  return (
    <AppLayout>
      <SectionTitle eyebrow="Hardware" title="RIFT Key" />
      <div className="grid gap-6 lg:grid-cols-5">
        <GlassPanel className="p-4 sm:p-6 lg:col-span-3">
          <NfcPanel
            onRead={(r) => {
              dispatch({ type: "AUDIT", actor: "RIFT KEY", action: "TAG_READ", detail: `Payload ${r.payload ?? "(empty)"} · ${r.recognized ? "recognized" : "unrecognized"}` });
              if (r.recognized && r.payload && pending) {
                dispatch({ type: "NFC_VERIFIED", txId: pending.id, payload: r.payload });
              }
            }}
          />
        </GlassPanel>
        <div className="space-y-6 lg:col-span-2">
          <GlassPanel className="p-4 sm:p-6">
            <h3 className="mb-3 font-display text-lg font-semibold">Enrolled demo devices</h3>
            {ENROLLED_DEVICES.map((d) => (
              <div key={d.id} className="rounded-xl border border-border bg-secondary/30 p-4">
                <p className="text-sm font-medium">{d.label}</p>
                <Mono className="text-muted-foreground">{d.payload} · enrolled {d.enrolled}</Mono>
              </div>
            ))}
          </GlassPanel>
          <GlassPanel className="p-4 sm:p-6">
            <h3 className="mb-3 font-display text-lg font-semibold">Transfer awaiting authorization</h3>
            {pending ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Mono>{pending.id}</Mono><StatusPill status={pending.status} /></div>
                <p className="text-xs text-muted-foreground">A recognized tap here authorizes this transfer (simulated authorization after a real read).</p>
              </div>
            ) : (
              <div>
                <p className="mb-3 text-sm text-muted-foreground">No transfer is waiting. Create one in RIFT Bank first.</p>
                <Link to="/bank"><GhostButton>Go to RIFT Bank</GhostButton></Link>
              </div>
            )}
          </GlassPanel>
        </div>
      </div>
    </AppLayout>
  );
}
