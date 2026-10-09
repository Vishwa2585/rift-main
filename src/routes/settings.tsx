import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout, ThemeToggle } from "@/components/rift/Layout";
import { GlassPanel, SectionTitle, GoldButton, GhostButton } from "@/components/rift/ui";
import { useRift } from "@/lib/rift/store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RIFT" },
      { name: "description", content: "Appearance, demo reset, and intro replay controls for the RIFT demonstration." },
      { property: "og:title", content: "Settings — RIFT" },
      { property: "og:description", content: "RIFT demo settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { dispatch } = useRift();
  const navigate = useNavigate();
  return (
    <AppLayout>
      <SectionTitle eyebrow="Preferences" title="Settings" />
      <div className="grid gap-6 md:grid-cols-2">
        <GlassPanel className="p-6">
          <h3 className="mb-1 font-display text-lg font-semibold">Appearance</h3>
          <p className="mb-4 text-sm text-muted-foreground">Dark, Light, or follow System. Saved on this device.</p>
          <ThemeToggle />
        </GlassPanel>
        <GlassPanel className="p-6">
          <h3 className="mb-1 font-display text-lg font-semibold">Demo control</h3>
          <p className="mb-4 text-sm text-muted-foreground">Reset every transfer, incident, rule, and log to the initial demo state.</p>
          <div className="flex flex-wrap gap-3">
            <GoldButton onClick={() => { dispatch({ type: "RESET" }); navigate({ to: "/overview" }); }}>Reset simulation</GoldButton>
            <GhostButton onClick={() => navigate({ to: "/" })}>Replay intro</GhostButton>
          </div>
        </GlassPanel>
        <GlassPanel className="p-6 md:col-span-2">
          <h3 className="mb-2 font-display text-lg font-semibold">About this demonstration</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            RIFT Bank, clients, balances, transactions, blockchain hashes, attacks, and detections are simulated with deterministic demo data.
            The only real hardware interaction is RIFT Key NFC reading via Web NFC. Reading an NDEF tag is not cryptographic proof of identity.
          </p>
        </GlassPanel>
      </div>
    </AppLayout>
  );
}
