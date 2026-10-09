import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  evaluateCorrelatedPair,
  makeNormalizedEvent,
  type CorrelatedPair,
} from "../lib/rift/engine";
import { initialState } from "../lib/rift/store";

describe("RIFT Detection Engine & Invariant Verification", () => {
  it("Requirement 1: Legitimate paired event does NOT trigger false mismatch alerts (Zero False Positives)", () => {
    const src = makeNormalizedEvent({
      chain: "ethereum",
      type: "DEPOSIT",
      direction: "source",
      txId: "RFT-TX-VALID",
      bridgeMsgId: "MSG-VALID-01",
      token: "USDC",
      amount: 50_000_000,
      recipient: "0x7a41…e9c0",
      confirmations: 32,
      requiredConfirmations: 32,
      finalized: true,
      detail: "Clean source lock",
    });

    const dst = makeNormalizedEvent({
      chain: "arbitrum",
      type: "WITHDRAWAL",
      direction: "destination",
      txId: "RFT-TX-VALID",
      bridgeMsgId: "MSG-VALID-01",
      token: "USDC",
      amount: 50_000_000,
      recipient: "0x7a41…e9c0",
      confirmations: 12,
      requiredConfirmations: 12,
      finalized: true,
      detail: "Clean destination mint",
    });

    const pair: CorrelatedPair = {
      correlationId: "CORR-01",
      bridgeMsgId: "MSG-VALID-01",
      txId: "RFT-TX-VALID",
      sourceEvent: src,
      destEvent: dst,
      status: "matched",
    };

    const evaluation = evaluateCorrelatedPair(pair, [], DEFAULT_RULES);

    expect(evaluation.anomalyDetected).toBe(false);
    expect(evaluation.score).toBe(0);
    expect(evaluation.triggeredRules).toHaveLength(0);
  });

  it("Requirement 2: Deliberate amount mismatch triggers R-02 (Amount Integrity)", () => {
    const src = makeNormalizedEvent({
      chain: "ethereum",
      type: "DEPOSIT",
      direction: "source",
      txId: "RFT-TX-DELTA",
      bridgeMsgId: "MSG-DELTA-01",
      token: "USDC",
      amount: 250_000_000,
      recipient: "0x7a41…e9c0",
      detail: "Deposit 250M",
    });

    const dst = makeNormalizedEvent({
      chain: "arbitrum",
      type: "WITHDRAWAL",
      direction: "destination",
      txId: "RFT-TX-DELTA",
      bridgeMsgId: "MSG-DELTA-01",
      token: "USDC",
      amount: 239_500_000, // 10.5M mismatch
      recipient: "0x7a41…e9c0",
      detail: "Credit 239.5M",
    });

    const pair: CorrelatedPair = {
      correlationId: "CORR-02",
      bridgeMsgId: "MSG-DELTA-01",
      txId: "RFT-TX-DELTA",
      sourceEvent: src,
      destEvent: dst,
      status: "matched",
    };

    const evaluation = evaluateCorrelatedPair(pair, [], DEFAULT_RULES);

    expect(evaluation.anomalyDetected).toBe(true);
    expect(evaluation.score).toBeGreaterThanOrEqual(30);
    const amountRule = evaluation.triggeredRules.find((r) => r.ruleId === "R-02");
    expect(amountRule).toBeDefined();
    expect(amountRule?.expectedValue).toContain("250,000,000");
    expect(amountRule?.observedValue).toContain("239,500,000");
  });

  it("Requirement 3: Beneficiary mismatch triggers R-03 (Beneficiary Verification)", () => {
    const src = makeNormalizedEvent({
      chain: "ethereum",
      type: "DEPOSIT",
      direction: "source",
      txId: "RFT-TX-BEN",
      bridgeMsgId: "MSG-BEN-01",
      token: "USDC",
      amount: 100_000_000,
      recipient: "0x7a41…e9c0",
      detail: "Deposit intended for 0x7a41…e9c0",
    });

    const dst = makeNormalizedEvent({
      chain: "solana",
      type: "WITHDRAWAL",
      direction: "destination",
      txId: "RFT-TX-BEN",
      bridgeMsgId: "MSG-BEN-01",
      token: "USDC",
      amount: 100_000_000,
      recipient: "0x9999…attacker", // Diverted
      detail: "Withdrawal to unauthorized address",
    });

    const pair: CorrelatedPair = {
      correlationId: "CORR-03",
      bridgeMsgId: "MSG-BEN-01",
      txId: "RFT-TX-BEN",
      sourceEvent: src,
      destEvent: dst,
      status: "matched",
    };

    const evaluation = evaluateCorrelatedPair(pair, [], DEFAULT_RULES);

    expect(evaluation.anomalyDetected).toBe(true);
    const benRule = evaluation.triggeredRules.find((r) => r.ruleId === "R-03");
    expect(benRule).toBeDefined();
    expect(benRule?.expectedValue).toBe("0x7a41…e9c0");
    expect(benRule?.observedValue).toBe("0x9999…attacker");
  });

  it("Requirement 4: Missing or unmatched destination event triggers R-01", () => {
    const orphanDst = makeNormalizedEvent({
      chain: "arbitrum",
      type: "WITHDRAWAL",
      direction: "destination",
      txId: "RFT-TX-ORPHAN",
      bridgeMsgId: "MSG-ORPHAN-01",
      token: "USDC",
      amount: 45_000_000,
      recipient: "0x7a41…e9c0",
      detail: "Orphan withdrawal without source deposit",
    });

    const pair: CorrelatedPair = {
      correlationId: "CORR-04",
      bridgeMsgId: "MSG-ORPHAN-01",
      txId: "RFT-TX-ORPHAN",
      destEvent: orphanDst,
      status: "unmatched_destination",
    };

    const evaluation = evaluateCorrelatedPair(pair, [], DEFAULT_RULES);

    expect(evaluation.anomalyDetected).toBe(true);
    const unmatchedRule = evaluation.triggeredRules.find((r) => r.ruleId === "R-01");
    expect(unmatchedRule).toBeDefined();
    expect(unmatchedRule?.observedValue).toContain("No matching source event");
  });

  it("Requirement 5: Duplicate message identifier triggers R-04", () => {
    const src1 = makeNormalizedEvent({
      chain: "ethereum",
      type: "DEPOSIT",
      direction: "source",
      txId: "TX-HISTORIC",
      bridgeMsgId: "MSG-REPLAY-99",
      token: "USDC",
      amount: 10_000_000,
      recipient: "0x7a41…e9c0",
      detail: "First lock",
    });

    const historicalPair: CorrelatedPair = {
      correlationId: "CORR-HISTORIC",
      bridgeMsgId: "MSG-REPLAY-99",
      txId: "TX-HISTORIC",
      sourceEvent: src1,
      status: "matched",
    };

    const src2 = makeNormalizedEvent({
      chain: "polygon",
      type: "DEPOSIT",
      direction: "source",
      txId: "TX-NEW-ATTACK",
      bridgeMsgId: "MSG-REPLAY-99", // Reused
      token: "USDC",
      amount: 10_000_000,
      recipient: "0x7a41…e9c0",
      detail: "Replayed lock",
    });

    const newPair: CorrelatedPair = {
      correlationId: "CORR-ATTACK",
      bridgeMsgId: "MSG-REPLAY-99",
      txId: "TX-NEW-ATTACK",
      sourceEvent: src2,
      status: "matched",
    };

    const evaluation = evaluateCorrelatedPair(newPair, [historicalPair], DEFAULT_RULES);

    expect(evaluation.anomalyDetected).toBe(true);
    const dupRule = evaluation.triggeredRules.find((r) => r.ruleId === "R-04");
    expect(dupRule).toBeDefined();
    expect(dupRule?.reason).toContain("already finalized in transaction TX-HISTORIC");
  });

  it("Requirement 6: Reset restores the clean initial demonstration baseline", () => {
    const state = initialState();
    expect(state.transfers.length).toBeGreaterThan(0);
    expect(state.rules).toHaveLength(DEFAULT_RULES.length);
    expect(state.operationsHeld).toBe(false);
    expect(state.activeAlert).toBeNull();
    expect(state.scanningState).toBe("SCANNING");
  });
});
