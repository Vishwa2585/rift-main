// Deterministic frontend detection rule engine — SIMULATED DETECTION.
import { simHash } from "./data";

export interface Rule {
  id: string;
  name: string;
  description: string;
  weight: number; // risk contribution when triggered
  enabled: boolean;
}

export const DEFAULT_RULES: Rule[] = [
  { id: "R-01", name: "Destination Finality Check", description: "Flags transfers whose destination-chain event never arrives within the finality window.", weight: 34, enabled: true },
  { id: "R-02", name: "Amount Integrity", description: "Compares source debit against destination credit; any mismatch triggers review.", weight: 28, enabled: true },
  { id: "R-03", name: "Beneficiary Verification", description: "Flags credits to addresses outside the approved beneficiary registry.", weight: 30, enabled: true },
  { id: "R-04", name: "Message ID Uniqueness", description: "Detects reuse of a bridge message identifier across transfers.", weight: 26, enabled: true },
  { id: "R-05", name: "Token Mapping Validation", description: "Flags assets with no canonical mapping on the destination chain.", weight: 18, enabled: true },
  { id: "R-06", name: "Velocity Anomaly", description: "Flags withdrawal bursts exceeding the account's statistical baseline.", weight: 22, enabled: true },
  { id: "R-07", name: "Payload Integrity", description: "Detects altered memo, fee, or amount fields between source and destination records.", weight: 24, enabled: true },
  { id: "R-08", name: "Authorization Replay", description: "Flags authorization tokens presented more than once.", weight: 32, enabled: true },
];

export interface Scenario {
  id: string;
  name: string;
  summary: string;
  rules: string[]; // rule ids triggered
  brokenPath: boolean; // whether the fracture map shows a broken correlation
  evidence: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "sc-missing-dest", name: "Missing Destination Event", summary: "Source debit finalizes; the destination credit never appears.",
    rules: ["R-01"], brokenPath: true,
    evidence: ["Source event SRC-finalized at block 21_044_118 (simulated)", "No destination event observed within 12s finality window", "Bridge relayer heartbeat nominal — silence is anomalous"],
  },
  {
    id: "sc-amount-mismatch", name: "Incorrect Withdrawal Amount", summary: "Destination credit is 4.2% below the source debit.",
    rules: ["R-02", "R-07"], brokenPath: false,
    evidence: ["Source debit: 250,000,000 USDC (simulated)", "Destination credit: 239,500,000 USDC (simulated)", "Delta 10.5M exceeds fee model by 40×"],
  },
  {
    id: "sc-beneficiary", name: "Unexpected Beneficiary", summary: "Funds land at an address outside the approved registry.",
    rules: ["R-03"], brokenPath: false,
    evidence: ["Recipient 0x7f3…c21d not in beneficiary registry", "Registry last updated 2026-10-02", "Address first seen 41 minutes before transfer"],
  },
  {
    id: "sc-reused-msg", name: "Reused Bridge Message ID", summary: "A bridge message identifier is presented a second time.",
    rules: ["R-04"], brokenPath: true,
    evidence: ["Message ID MSG-88412 already consumed by TX RFT-TX-0091", "Replay attempt originates from a different relayer key"],
  },
  {
    id: "sc-unmapped-token", name: "Unmapped Token", summary: "Asset has no canonical mapping on the destination chain.",
    rules: ["R-05"], brokenPath: true,
    evidence: ["Asset RIFT-GOLD-X has no destination mint mapping", "Router attempted fallback to unaudited wrapper contract"],
  },
  {
    id: "sc-burst", name: "Abnormal Withdrawal Burst", summary: "Seven withdrawals in 90 seconds against a 30-day baseline of two per day.",
    rules: ["R-06"], brokenPath: false,
    evidence: ["7 withdrawals in 90s (baseline: 0.07/hr)", "Cumulative outflow 61% of account liquidity", "Burst began 4s after authorization grant"],
  },
  {
    id: "sc-altered", name: "Altered Transaction Details", summary: "Memo and fee fields differ between source and destination records.",
    rules: ["R-07", "R-02"], brokenPath: false,
    evidence: ["Source memo hash ≠ destination memo hash", "Fee field inflated by 3.1%", "Alteration consistent with man-in-the-middle relayer tampering"],
  },
  {
    id: "sc-replay-auth", name: "Replayed Authorization Request", summary: "A previously used authorization token is presented again.",
    rules: ["R-08", "R-04"], brokenPath: true,
    evidence: ["Auth token AUTH-55231 already consumed", "Second presentation 11 minutes later from new session", "Device attestation mismatch"],
  },
];

export interface RuleContribution {
  ruleId: string;
  name: string;
  weight: number;
  applied: boolean;
}

export function evaluateScenario(scenario: Scenario, rules: Rule[]): { contributions: RuleContribution[]; score: number } {
  const contributions = rules.map((r) => ({
    ruleId: r.id,
    name: r.name,
    weight: r.weight,
    applied: scenario.rules.includes(r.id) && r.enabled,
  }));
  const score = contributions.reduce((s, c) => s + (c.applied ? c.weight : 0), 0);
  return { contributions, score };
}

export function riskBand(score: number): { label: string; tone: "low" | "medium" | "high" | "critical" } {
  if (score >= 60) return { label: "CRITICAL", tone: "critical" };
  if (score >= 40) return { label: "HIGH", tone: "high" };
  if (score >= 20) return { label: "ELEVATED", tone: "medium" };
  return { label: "LOW", tone: "low" };
}

// Deterministic event factory for the simulated stream.
let seq = 0;
export function makeEvent(chain: string, type: string, txId: string, detail: string, atOffsetMs = 0) {
  seq += 1;
  return {
    id: `EV-${String(seq).padStart(4, "0")}`,
    chain,
    type,
    txId,
    detail,
    hash: simHash(`${txId}:${type}:${seq}`),
    at: Date.now() + atOffsetMs,
  };
}

export function resetEventSeq() {
  seq = 0;
}
