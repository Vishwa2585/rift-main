import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useRift } from "@/lib/rift/store";
import { SimBadge } from "./ui";
import {
  LayoutDashboard, Landmark, ArrowLeftRight, Radar, ShieldAlert, History,
  Nfc, BarChart3, BookLock, Settings, Sun, Moon, Monitor, RotateCcw, Menu, X, Play,
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
  const location = useLocation();
  const navigate = useNavigate();
  const { state, dispatch } = useRift();
  const [open, setOpen] = useState(false);
  const openIncidents = state.incidents.filter((i) => i.status !== "resolved").length;

  return (
    <div className="min-h-screen bg-background">
      {/* ambient backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0" style={{ background: "radial-gradient(1200px 600px at 80% -10%, color-mix(in oklab, var(--color-gold) 8%, transparent), transparent 60%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(900px 500px at 10% 110%, color-mix(in oklab, var(--color-gold) 5%, transparent), transparent 60%)" }} />
      </div>

      {/* sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-background/80 backdrop-blur-xl transition-transform lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex items-center justify-between px-5 py-5">
          <Link to="/overview" className="font-display text-2xl font-bold tracking-[0.3em] gold-text">RIFT</Link>
          <button className="lg:hidden text-muted-foreground" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
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
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-foreground"><Menu className="size-5" /></button>
        <span className="font-display text-lg font-bold tracking-[0.3em] gold-text">RIFT</span>
        <ThemeToggle />
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          <div className="mb-6 flex items-center justify-between">
            <SimBadge label="SIMULATION ENVIRONMENT" />
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
