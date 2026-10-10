import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useRift } from "@/lib/rift/store";
import { TwoPartyAlertModal } from "./TwoPartyAlertModal";
import { SimBadge } from "./ui";
import {
  LayoutDashboard, Landmark, ArrowLeftRight, Radar, ShieldAlert, History,
  Nfc, BarChart3, BookLock, Settings, Sun, Moon, Monitor, RotateCcw, Menu, X, Play,
  Users, CheckCircle2,
} from "lucide-react";

const NAV = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/bank", label: "RIFT Bank", icon: Landmark },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/command-room", label: "Command Room", icon: Radar },
  { to: "/incidents", label: "Incidents", icon: ShieldAlert },
  { to: "/replay", label: "Replay Lab", icon: History },
  { to: "/rift-key", label: "RIFT Key", icon: Nfc },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/audit", label: "Audit Ledger", icon: BookLock },
  { to: "/settings", label: "Settings", icon: Settings },
];

type Theme = "dark" | "light" | "system";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.toggle("dark", theme === "dark" || (theme === "system" && prefersDark));
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (window.localStorage.getItem("rift-theme") as Theme) || "dark";
  });
  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem("rift-theme", theme);
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const fn = () => applyTheme("system");
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    }
    return undefined;
  }, [theme]);
  return { theme, setTheme };
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const order: Theme[] = ["dark", "light", "system"];
  const icons = { dark: Moon, light: Sun, system: Monitor };
  return (
    <div className="flex rounded-xl border border-border bg-secondary/40 p-1">
      {order.map((t) => {
        const Icon = icons[t];
        return (
          <button
            key={t}
            onClick={() => setTheme(t)}
            aria-label={`${t} theme`}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              theme === t ? "bg-gold text-gold-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { state, dispatch } = useRift();
  const incidents = state?.incidents || [];
  const transfers = state?.transfers || [];
  const openIncidents = incidents.filter((i) => i && i.status === "open").length;
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const pendingApprovalTx = transfers.find(
    (t) =>
      t &&
      t.twoPartyApproval &&
      t.state === "PENDING_PARTY_APPROVAL" &&
      (t.twoPartyApproval.senderDecision === "PENDING" || t.twoPartyApproval.receiverDecision === "PENDING")
  );
  const activeApprovalTx = state?.activeApprovalTxId
    ? transfers.find((t) => t && t.id === state.activeApprovalTxId)
    : pendingApprovalTx;

  return (
    <div className="min-h-screen bg-background w-full max-w-full overflow-x-hidden">
      {/* Two-Party Security Alert Modal */}
      {(showApprovalModal || state.activeApprovalTxId) && activeApprovalTx && (
        <TwoPartyAlertModal
          txId={activeApprovalTx.id}
          onClose={() => {
            setShowApprovalModal(false);
            dispatch({ type: "SET_ACTIVE_APPROVAL", txId: null });
          }}
        />
      )}

      {/* ambient backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0" style={{ background: "radial-gradient(1200px 600px at 80% -10%, color-mix(in oklab, var(--color-gold) 8%, transparent), transparent 60%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(900px 500px at 10% 110%, color-mix(in oklab, var(--color-gold) 5%, transparent), transparent 60%)" }} />
      </div>

      {/* sidebar backdrop for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-background/95 backdrop-blur-2xl transition-transform lg:translate-x-0",
        open ? "translate-x-0 shadow-2xl" : "-translate-x-full",
      )}>
        <div className="flex items-center justify-between px-5 py-5">
          <Link to="/overview" onClick={() => setOpen(false)} className="font-display text-2xl font-bold tracking-[0.3em] gold-text">RIFT</Link>
          <button
            className="flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mx-5 mb-4 shimmer-line" />
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to} to={to} onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                  active ? "bg-gold/10 font-semibold text-gold" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
                {label === "Incidents" && openIncidents > 0 && (
                  <span className="ml-auto rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold text-danger">{openIncidents}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-border p-4">
          <div className="rounded-xl border border-gold/25 bg-gold/5 p-3 text-[10px] leading-relaxed text-muted-foreground">
            <p className="mb-1 font-semibold tracking-[0.18em] text-gold">SIMULATION ENVIRONMENT</p>
            FICTIONAL CLIENTS · TEST DATA · NO REAL BANK CONNECTION
          </div>
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <button
              onClick={() => { dispatch({ type: "RESET" }); navigate({ to: "/overview" }); }}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              title="Reset the demo to its initial state"
            >
              <RotateCcw className="size-3.5" /> Reset
            </button>
          </div>
        </div>
      </aside>

      {/* top bar (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="flex size-9 items-center justify-center rounded-xl border border-border bg-secondary/40 text-foreground transition-transform active:scale-95"
          >
            <Menu className="size-5" />
          </button>
          <Link to="/overview" className="font-display text-lg font-bold tracking-[0.25em] gold-text">
            RIFT
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {openIncidents > 0 && (
            <Link
              to="/incidents"
              className="flex items-center gap-1.5 rounded-xl border border-danger/40 bg-danger/15 px-2 py-1 text-xs font-bold text-danger animate-pulse"
            >
              <ShieldAlert className="size-3.5" />
              <span>{openIncidents}</span>
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* mobile bottom navigation bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border bg-background/90 px-1 py-1.5 backdrop-blur-2xl lg:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {[
          { to: "/overview", label: "Overview", icon: LayoutDashboard },
          { to: "/bank", label: "Bank", icon: Landmark },
          { to: "/command-room", label: "Command", icon: Radar },
          { to: "/incidents", label: "Incidents", icon: ShieldAlert, badge: openIncidents },
          { to: "/rift-key", label: "RIFT Key", icon: Nfc },
        ].map(({ to, label, icon: Icon, badge }) => {
          const active = location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[10px] font-medium transition-colors",
                active ? "font-bold text-gold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span>{label}</span>
              {badge !== undefined && badge > 0 ? (
                <span className="absolute top-0.5 right-3 flex size-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <main className="lg:pl-64 pb-24 lg:pb-8 w-full max-w-full overflow-x-hidden min-w-0">
        <div className="mx-auto max-w-6xl w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-8 min-w-0">
          {/* Active Two-Party Approval Banner */}
          {pendingApprovalTx && pendingApprovalTx.twoPartyApproval && (
            <div className="mb-6 rounded-2xl border border-warning/70 bg-warning/15 p-4 shadow-lg shadow-warning/10 backdrop-blur-md animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-warning/20 text-warning ring-2 ring-warning/30">
                    <Users className="size-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-warning px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                        TWO-PARTY ACTION REQUIRED
                      </span>
                      <span className="font-mono text-xs font-bold text-warning">
                        Tx {pendingApprovalTx.id}
                      </span>
                      <span className="text-[11px] text-muted-foreground">· Dual Consent Gate</span>
                    </div>
                    <p className="mt-1 text-xs sm:text-sm font-semibold text-foreground">
                      {pendingApprovalTx.twoPartyApproval.reason} — Sender: <span className={cn("font-mono font-bold", pendingApprovalTx.twoPartyApproval.senderDecision === "APPROVED" ? "text-success" : "text-warning")}>{pendingApprovalTx.twoPartyApproval.senderDecision}</span> | Receiver: <span className={cn("font-mono font-bold", pendingApprovalTx.twoPartyApproval.receiverDecision === "APPROVED" ? "text-success" : "text-warning")}>{pendingApprovalTx.twoPartyApproval.receiverDecision}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    dispatch({ type: "SET_ACTIVE_APPROVAL", txId: pendingApprovalTx.id });
                    setShowApprovalModal(true);
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-warning px-4 py-2 text-xs font-bold text-black shadow-md hover:bg-warning/90 transition-transform active:scale-95"
                >
                  Review Two-Party Alert →
                </button>
              </div>
            </div>
          )}

          {/* High Priority Live Alert Banner */}
          {state.activeAlert && (
            <div className="mb-6 animate-pulse rounded-2xl border border-danger/60 bg-danger/15 p-4 shadow-lg shadow-danger/10 backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-3 rounded-full bg-danger ring-4 ring-danger/30" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        {state.activeAlert.severity} ALERT
                      </span>
                      <span className="text-xs font-semibold text-danger">Risk {state.activeAlert.score}/100</span>
                      <span className="text-[11px] text-muted-foreground">· Tx {state.activeAlert.txId}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      Suspected Anomaly: {state.activeAlert.title}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigate({ to: "/incidents" });
                    }}
                    className="inline-flex items-center justify-center rounded-xl bg-danger px-3.5 py-1.5 text-xs font-semibold text-white shadow-md transition-colors hover:bg-danger/90"
                  >
                    Investigate Incident →
                  </button>
                  <button
                    onClick={() => dispatch({ type: "DISMISS_ALERT" })}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                    title="Dismiss alert banner"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Demonstration Operations Containment Banner */}
          {state.operationsHeld && (
            <div className="mb-6 rounded-2xl border border-warning/60 bg-warning/10 p-3.5 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-xs font-medium text-warning">
                  <span className="size-2 rounded-full bg-warning" />
                  <span>DEMONSTRATION CONTAINMENT ACTIVE: New bank operations and transfers are currently held.</span>
                </div>
                <button
                  onClick={() => dispatch({ type: "TOGGLE_OPERATIONS_HELD" })}
                  className="rounded-lg border border-warning/40 bg-warning/20 px-2.5 py-1 text-[11px] font-semibold text-warning hover:bg-warning/30"
                >
                  Resume Operations
                </button>
              </div>
            </div>
          )}

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SimBadge label={`DATA SOURCE: ${state.dataSource}`} />
              <span className={cn(
                "rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider",
                state.scanningState === "SCANNING" ? "border-success/40 bg-success/10 text-success" :
                state.scanningState === "ALERT_GENERATED" ? "border-danger/40 bg-danger/10 text-danger" :
                state.scanningState === "CORRELATING" ? "border-gold/40 bg-gold/10 text-gold" :
                "border-border bg-secondary/40 text-muted-foreground"
              )}>
                {state.scanningState}
              </span>
            </div>
            <button
              onClick={() => navigate({ to: "/" })}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-gold"
            >
              <Play className="size-3" /> Replay intro
            </button>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
