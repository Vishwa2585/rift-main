import React, { useState } from "react";
import { useAuth, DEMO_USERS } from "@/lib/rift/auth-context";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  ShieldCheck,
  Bell,
  User,
  LogOut,
  LogIn,
  UserPlus,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  X,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export function AuthBar() {
  const {
    user,
    trustProfile,
    securityFindings,
    unreadFindingsCount,
    signIn,
    signUp,
    signOut,
    quickLogin,
    refreshFindings,
    isLoading,
  } = useAuth();

  const [showModal, setShowModal] = useState(false);
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "switch">("switch");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAuthError(null);
    const res = await signIn(email, password);
    setSubmitting(false);
    if (res.error) {
      setAuthError(res.error);
    } else {
      setShowModal(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAuthError(null);
    const res = await signUp(email, password, fullName);
    setSubmitting(false);
    if (res.error) {
      setAuthError(res.error);
    } else {
      setShowModal(false);
    }
  };

  const handleQuickSwitch = async (demoEmail: string) => {
    await quickLogin(demoEmail);
    setShowModal(false);
  };

  const score = trustProfile?.current_score ?? 700;
  const isHealthyScore = score >= 600;

  return (
    <div className="relative flex items-center gap-2">
      {/* Real-time Alert Notification Bell */}
      <div className="relative">
        <button
          onClick={() => setShowAlertsDropdown((prev) => !prev)}
          className={cn(
            "relative flex size-9 items-center justify-center rounded-xl border transition-all",
            unreadFindingsCount > 0
              ? "border-rose-500/50 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
              : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground",
          )}
          title={
            unreadFindingsCount > 0
              ? `${unreadFindingsCount} Active Security Findings in Supabase`
              : "No active security findings"
          }
        >
          <Bell className="size-4" />
          {unreadFindingsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white animate-pulse">
              {unreadFindingsCount}
            </span>
          )}
        </button>

        {/* Security Findings Popover */}
        {showAlertsDropdown && (
          <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-border bg-background/95 backdrop-blur-xl p-4 shadow-2xl z-50">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-rose-400" />
                <h4 className="font-display text-sm font-semibold text-foreground">
                  Security Alerts ({securityFindings.length})
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refreshFindings()}
                  className="text-xs text-muted-foreground hover:text-foreground p-1"
                  title="Refresh findings from Supabase"
                >
                  <RefreshCw className="size-3.5" />
                </button>
                <button
                  onClick={() => setShowAlertsDropdown(false)}
                  className="text-xs text-muted-foreground hover:text-foreground p-1"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-3 max-h-72 overflow-y-auto space-y-2 pr-1">
              {securityFindings.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  <ShieldCheck className="mx-auto size-6 text-emerald-400 mb-1 opacity-70" />
                  No security alerts attributed to this identity.
                </div>
              ) : (
                securityFindings.map((f) => {
                  const isSender = f.attribution_role === "SENDER";
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "rounded-xl border p-3 text-xs transition-colors",
                        isSender
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-100",
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                            isSender
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30",
                          )}
                        >
                          {f.attribution_role || "PARTY"}: {f.severity}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(f.finding_timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="font-semibold text-foreground truncate">
                        {f.rule_name || "Exploit Intercepted"}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                        {String(
                          f.evidence?.["reasons"] ||
                            f.evidence?.["notice"] ||
                            f.evidence?.["note"] ||
                            "Cross-chain exploit prevented by RIFT security engine.",
                        )}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* User Identity Button / Pill */}
      {user ? (
        <button
          onClick={() => {
            setAuthMode("switch");
            setShowModal(true);
          }}
          className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-1.5 text-xs transition-all hover:border-gold/50"
        >
          <div className="flex size-6 items-center justify-center rounded-full bg-gold/15 text-[10px] font-bold text-gold border border-gold/30">
            {user.email?.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-left hidden sm:block max-w-[130px] truncate">
            <p className="font-semibold text-foreground truncate">{user.email?.split("@")[0]}</p>
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isHealthyScore ? "bg-emerald-400" : "bg-amber-400",
                )}
              />
              <span className="text-[10px] text-muted-foreground">Trust: {score}</span>
            </div>
          </div>
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      ) : (
        <button
          onClick={() => {
            setAuthMode("switch");
            setShowModal(true);
          }}
          className="flex items-center gap-1.5 rounded-xl border border-gold/50 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold transition-all hover:bg-gold/20"
        >
          <LogIn className="size-3.5" />
          <span>Connect Identity</span>
        </button>
      )}

      {/* Auth & Identity Switcher Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-xl bg-gold/15 text-gold border border-gold/30">
                  <User className="size-4" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">
                    Supabase Identity Hub
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Shared Auth & Trust Profile across RIFT and RIFT Bank
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Mode Switch Tabs */}
            <div className="mt-4 flex rounded-xl border border-border bg-secondary/30 p-1 text-xs">
              <button
                onClick={() => setAuthMode("switch")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 font-semibold transition-all",
                  authMode === "switch"
                    ? "bg-gold text-gold-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Switch User
              </button>
              <button
                onClick={() => setAuthMode("signin")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 font-semibold transition-all",
                  authMode === "signin"
                    ? "bg-gold text-gold-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Email Sign In
              </button>
              <button
                onClick={() => setAuthMode("signup")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 font-semibold transition-all",
                  authMode === "signup"
                    ? "bg-gold text-gold-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Sign Up
              </button>
            </div>

            {/* 1. Switch Demo Users */}
            {authMode === "switch" && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Select an identity to test Two-Party Alert attribution (Sender vs Receiver):
                </p>
                {DEMO_USERS.map((demo) => {
                  const isActive = user?.email === demo.email;
                  return (
                    <button
                      key={demo.id}
                      onClick={() => handleQuickSwitch(demo.email)}
                      className={cn(
                        "w-full flex items-center justify-between rounded-xl border p-3 text-left transition-all",
                        isActive
                          ? "border-gold/60 bg-gold/15 text-foreground"
                          : "border-border bg-secondary/30 hover:border-gold/30 hover:bg-secondary/50",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-foreground truncate">{demo.name}</p>
                          {isActive && (
                            <span className="rounded-full bg-gold/20 px-1.5 py-0.2 text-[9px] font-bold text-gold">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">{demo.email}</p>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0 ml-2">
                        {demo.role}
                      </span>
                    </button>
                  );
                })}

                {user && (
                  <button
                    onClick={() => {
                      signOut();
                      setShowModal(false);
                    }}
                    className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-border p-2.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <LogOut className="size-3.5" />
                    Sign Out Current Identity
                  </button>
                )}
              </div>
            )}

            {/* 2. Email Sign In Form */}
            {authMode === "signin" && (
              <form onSubmit={handleSignIn} className="mt-4 space-y-3">
                {authError && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                    {authError}
                  </div>
                )}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="mt-1 w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground focus:border-gold outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1 w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground focus:border-gold outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-2 rounded-xl bg-gold py-2.5 text-xs font-bold text-gold-foreground transition-all hover:bg-gold/90 disabled:opacity-50"
                >
                  {submitting ? "Signing in..." : "Sign In with Supabase"}
                </button>
              </form>
            )}

            {/* 3. Sign Up Form */}
            {authMode === "signup" && (
              <form onSubmit={handleSignUp} className="mt-4 space-y-3">
                {authError && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                    {authError}
                  </div>
                )}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    className="mt-1 w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground focus:border-gold outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@company.com"
                    className="mt-1 w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground focus:border-gold outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1 w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground focus:border-gold outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-2 rounded-xl bg-gold py-2.5 text-xs font-bold text-gold-foreground transition-all hover:bg-gold/90 disabled:opacity-50"
                >
                  {submitting ? "Creating account..." : "Sign Up & Register Identity"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
