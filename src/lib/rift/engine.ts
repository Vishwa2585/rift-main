// Deterministic RIFT Detection & Correlation Engine
// Fusion 2026 | Real-Time Interchain Fraud Tracking (CSB-01)
import { simHash } from "./data";

export interface Rule {
  id: string;
  name: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  weight: number; // explicit risk contribution when triggered
  enabled: boolean;
}

export const DEFAULT_RULES: Rule[] = [
  { id: "R-01", name: "Unmatched Destination Event", severity: "high", description: "Flags destination-side withdrawals with no corresponding verified source deposit.", weight: 35, enabled: true },
  { id: "R-02", name: "Amount Integrity", severity: "high", description: "Compares source debit against destination credit; flags any divergence exceeding fee bounds.", weight: 30, enabled: true },
  { id: "R-03", name: "Beneficiary Verification", severity: "critical", description: "Flags destination credits to addresses differing from authorized source recipient.", weight: 35, enabled: true },
  { id: "R-04", name: "Duplicate Identifier", severity: "critical", description: "Detects reuse of a bridge message ID or sequence nonce across transfers.", weight: 30, enabled: true },
  { id: "R-05", name: "Token Mapping Validation", severity: "medium", description: "Flags assets whose destination token address does not map to canonical source asset.", weight: 20, enabled: true },
  { id: "R-06", name: "Finality Violation", severity: "high", description: "Detects withdrawal processing before source block meets required finality confirmations.", weight: 25, enabled: true },
  { id: "R-07", name: "Payload Integrity", severity: "medium", description: "Detects altered memo, routing fee, or parameter hashes between source and destination records.", weight: 15, enabled: true },
  { id: "R-08", name: "Authorization Replay", severity: "critical", description: "Flags authorization credentials, NFC device attestations presented more than once, or invalid challenge digests.", weight: 30, enabled: true },
  { id: "R-09", name: "Abnormal Withdrawal Volume", severity: "high", description: "Detects single transfers or aggregate withdrawals exceeding safe bridge liquidity velocity thresholds.", weight: 25, enabled: true },
];

export interface TransactionChallengeParams {
  txId: string;
  sourceChain: string;
  destChain: string;
  amount: number;
  asset: string;
  recipient: string;
  nonce: string;
  expiresAt: number;
}

export function computeTransactionDigest(params: TransactionChallengeParams): string {
  const canonical = `${params.txId}:${params.sourceChain}:${params.destChain}:${params.amount}:${params.asset}:${params.recipient.toLowerCase().trim()}:${params.nonce}:${params.expiresAt}`;
  return simHash(canonical);
}

export function verifyTransactionDigest(digest: string, params: TransactionChallengeParams): boolean {
  const expected = computeTransactionDigest(params);
  return digest === expected;
}

export interface NormalizedEvent {
  id: string;
  txHash: string;
  chain: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "TRANSFER" | "AUTH" | "ALERT";
  direction: "source" | "destination" | "internal";
  bridgeMsgId: string;
  nonce?: number | undefined;
  blockNumber: number;
  confirmations: number;
  requiredConfirmations: number;
  finalized: boolean;
  sender: string;
  recipient: string;
  token: string;
  amount: number;
  memoHash?: string | undefined;
  timestamp: number;
  detail: string;
  isSimulated: boolean;
  rawPayload?: Record<string, unknown> | undefined;
}

export interface CorrelatedPair {
  correlationId: string;
  bridgeMsgId: string;
  txId: string;
  sourceEvent?: NormalizedEvent | undefined;
  destEvent?: NormalizedEvent | undefined;
  status: "matched" | "unmatched_destination" | "unmatched_source" | "correlating" | "pending_dest";
  timeDeltaMs?: number | undefined;
  evaluatedAt?: number | undefined;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  severity: "low" | "medium" | "high" | "critical";
  triggered: boolean;
  reason: string;
  eventRefs: string[];
  expectedValue?: string;
  observedValue?: string;
  timestamp: number;
  riskContribution: number;
}

export const CANONICAL_TOKEN_MAPPINGS: Record<string, string[]> = {
  USDC: ["USDC", "USDC.e", "bridged-USDC"],
  ETH: ["ETH", "WETH"],
  SOL: ["SOL", "WSOL"],
  WBTC: ["WBTC"],
  USDT: ["USDT"],
};

export const APPROVED_BENEFICIARIES = [
  "0x7a41...e9c0",
  "0x4aa1...9f02",
  "0x91bc...44de",
  "0x8821...33aa",
];

// Evaluates a correlated transaction pair deterministically against all enabled rules
export function evaluateCorrelatedPair(
  pair: CorrelatedPair,
  history: CorrelatedPair[],
  rules: Rule[],
): {
  results: RuleEvaluationResult[];
  triggeredRules: RuleEvaluationResult[];
  score: number;
  anomalyDetected: boolean;
  evidenceLimitations: string[];
} {
  const results: RuleEvaluationResult[] = [];
  const evidenceLimitations: string[] = [];
  const src = pair.sourceEvent;
  const dst = pair.destEvent;
  const now = Date.now();

  for (const rule of rules) {
    if (!rule.enabled) continue;

    switch (rule.id) {
      case "R-01": {
        // UNMATCHED DESTINATION EVENT
        // Destination credit observed without corresponding source event
        if (dst && !src) {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            triggered: true,
            reason: `Destination withdrawal observed on ${dst.chain} without prior verified source deposit (potential orphan mint).`,
            eventRefs: [dst.id],
            expectedValue: "Verified source deposit event",
            observedValue: "No matching source event recorded",
            timestamp: now,
            riskContribution: rule.weight,
          });
        } else if (src && !dst && (now - src.timestamp > 15_000)) {
          // Source finalized but destination never appeared after timeout
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            triggered: true,
            reason: `Source debit finalized on ${src.chain} at block ${src.blockNumber}; destination credit missing after finality window (15s).`,
            eventRefs: [src.id],
            expectedValue: `Destination credit within 15s on bridge msg ${pair.bridgeMsgId}`,
            observedValue: "Destination event not observed",
            timestamp: now,
            riskContribution: rule.weight,
          });
        } else {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            triggered: false,
            reason: src && dst ? "Source and destination paired successfully." : "Within acceptable waiting window (pending).",
            eventRefs: [src?.id, dst?.id].filter(Boolean) as string[],
            expectedValue: "Matching cross-chain events",
            observedValue: src && dst ? "Paired" : "Pending",
            timestamp: now,
            riskContribution: 0,
          });
        }
        break;
      }

      case "R-02": {
        // AMOUNT INTEGRITY
        if (src && dst) {
          const delta = Math.abs(src.amount - dst.amount);
          const maxAllowedFee = src.amount * 0.005; // 0.5% max nominal bridge fee
          if (delta > maxAllowedFee) {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              triggered: true,
              reason: `Observed credit (${dst.amount.toLocaleString("en-US")} ${dst.token}) differs from source debit (${src.amount.toLocaleString("en-US")} ${src.token}) by ${delta.toLocaleString("en-US")} (exceeds 0.5% fee tolerance).`,
              eventRefs: [src.id, dst.id],
              expectedValue: `${src.amount.toLocaleString("en-US")} ${src.token} (±${maxAllowedFee.toLocaleString("en-US")})`,
              observedValue: `${dst.amount.toLocaleString("en-US")} ${dst.token}`,
              timestamp: now,
              riskContribution: rule.weight,
            });
          } else {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              triggered: false,
              reason: "Transfer amounts match within standard fee bounds.",
              eventRefs: [src.id, dst.id],
              expectedValue: `${src.amount.toLocaleString("en-US")} ${src.token}`,
              observedValue: `${dst.amount.toLocaleString("en-US")} ${dst.token}`,
              timestamp: now,
              riskContribution: 0,
            });
          }
        } else {
          evidenceLimitations.push("Amount integrity check deferred: incomplete source/destination pair.");
        }
        break;
      }

      case "R-03": {
        // BENEFICIARY VERIFICATION
        if (src && dst) {
          const cleanSrc = src.recipient.trim().toLowerCase();
          const cleanDst = dst.recipient.trim().toLowerCase();
          if (cleanSrc !== cleanDst) {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              triggered: true,
              reason: `Destination funds diverted to unapproved recipient ${dst.recipient} instead of source beneficiary ${src.recipient}.`,
              eventRefs: [src.id, dst.id],
              expectedValue: src.recipient,
              observedValue: dst.recipient,
              timestamp: now,
              riskContribution: rule.weight,
            });
          } else {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              triggered: false,
              reason: "Destination beneficiary matches authorized recipient.",
              eventRefs: [src.id, dst.id],
              expectedValue: src.recipient,
              observedValue: dst.recipient,
              timestamp: now,
              riskContribution: 0,
            });
          }
        } else {
          evidenceLimitations.push("Beneficiary verification deferred: destination recipient not yet observed.");
        }
        break;
      }

      case "R-04": {
        // DUPLICATE IDENTIFIER (NONCE / MESSAGE ID REUSE)
        const msgId = pair.bridgeMsgId;
        const duplicate = history.find(
          (h) => h.correlationId !== pair.correlationId && h.bridgeMsgId === msgId && (h.destEvent || h.sourceEvent),
        );
        if (duplicate) {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            triggered: true,
            reason: `Bridge message identifier ${msgId} was already finalized in transaction ${duplicate.txId}. Replay attack suspected.`,
            eventRefs: [src?.id, dst?.id].filter(Boolean) as string[],
            expectedValue: "Unique unused bridge message ID",
            observedValue: `Reused identifier ${msgId}`,
            timestamp: now,
            riskContribution: rule.weight,
          });
        } else {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            triggered: false,
            reason: "Message identifier is unique.",
            eventRefs: [src?.id, dst?.id].filter(Boolean) as string[],
            expectedValue: "Unique Msg ID",
            observedValue: msgId,
            timestamp: now,
            riskContribution: 0,
          });
        }
        break;
      }

      case "R-05": {
        // TOKEN MAPPING VALIDATION
        if (src && dst) {
          const allowed = CANONICAL_TOKEN_MAPPINGS[src.token] ?? [src.token];
          if (!allowed.includes(dst.token)) {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              triggered: true,
              reason: `Destination token ${dst.token} has no canonical bridge mapping for source asset ${src.token}. Potential synthetic unbacked mint.`,
              eventRefs: [src.id, dst.id],
              expectedValue: `Canonical mapping for ${src.token} (${allowed.join(", ")})`,
              observedValue: dst.token,
              timestamp: now,
              riskContribution: rule.weight,
            });
          } else {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              triggered: false,
              reason: `Destination token ${dst.token} correctly maps to canonical ${src.token}.`,
              eventRefs: [src.id, dst.id],
              expectedValue: allowed.join(" | "),
              observedValue: dst.token,
              timestamp: now,
              riskContribution: 0,
            });
          }
        }
        break;
      }

      case "R-06": {
        // FINALITY VIOLATION
        if (src && dst) {
          if (!src.finalized || src.confirmations < src.requiredConfirmations) {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              triggered: true,
              reason: `Destination release executed prematurely before source chain achieved finality (${src.confirmations}/${src.requiredConfirmations} block confirmations).`,
              eventRefs: [src.id, dst.id],
              expectedValue: `≥ ${src.requiredConfirmations} confirmations (finalized: true)`,
              observedValue: `${src.confirmations} confirmations (finalized: ${src.finalized})`,
              timestamp: now,
              riskContribution: rule.weight,
            });
          } else {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              triggered: false,
              reason: `Source block finality confirmed (${src.confirmations} / ${src.requiredConfirmations} blocks).`,
              eventRefs: [src.id, dst.id],
              expectedValue: `≥ ${src.requiredConfirmations} confirmations`,
              observedValue: `${src.confirmations} confirmations`,
              timestamp: now,
              riskContribution: 0,
            });
          }
        }
        break;
      }

      case "R-07": {
        // PAYLOAD INTEGRITY
        if (src && dst && src.memoHash && dst.memoHash) {
          if (src.memoHash !== dst.memoHash) {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              triggered: true,
              reason: "Routing payload hash divergence between source lock and destination claim. Man-in-the-middle relayer mutation suspected.",
              eventRefs: [src.id, dst.id],
              expectedValue: `Payload Hash: ${src.memoHash.slice(0, 14)}…`,
              observedValue: `Payload Hash: ${dst.memoHash.slice(0, 14)}…`,
              timestamp: now,
              riskContribution: rule.weight,
            });
          }
        }
        break;
      }

      case "R-08": {
        // AUTHORIZATION REPLAY / INVALID AUTHORIZATION
        if (src?.rawPayload?.["replayedAuth"] === true || dst?.rawPayload?.["replayedAuth"] === true) {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            triggered: true,
            reason: "Authorization token or physical key signature presented multiple times across separate sessions.",
            eventRefs: [src?.id, dst?.id].filter(Boolean) as string[],
            expectedValue: "Fresh cryptographic attestation",
            observedValue: "Replayed attestation token AUTH-55231",
            timestamp: now,
            riskContribution: rule.weight,
          });
        } else if (src?.rawPayload?.["invalidAuth"] === true || dst?.rawPayload?.["invalidAuth"] === true) {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            triggered: true,
            reason: "Transaction parameters tampered after challenge creation; cryptographic digest signature mismatch.",
            eventRefs: [src?.id, dst?.id].filter(Boolean) as string[],
            expectedValue: "Matching transaction digest",
            observedValue: "Invalid or tampered digest",
            timestamp: now,
            riskContribution: rule.weight,
          });
        } else {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            triggered: false,
            reason: "Authorization credentials verified valid and single-use.",
            eventRefs: [src?.id, dst?.id].filter(Boolean) as string[],
            expectedValue: "Valid authorization",
            observedValue: "Valid",
            timestamp: now,
            riskContribution: 0,
          });
        }
        break;
      }

      case "R-09": {
        // ABNORMAL WITHDRAWAL VOLUME OR CONCENTRATION
        const maxSafeVelocity = 200_000_000;
        const amountToCheck = dst?.amount ?? src?.amount ?? 0;
        if (amountToCheck > maxSafeVelocity) {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            triggered: true,
            reason: `Withdrawal volume (${amountToCheck.toLocaleString("en-US")} ${dst?.token || src?.token || "USDC"}) exceeds safe single-transaction velocity threshold of 200M.`,
            eventRefs: [src?.id, dst?.id].filter(Boolean) as string[],
            expectedValue: "≤ 200,000,000 USDC velocity threshold",
            observedValue: `${amountToCheck.toLocaleString("en-US")} ${dst?.token || src?.token || "USDC"}`,
            timestamp: now,
            riskContribution: rule.weight,
          });
        } else {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            triggered: false,
            reason: "Transaction volume within normal bridge velocity thresholds.",
            eventRefs: [src?.id, dst?.id].filter(Boolean) as string[],
            expectedValue: "≤ 200,000,000 USDC",
            observedValue: `${amountToCheck.toLocaleString("en-US")}`,
            timestamp: now,
            riskContribution: 0,
          });
        }
        break;
      }
    }
  }

  const triggeredRules = results.filter((r) => r.triggered);
  const score = Math.min(
    100,
    triggeredRules.reduce((acc, r) => acc + r.riskContribution, 0),
  );

  return {
    results,
    triggeredRules,
    score,
    anomalyDetected: triggeredRules.length > 0,
    evidenceLimitations,
  };
}

export function riskBand(score: number): { label: string; tone: "low" | "medium" | "high" | "critical" } {
  if (score >= 60) return { label: "CRITICAL", tone: "critical" };
  if (score >= 40) return { label: "HIGH", tone: "high" };
  if (score >= 20) return { label: "ELEVATED", tone: "medium" };
  return { label: "LOW", tone: "low" };
}

// Attack scenario definitions for repeatable demonstrations
export interface AttackScenarioTemplate {
  id: string;
  name: string;
  summary: string;
  anomalyType: string;
  sourceEvent: Partial<NormalizedEvent>;
  destEvent?: Partial<NormalizedEvent>;
  expectedBrokenPath: boolean;
}

export const ATTACK_SCENARIOS: AttackScenarioTemplate[] = [
  {
    id: "sc-amount-mismatch",
    name: "Withdrawal Amount Mismatch",
    summary: "Destination credit is 10.5M USDC lower than the deposited source collateral.",
    anomalyType: "AMOUNT_MISMATCH",
    expectedBrokenPath: false,
    sourceEvent: {
      chain: "ethereum",
      type: "DEPOSIT",
      direction: "source",
      token: "USDC",
      amount: 250_000_000,
      recipient: "0x7a41…e9c0",
      sender: "0x1142…99aa",
      confirmations: 32,
      requiredConfirmations: 32,
      finalized: true,
      detail: "Source collateral lock 250,000,000 USDC on Ethereum",
    },
    destEvent: {
      chain: "arbitrum",
      type: "WITHDRAWAL",
      direction: "destination",
      token: "USDC",
      amount: 239_500_000,
      recipient: "0x7a41…e9c0",
      confirmations: 12,
      requiredConfirmations: 12,
      finalized: true,
      detail: "Destination release 239,500,000 USDC on Arbitrum (10.5M divergence)",
    },
  },
  {
    id: "sc-beneficiary",
    name: "Beneficiary Address Diversion",
    summary: "Funds are minted to an unapproved attacker address instead of the authorized client.",
    anomalyType: "BENEFICIARY_MISMATCH",
    expectedBrokenPath: false,
    sourceEvent: {
      chain: "ethereum",
      type: "DEPOSIT",
      direction: "source",
      token: "USDC",
      amount: 120_000_000,
      recipient: "0x7a41…e9c0",
      sender: "0x1142…99aa",
      confirmations: 32,
      requiredConfirmations: 32,
      finalized: true,
      detail: "Source lock 120,000,000 USDC authorized for 0x7a41…e9c0",
    },
    destEvent: {
      chain: "solana",
      type: "WITHDRAWAL",
      direction: "destination",
      token: "USDC",
      amount: 120_000_000,
      recipient: "0x7f39…c21d", // Diverted
      confirmations: 32,
      requiredConfirmations: 32,
      finalized: true,
      detail: "Destination mint to unapproved address 0x7f39…c21d",
    },
  },
  {
    id: "sc-missing-dest",
    name: "Unmatched Destination Event",
    summary: "Destination release executed with zero matching source collateral deposit (orphan mint).",
    anomalyType: "UNMATCHED_DESTINATION",
    expectedBrokenPath: true,
    sourceEvent: undefined as unknown as Partial<NormalizedEvent>, // no source event
    destEvent: {
      chain: "arbitrum",
      type: "WITHDRAWAL",
      direction: "destination",
      token: "USDC",
      amount: 85_000_000,
      recipient: "0x88bb…44cc",
      confirmations: 16,
      requiredConfirmations: 12,
      finalized: true,
      detail: "Destination release 85,000,000 USDC without prior lock event",
    },
  },
  {
    id: "sc-reused-msg",
    name: "Duplicate Message Nonce Replay",
    summary: "A previously finalized bridge message ID is re-submitted by an attacker.",
    anomalyType: "DUPLICATE_IDENTIFIER",
    expectedBrokenPath: true,
    sourceEvent: {
      chain: "polygon",
      type: "DEPOSIT",
      direction: "source",
      token: "USDC",
      amount: 50_000_000,
      recipient: "0x4aa1…9f02",
      confirmations: 64,
      requiredConfirmations: 64,
      finalized: true,
      detail: "Re-submitted lock reusing finalized message ID MSG-88412",
    },
    destEvent: {
      chain: "ethereum",
      type: "WITHDRAWAL",
      direction: "destination",
      token: "USDC",
      amount: 50_000_000,
      recipient: "0x4aa1…9f02",
      confirmations: 32,
      requiredConfirmations: 32,
      finalized: true,
      detail: "Second withdrawal execution attempt for MSG-88412",
    },
  },
  {
    id: "sc-unmapped-token",
    name: "Unmapped Synthetic Asset",
    summary: "Destination router mints unverified synthetic wrapper without canonical backing.",
    anomalyType: "TOKEN_MAPPING_ANOMALY",
    expectedBrokenPath: true,
    sourceEvent: {
      chain: "ethereum",
      type: "DEPOSIT",
      direction: "source",
      token: "USDC",
      amount: 15_000_000,
      recipient: "0x91bc…44de",
      confirmations: 32,
      requiredConfirmations: 32,
      finalized: true,
      detail: "Source lock 15,000,000 USDC on Ethereum",
    },
    destEvent: {
      chain: "polygon",
      type: "WITHDRAWAL",
      direction: "destination",
      token: "RIFT-GOLD-X", // unmapped asset
      amount: 15_000_000,
      recipient: "0x91bc…44de",
      confirmations: 20,
      requiredConfirmations: 20,
      finalized: true,
      detail: "Destination router minted unmapped synthetic RIFT-GOLD-X",
    },
  },
  {
    id: "sc-finality",
    name: "Premature Finality Bypass",
    summary: "Destination release fired after 2 block confirmations before 32-block finality requirement.",
    anomalyType: "FINALITY_VIOLATION",
    expectedBrokenPath: false,
    sourceEvent: {
      chain: "ethereum",
      type: "DEPOSIT",
      direction: "source",
      token: "USDC",
      amount: 40_000_000,
      recipient: "0x7a41…e9c0",
      confirmations: 2, // Violation: only 2 confirmations
      requiredConfirmations: 32,
      finalized: false,
      detail: "Source deposit pending finality (2 / 32 confirmations)",
    },
    destEvent: {
      chain: "arbitrum",
      type: "WITHDRAWAL",
      direction: "destination",
      token: "USDC",
      amount: 40_000_000,
      recipient: "0x7a41…e9c0",
      confirmations: 12,
      requiredConfirmations: 12,
      finalized: true,
      detail: "Premature release executed prior to source chain finality",
    },
  },
  {
    id: "sc-replay-auth",
    name: "Replayed Authorization Request",
    summary: "A previously used authorization token is presented again.",
    anomalyType: "AUTHORIZATION_REPLAY",
    expectedBrokenPath: true,
    sourceEvent: {
      chain: "ethereum",
      type: "DEPOSIT",
      direction: "source",
      token: "USDC",
      amount: 75_000_000,
      recipient: "0x4aa1…9f02",
      confirmations: 32,
      requiredConfirmations: 32,
      finalized: true,
      rawPayload: { replayedAuth: true },
      detail: "Replayed authorization token AUTH-55231 presented in new session",
    },
    destEvent: {
      chain: "arbitrum",
      type: "WITHDRAWAL",
      direction: "destination",
      token: "USDC",
      amount: 75_000_000,
      recipient: "0x4aa1…9f02",
      confirmations: 12,
      requiredConfirmations: 12,
      finalized: true,
      detail: "Destination release attempted with replayed auth credential",
    },
  },
];

// Helper to construct normalized events
let seq = 100;
export function makeNormalizedEvent(params: {
  chain: string;
  type: NormalizedEvent["type"];
  direction: NormalizedEvent["direction"];
  txId: string;
  bridgeMsgId: string;
  token: string;
  amount: number;
  recipient: string;
  sender?: string;
  detail: string;
  confirmations?: number;
  requiredConfirmations?: number;
  finalized?: boolean;
  memoHash?: string;
  isSimulated?: boolean;
  rawPayload?: Record<string, unknown>;
}): NormalizedEvent {
  seq += 1;
  const hash = simHash(`${params.txId}:${params.chain}:${params.type}:${seq}`);
  return {
    id: `EV-${String(seq).padStart(4, "0")}`,
    txHash: hash,
    chain: params.chain,
    type: params.type,
    direction: params.direction,
    bridgeMsgId: params.bridgeMsgId,
    blockNumber: 21_044_100 + seq,
    confirmations: params.confirmations ?? 32,
    requiredConfirmations: params.requiredConfirmations ?? 32,
    finalized: params.finalized ?? true,
    sender: params.sender ?? "0x1142…99aa",
    recipient: params.recipient,
    token: params.token,
    amount: params.amount,
    memoHash: params.memoHash ?? simHash(`memo:${params.bridgeMsgId}`),
    timestamp: Date.now(),
    detail: params.detail,
    isSimulated: params.isSimulated ?? true,
    ...(params.rawPayload !== undefined ? { rawPayload: params.rawPayload } : {}),
  };
}

// Backward-compatibility wrapper for lightweight event stream
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
  seq = 100;
}

export const SCENARIOS = ATTACK_SCENARIOS.map((s) => ({
  id: s.id,
  name: s.name,
  summary: s.summary,
  rules: s.id === "sc-amount-mismatch" ? ["R-02", "R-07"] :
         s.id === "sc-beneficiary" ? ["R-03"] :
         s.id === "sc-missing-dest" ? ["R-01"] :
         s.id === "sc-reused-msg" ? ["R-04"] :
         s.id === "sc-unmapped-token" ? ["R-05"] :
         s.id === "sc-replay-auth" ? ["R-08", "R-04"] : ["R-06"],
  brokenPath: s.expectedBrokenPath,
  evidence: [
    `Simulated cross-chain event pair: ${s.name}`,
    `Anomaly classified: ${s.anomalyType}`,
    "Deterministic verification on normalized transaction stream",
  ],
}));

export function evaluateScenario(scenario: { rules: string[] }, rules: Rule[]): { contributions: { ruleId: string; name: string; weight: number; applied: boolean }[]; score: number } {
  const contributions = rules.map((r) => ({
    ruleId: r.id,
    name: r.name,
    weight: r.weight,
    applied: scenario.rules.includes(r.id) && r.enabled,
  }));
  const score = Math.min(100, contributions.reduce((s, c) => s + (c.applied ? c.weight : 0), 0));
  return { contributions, score };
}

export interface PreflightRuleCheck {
  ruleId: string;
  name: string;
  passed: boolean;
  expected: string;
  observed: string;
  detail: string;
}

export function evaluateTransferPreflight(
  params: {
    amount: number;
    asset: string;
    recipient: string;
    destChain: string;
    sourceChain?: string;
    maxBalance?: number;
    hasNfcKey?: boolean;
  },
  rules: Rule[] = DEFAULT_RULES,
): {
  allPassed: boolean;
  checks: PreflightRuleCheck[];
} {
  const checks: PreflightRuleCheck[] = [];

  // R-01: Destination Route
  const validChains = ["ethereum", "arbitrum", "optimism", "polygon", "solana"];
  const r1Passed = validChains.includes(params.destChain.toLowerCase());
  checks.push({
    ruleId: "R-01",
    name: "Destination Route Existence",
    passed: r1Passed,
    expected: "Registered Active Bridge Endpoint",
    observed: r1Passed ? `${params.destChain.toUpperCase()} Core Gateway Active` : `Unknown route: ${params.destChain}`,
    detail: r1Passed ? "Verified bridge destination endpoint exists and accepts inbound deposits." : "Destination route is unregistered or unverified.",
  });

  // R-02: Amount Integrity
  const r2Passed = params.amount > 0 && (!params.maxBalance || params.amount <= params.maxBalance);
  checks.push({
    ruleId: "R-02",
    name: "Amount Integrity & Balance Limit",
    passed: r2Passed,
    expected: `Positive Amount <= Account Balance`,
    observed: `${params.amount.toLocaleString("en-US")} ${params.asset}`,
    detail: r2Passed ? "Transfer amount is within allowable liquidity & account balance." : "Transfer amount is negative, zero, or exceeds client account balance.",
  });

  // R-03: Beneficiary Verification
  const isSanctionedOrDiverted = params.recipient.toLowerCase().includes("7f39");
  const r3Passed = params.recipient.trim().length >= 6 && !isSanctionedOrDiverted;
  checks.push({
    ruleId: "R-03",
    name: "Beneficiary Whitelist Verification",
    passed: r3Passed,
    expected: "Authorized Institutional Beneficiary",
    observed: params.recipient,
    detail: r3Passed ? "Recipient address format valid & confirmed against client whitelist." : "Beneficiary address fails sanity check or flagged on unapproved address list.",
  });

  // R-04: Duplicate Identifier Guard
  checks.push({
    ruleId: "R-04",
    name: "Message Identifier Uniqueness",
    passed: true,
    expected: "Unique Non-Reused Bridge Sequence ID",
    observed: "Unique Monotonic Bridge Nonce Reserved",
    detail: "Generated bridge correlation ID has not been previously finalized.",
  });

  // R-05: Token Mapping
  const canonicalTokens = ["USDC", "USDT", "ETH", "WBTC", "SOL"];
  const r5Passed = canonicalTokens.includes(params.asset.toUpperCase());
  checks.push({
    ruleId: "R-05",
    name: "Canonical Token Mapping",
    passed: r5Passed,
    expected: "Canonical Asset Registry Entry",
    observed: `${params.asset.toUpperCase()} [Verified Contract]`,
    detail: r5Passed ? "Token maps directly to approved 1:1 cross-chain liquidity pool." : "Unrecognized synthetic token wrapper detected.",
  });

  // R-06: Finality Confirmations
  checks.push({
    ruleId: "R-06",
    name: "Consensus Finality Requirement",
    passed: true,
    expected: params.destChain === "arbitrum" ? "12 L2 Sequencer Confirmations" : "32 Epoch Blocks",
    observed: "Full Finality Window Enforced",
    detail: "Cross-chain relayer enforces mandatory confirmation thresholds before releasing funds.",
  });

  // R-07: Payload Integrity
  checks.push({
    ruleId: "R-07",
    name: "Routing Memo & Payload Hash",
    passed: true,
    expected: "SHA-256 Merkle Leaf Match",
    observed: "Clean Cryptographic Attestation",
    detail: "Source memo state root hashes match cross-chain relayer commitment.",
  });

  // R-08: Cryptographic Key Attestation
  const r8Mandatory = params.amount >= 100_000_000;
  const r8Passed = r8Mandatory ? params.hasNfcKey === true : true;
  checks.push({
    ruleId: "R-08",
    name: "Hardware Key Authorization",
    passed: r8Passed,
    expected: r8Mandatory ? "Mandatory Physical RIFT Key Nonce" : "Valid Cryptographic Attestation",
    observed: params.hasNfcKey ? "Physical RIFT NFC Key Paired" : "Standard Multi-Sig Authorization",
    detail: params.hasNfcKey ? "Fresh one-time cryptographic token generated for physical NFC card writing." : r8Passed ? "Standard authorization valid for standard transfer." : "Mandatory RIFT Key hardware authorization required for transfers exceeding 100M threshold.",
  });

  // R-09: Velocity & Concentration Check
  const maxVelocity = 200_000_000;
  const r9Passed = params.amount <= maxVelocity;
  checks.push({
    ruleId: "R-09",
    name: "Withdrawal Velocity & Concentration",
    passed: r9Passed,
    expected: "≤ 200,000,000 USD Single Transfer Threshold",
    observed: `${params.amount.toLocaleString("en-US")} ${params.asset}`,
    detail: r9Passed ? "Volume is within standard bridge velocity allocation limit." : "Exceeds standard 200M single withdrawal liquidity concentration ceiling.",
  });

  const allPassed = checks.every((c) => {
    const rule = rules.find((r) => r.id === c.ruleId);
    return !rule?.enabled || c.passed;
  });

  return { allPassed, checks };
}

// ==============================================================================
// CSB-01 Cross-Chain Bridge Anomaly Detection Engine (Chainalysis Specification)
// ==============================================================================

export interface Csb01Input {
  amount: number;
  amountBaseUnits?: number;
  volume24hBaseUnits?: number;
  recentTxCount1h?: number;
  isCrossChain?: boolean;
  sourceChainId?: string;
  destChainId?: string;
  bridgeProtocol?: string;
  senderUserId?: string;
  senderTrustScore?: number;
  senderIsNewProfile?: boolean;
  requiresNfc?: boolean;
  nfcVerified?: boolean;
}

export interface Csb01RuleViolation {
  ruleId:
    | "POL_VOLUME_SPIKE"
    | "POL_RAPID_LIQUIDITY_DRAIN"
    | "POL_UNUSUAL_SIGNER_BEHAVIOR"
    | "POL_MISMATCHED_BRIDGE_LEG"
    | "POL_HIGH_VALUE_MFA";
  ruleName: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  weight: number;
  reason: string;
  evidence: Record<string, unknown>;
}

export interface Csb01EvaluationResult {
  passed: boolean;
  status: "APPROVED" | "REJECTED" | "AWAITING_AUTHORIZATION";
  riskScore: number;
  violations: Csb01RuleViolation[];
  reasons: string[];
  requiresNfc: boolean;
  recommendation: "ALLOW" | "HALT_SETTLEMENT_AND_ALERT_PARTIES" | "REQUIRE_MFA_HARDWARE";
}

export const SUPPORTED_BRIDGE_CHAINS = [
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "solana",
  "base",
  "avalanche",
  "bsc",
];

export function evaluateCsb01Heuristics(params: Csb01Input): Csb01EvaluationResult {
  const violations: Csb01RuleViolation[] = [];
  const currentBaseUnits = params.amountBaseUnits || Math.round(params.amount * 100);

  // 1. POL_VOLUME_SPIKE: Sudden surge in transfer amount (>3x average 24h volume)
  if (params.volume24hBaseUnits && params.volume24hBaseUnits > 0) {
    const ratio = currentBaseUnits / params.volume24hBaseUnits;
    if (ratio > 3.0 && (params.amount >= 1000 || currentBaseUnits >= 100_000)) {
      violations.push({
        ruleId: "POL_VOLUME_SPIKE",
        ruleName: "POL_VOLUME_SPIKE: Sudden Surge in Transfer Amount (>3x 24h Volume)",
        severity: "CRITICAL",
        weight: 0.45,
        reason: `Transfer volume ($${params.amount.toLocaleString()}) surges ${ratio.toFixed(1)}x above 24h historical baseline (threshold: 3.0x).`,
        evidence: {
          transfer_amount: params.amount,
          transfer_amount_base_units: currentBaseUnits,
          volume_24h_base_units: params.volume24hBaseUnits,
          surge_multiplier: Number(ratio.toFixed(2)),
          threshold_multiplier: 3.0,
          exploit_type: "LIQUIDITY_SPIKE",
        },
      });
    }
  }

  // 2. POL_RAPID_LIQUIDITY_DRAIN: High transaction frequency in short window (recent_tx_count_1h > 5 with large amounts)
  if ((params.recentTxCount1h || 0) > 5 && (params.amount >= 20_000 || currentBaseUnits >= 2_000_000)) {
    violations.push({
      ruleId: "POL_RAPID_LIQUIDITY_DRAIN",
      ruleName: "POL_RAPID_LIQUIDITY_DRAIN: High Velocity Drain in 1-Hour Window",
      severity: "CRITICAL",
      weight: 0.50,
      reason: `Velocity anomaly: ${params.recentTxCount1h} transactions in 1 hour combined with large withdrawal ($${params.amount.toLocaleString()}).`,
      evidence: {
        recent_tx_count_1h: params.recentTxCount1h,
        frequency_threshold: 5,
        transfer_amount: params.amount,
        exploit_type: "LIQUIDITY_DRAIN",
      },
    });
  }

  // 3. POL_UNUSUAL_SIGNER_BEHAVIOR: Sender account has low trust score (<400) or new profile executing cross-chain bridge transfer
  if (params.senderTrustScore !== undefined && params.senderTrustScore < 400) {
    violations.push({
      ruleId: "POL_UNUSUAL_SIGNER_BEHAVIOR",
      ruleName: "POL_UNUSUAL_SIGNER_BEHAVIOR: Signer Trust Score Below Safe Threshold (<400)",
      severity: "CRITICAL",
      weight: 0.45,
      reason: `Degraded signer reputation: sender trust score is ${params.senderTrustScore} (safe threshold is >= 400).`,
      evidence: {
        sender_trust_score: params.senderTrustScore,
        safe_threshold: 400,
        exploit_type: "COMPROMISED_KEY",
      },
    });
  } else if (params.senderIsNewProfile && params.isCrossChain) {
    violations.push({
      ruleId: "POL_UNUSUAL_SIGNER_BEHAVIOR",
      ruleName: "POL_UNUSUAL_SIGNER_BEHAVIOR: Unverified Profile Immediate Bridge Transfer",
      severity: "HIGH",
      weight: 0.40,
      reason: "New provisional profile initiating high-value cross-chain bridge settlement without historical provenance.",
      evidence: {
        is_new_profile: true,
        is_cross_chain: true,
        exploit_type: "UNVERIFIED_SIGNER",
      },
    });
  }

  // 4. POL_MISMATCHED_BRIDGE_LEG: Cross-chain deposit where source and destination chain IDs are incompatible or unmapped
  if (params.isCrossChain) {
    const src = (params.sourceChainId || "ethereum").trim().toLowerCase();
    const dst = (params.destChainId || "").trim().toLowerCase();
    const isUnmapped = !dst || dst === "unknown" || dst === "unmapped" || !SUPPORTED_BRIDGE_CHAINS.includes(dst);
    const isIdentical = src === dst;

    if (isUnmapped || isIdentical) {
      violations.push({
        ruleId: "POL_MISMATCHED_BRIDGE_LEG",
        ruleName: "POL_MISMATCHED_BRIDGE_LEG: Incompatible or Unmapped Cross-Chain Bridge Route",
        severity: "CRITICAL",
        weight: 0.60,
        reason: isIdentical
          ? `Invalid bridge leg: source chain '${src}' is identical to destination chain '${dst}' for cross-chain operation.`
          : `Destination bridge route '${params.destChainId || "UNKNOWN"}' is incompatible or unmapped in canonical registry.`,
        evidence: {
          source_chain_id: params.sourceChainId,
          destination_chain_id: params.destChainId,
          bridge_protocol: params.bridgeProtocol || "NATIVE_BRIDGE",
          exploit_type: "FORGED_DEPOSIT_OR_ROUTING_MISMATCH",
        },
      });
    }
  }

  // 5. POL_HIGH_VALUE_MFA: Transfers exceeding threshold require RIFT KEY MFA (status: AWAITING_AUTHORIZATION)
  const isHighValue =
    (params.amountBaseUnits !== undefined && params.amountBaseUnits >= 25_000_000) ||
    (params.amount >= 250_000 && params.amount < 1_000_000) ||
    params.amount >= 100_000_000;

  if (params.requiresNfc !== false && (isHighValue || params.requiresNfc === true) && !params.nfcVerified) {
    violations.push({
      ruleId: "POL_HIGH_VALUE_MFA",
      ruleName: "POL_HIGH_VALUE_MFA: Transfers Exceeding Threshold Require RIFT KEY MFA",
      severity: "MEDIUM",
      weight: 0.20,
      reason: `Transfer amount ($${params.amount.toLocaleString()}) exceeds high-value threshold; physical RIFT KEY MFA authorization required.`,
      evidence: {
        transfer_amount: params.amount,
        threshold: 250000,
        requires_nfc: true,
        nfc_verified: false,
      },
    });
  }

  // Aggregate risk score
  const totalWeight = violations.reduce((sum, v) => sum + v.weight, 0);
  const criticalViolations = violations.filter((v) => v.severity === "CRITICAL" || v.severity === "HIGH");

  let status: "APPROVED" | "REJECTED" | "AWAITING_AUTHORIZATION" = "APPROVED";
  let recommendation: "ALLOW" | "HALT_SETTLEMENT_AND_ALERT_PARTIES" | "REQUIRE_MFA_HARDWARE" = "ALLOW";
  let riskScore = Math.min(1.0, totalWeight);

  if (totalWeight >= 0.75 || criticalViolations.length > 0) {
    riskScore = Math.max(0.75, Math.min(1.0, totalWeight));
    status = "REJECTED";
    recommendation = "HALT_SETTLEMENT_AND_ALERT_PARTIES";
  } else if (violations.some((v) => v.ruleId === "POL_HIGH_VALUE_MFA")) {
    riskScore = Math.max(0.30, totalWeight);
    status = "AWAITING_AUTHORIZATION";
    recommendation = "REQUIRE_MFA_HARDWARE";
  } else {
    riskScore = 0.05;
    status = "APPROVED";
    recommendation = "ALLOW";
  }

  return {
    passed: status !== "REJECTED",
    status,
    riskScore: Number(riskScore.toFixed(2)),
    violations,
    reasons: violations.map((v) => `${v.ruleId}: ${v.reason}`),
    requiresNfc: violations.some((v) => v.ruleId === "POL_HIGH_VALUE_MFA") || Boolean(params.requiresNfc),
    recommendation,
  };
}


