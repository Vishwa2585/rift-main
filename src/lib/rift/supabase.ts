/**
 * Supabase Client & Database Services for RIFT
 *
 * Provides shared integration with the RIFT Bank Supabase database instance:
 * - Supabase Auth (User authentication, shared identity with RIFT Bank)
 * - Two-Party Security Findings (`rift_security_findings`)
 * - Ledger Transactions (`ledger_transactions`)
 * - Trust Profiles & Score Adjustments (`trust_profiles`, `trust_score_adjustments`)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_SUPABASE_URL = "https://gazjbspyjngfqdorlduh.supabase.co";
export const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdhempic3B5am5nZnFkb3JsZHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NjY5NDEsImV4cCI6MjEwNzE0Mjk0MX0.m_v_oyW1qdOO0x6ZKeQHyb4XkDt9v1yWyfv0bL2yrEU";
export const DEFAULT_SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdhempic3B5am5nZnFkb3JsZHVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTU2Njk0MSwiZXhwIjoyMTA3MTQyOTQxfQ.HMXqNx8wFmkWYOqx5GIfP_1CSWOW0sCBSrSjlcN8iYg";

// Get Supabase URL
export function getSupabaseUrl(): string {
  if (typeof process !== "undefined" && process.env?.["SUPABASE_URL"]) {
    return process.env["SUPABASE_URL"];
  }
  // @ts-expect-error import.meta.env typing in SSR/Vite
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) {
    // @ts-expect-error import.meta.env typing in SSR/Vite
    return import.meta.env.VITE_SUPABASE_URL;
  }
  return DEFAULT_SUPABASE_URL;
}

// Get Anon Key (browser-safe)
export function getSupabaseAnonKey(): string {
  if (typeof process !== "undefined" && process.env?.["SUPABASE_ANON_KEY"]) {
    return process.env["SUPABASE_ANON_KEY"];
  }
  // @ts-expect-error import.meta.env typing in SSR/Vite
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) {
    // @ts-expect-error import.meta.env typing in SSR/Vite
    return import.meta.env.VITE_SUPABASE_ANON_KEY;
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}

// Get Service Role Key (server-only)
export function getSupabaseServiceRoleKey(): string {
  if (typeof process !== "undefined" && process.env?.["SUPABASE_SERVICE_ROLE_KEY"]) {
    return process.env["SUPABASE_SERVICE_ROLE_KEY"];
  }
  return DEFAULT_SUPABASE_SERVICE_ROLE_KEY;
}

// Singletons
let browserClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

/**
 * Client-side Supabase client using Anon key.
 * Used for user login, signup, and realtime event subscriptions.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        persistSession: typeof window !== "undefined",
        autoRefreshToken: true,
      },
    });
  }
  return browserClient;
}

/**
 * Server-side administrative client using Service Role key.
 * Grants permissions to write findings and inspect trust records.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
}

// ==============================================================================
// Database Types
// ==============================================================================

export interface SupabaseLedgerTransaction {
  id: string;
  transaction_type: string;
  status: string;
  sender_wallet_id: string | null;
  receiver_wallet_id: string | null;
  currency_id: string;
  amount: number;
  fee_amount: number;
  idempotency_key: string | null;
  reference: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  rift_operation_id: string | null;
  rift_status: string | null;
  risk_assessment: Record<string, unknown> | null;
  authorization_requirements: Record<string, unknown> | null;
  blockchain_evidence: Record<string, unknown> | null;
}

export interface SupabaseSecurityFinding {
  id: string;
  external_id: string | null;
  rift_transaction_id: string | null;
  detection_event_id: string | null;
  rule_id: string | null;
  rule_name: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  finding_type: string;
  affected_wallet_id: string | null;
  sender_wallet_id: string | null;
  receiver_wallet_id: string | null;
  attributed_user_id: string | null;
  attribution_role: "SENDER" | "RECEIVER" | null;
  status: "OPEN" | "RESOLVED" | "ACKNOWLEDGED";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  evidence: Record<string, unknown>;
  finding_timestamp: string;
  resolved_at: string | null;
  resolution_note: string | null;
  score_adjustment_id: string | null;
  ingested_at: string;
}

export interface SupabaseTrustProfile {
  id: string;
  user_id: string;
  current_score: number;
  score_version: number;
  policy_version: number;
  status_label: string;
  activity_trend: string;
  is_new_profile: boolean;
  total_adjustments: number;
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

// ==============================================================================
// Trust & User Profiles
// ==============================================================================

export async function getUserTrustProfile(
  userId: string,
): Promise<SupabaseTrustProfile | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("trust_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return data as SupabaseTrustProfile;
  } catch {
    return null;
  }
}

// ==============================================================================
// Security Findings (Two-Party CSB-01 Alerting)
// ==============================================================================

export interface InsertFindingParams {
  externalId?: string;
  riftTransactionId?: string;
  ruleId: string;
  ruleName: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  findingType?: string;
  attributedUserId?: string | null;
  attributionRole: "SENDER" | "RECEIVER";
  senderWalletId?: string | null;
  receiverWalletId?: string | null;
  evidence: Record<string, unknown>;
  confidence?: "LOW" | "MEDIUM" | "HIGH";
}

/**
 * Inserts a single security finding into `rift_security_findings`
 */
export async function insertSecurityFinding(
  params: InsertFindingParams,
): Promise<SupabaseSecurityFinding | null> {
  try {
    const supabase = getSupabaseAdmin();
    const row = {
      external_id: params.externalId || `ext-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      rift_transaction_id: params.riftTransactionId || null,
      rule_id: params.ruleId,
      rule_name: params.ruleName,
      severity: params.severity,
      finding_type: params.findingType || "BRIDGE_EXPLOIT_ATTEMPT",
      attributed_user_id: params.attributedUserId || null,
      attribution_role: params.attributionRole,
      sender_wallet_id: params.senderWalletId || null,
      receiver_wallet_id: params.receiverWalletId || null,
      affected_wallet_id:
        params.attributionRole === "SENDER"
          ? params.senderWalletId || null
          : params.receiverWalletId || null,
      confidence: params.confidence || "HIGH",
      status: "OPEN",
      evidence: params.evidence,
      finding_timestamp: new Date().toISOString(),
      ingested_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("rift_security_findings")
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error("[Supabase] Failed to insert security finding:", error.message);
      return null;
    }
    return data as SupabaseSecurityFinding;
  } catch (err) {
    console.error("[Supabase] Exception inserting security finding:", err);
    return null;
  }
}

/**
 * Objective 5: Inserts Two-Party Alerts for both Sender and Receiver
 */
export async function insertTwoPartySecurityAlerts(params: {
  riftTransactionId?: string;
  ruleId: string;
  ruleName: string;
  senderUserId?: string | null;
  receiverUserId?: string | null;
  senderWalletId?: string | null;
  receiverWalletId?: string | null;
  evidence: Record<string, unknown>;
}): Promise<{
  senderFinding: SupabaseSecurityFinding | null;
  receiverFinding: SupabaseSecurityFinding | null;
}> {
  let senderFinding: SupabaseSecurityFinding | null = null;
  let receiverFinding: SupabaseSecurityFinding | null = null;

  // 1. Sender Alert (Severity: CRITICAL, Role: SENDER)
  if (params.senderUserId) {
    senderFinding = await insertSecurityFinding({
      riftTransactionId: params.riftTransactionId,
      ruleId: params.ruleId,
      ruleName: params.ruleName,
      severity: "CRITICAL",
      findingType: "BRIDGE_EXPLOIT_ATTEMPT",
      attributedUserId: params.senderUserId,
      attributionRole: "SENDER",
      senderWalletId: params.senderWalletId,
      receiverWalletId: params.receiverWalletId,
      confidence: "HIGH",
      evidence: {
        ...params.evidence,
        alert_party: "SENDER",
        action_taken: "TRANSACTION_HALTED_BEFORE_SETTLEMENT",
      },
    });
  }

  // 2. Receiver Alert (Severity: HIGH, Role: RECEIVER)
  if (params.receiverUserId) {
    receiverFinding = await insertSecurityFinding({
      riftTransactionId: params.riftTransactionId,
      ruleId: "POL_INBOUND_EXPLOIT_INTERCEPT",
      ruleName: "Inbound Exploit / Suspicious Transaction Intercepted",
      severity: "HIGH",
      findingType: "INBOUND_EXPLOIT_INTERCEPTED",
      attributedUserId: params.receiverUserId,
      attributionRole: "RECEIVER",
      senderWalletId: params.senderWalletId,
      receiverWalletId: params.receiverWalletId,
      confidence: "HIGH",
      evidence: {
        ...params.evidence,
        alert_party: "RECEIVER",
        notice: "An inbound malicious or anomalous cross-chain transfer was intercepted and rejected before reaching your account.",
        original_exploit_rule: params.ruleId,
      },
    });
  }

  return { senderFinding, receiverFinding };
}

// ==============================================================================
// Live Ledger Transactions & Findings Queries
// ==============================================================================

export async function fetchRecentLedgerTransactions(limit = 20): Promise<SupabaseLedgerTransaction[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ledger_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as SupabaseLedgerTransaction[];
  } catch {
    return [];
  }
}

export async function fetchRecentSecurityFindings(limit = 30): Promise<SupabaseSecurityFinding[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("rift_security_findings")
      .select("*")
      .order("finding_timestamp", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as SupabaseSecurityFinding[];
  } catch {
    return [];
  }
}

export async function fetchUserSecurityFindings(userId: string): Promise<SupabaseSecurityFinding[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("rift_security_findings")
      .select("*")
      .eq("attributed_user_id", userId)
      .order("finding_timestamp", { ascending: false });

    if (error || !data) return [];
    return data as SupabaseSecurityFinding[];
  } catch {
    return [];
  }
}
