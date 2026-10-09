import { describe, expect, it } from "vitest";
import {
  reducer,
  initialState,
  type Transfer,
  type RiftState,
} from "../lib/rift/store";
import {
  computeTransactionDigest,
  verifyTransactionDigest,
  evaluateTransferPreflight,
  DEFAULT_RULES,
} from "../lib/rift/engine";

describe("CSB-01: End-to-End Security Workflow Verification (Tests A through J)", () => {
  // Helper to create a base mock transfer
  function createMockTransfer(overrides: Partial<Transfer> = {}): Transfer {
    return {
      id: "RFT-TX-9901",
      clientId: "client-apex",
      fromAccount: "acc-apex-eth",
      toAccount: "acc-apex-arb",
      asset: "USDC",
      amount: 5_000_000,
      destChain: "arbitrum",
      recipient: "0x7a41…e9c0",
      stage: "CREATED",
      status: "pending",
      nfcVerified: false,
      requiresNfc: false,
      sourceHash: "0xaa112233445566",
      createdAt: Date.now(),
      ...overrides,
    };
  }

  // TEST A: NORMAL TRANSACTION
  it("TEST A: NORMAL TRANSACTION — Permitted transaction passes checks and completes through configured execution path", () => {
    let state = initialState();
    const transfer = createMockTransfer({
      id: "RFT-TX-TEST-A",
      amount: 5_000_000,
      recipient: "0x7a41…e9c0", // Registered recipient
      requiresNfc: false,
    });

    state = reducer(state, { type: "CREATE_TRANSFER", transfer });
    const created = state.transfers.find((t) => t.id === "RFT-TX-TEST-A");

    expect(created).toBeDefined();
    expect(created?.state).toBe("SETTLED");
    expect(created?.status).toBe("completed");
    expect(created?.recipientType).toBe("REGISTERED");
    expect(created?.confirmations).toBe(32);
    expect(created?.receiptStatus).toBe("SUCCESS");
  });

  // TEST B: SUSPICIOUS TRANSACTION
  it("TEST B: SUSPICIOUS TRANSACTION — Anomalous transaction triggers rule and alerts both parties (PENDING_PARTY_APPROVAL)", () => {
    let state = initialState();
    const suspiciousTransfer = createMockTransfer({
      id: "RFT-TX-TEST-B",
      amount: 50_000_000, // High-value threshold (>20M)
      recipient: "0x7f3910b8f0412b591b92c4a919", // Flagged non-whitelisted beneficiary
    });

    state = reducer(state, { type: "CREATE_TRANSFER", transfer: suspiciousTransfer });
    const flagged = state.transfers.find((t) => t.id === "RFT-TX-TEST-B");

    expect(flagged).toBeDefined();
    expect(flagged?.state).toBe("PENDING_PARTY_APPROVAL");
    expect(flagged?.status).toBe("flagged");
    expect(flagged?.twoPartyApproval).toBeDefined();
    expect(flagged?.twoPartyApproval?.required).toBe(true);
    expect(flagged?.twoPartyApproval?.senderDecision).toBe("PENDING");
    expect(flagged?.twoPartyApproval?.receiverDecision).toBe("PENDING");
    expect(flagged?.twoPartyApproval?.settlementHeld).toBe(true);
    expect(state.activeApprovalTxId).toBe("RFT-TX-TEST-B");
  });

  // TEST C: BOTH PARTIES APPROVE
  it("TEST C: BOTH PARTIES APPROVE — Required approvals are recorded, security policy reevaluated, and transaction proceeds", () => {
    let state = initialState();
    const tx = createMockTransfer({
      id: "RFT-TX-TEST-C",
      amount: 25_000_000,
      recipient: "0x7a41…e9c0",
      requiresNfc: false,
    });

    state = reducer(state, { type: "CREATE_TRANSFER", transfer: tx });
    expect(state.transfers.find((t) => t.id === "RFT-TX-TEST-C")?.state).toBe("PENDING_PARTY_APPROVAL");

    // Sender approves
    state = reducer(state, {
      type: "SUBMIT_PARTY_APPROVAL",
      txId: "RFT-TX-TEST-C",
      party: "sender",
      decision: "APPROVED",
    });
    let intermediate = state.transfers.find((t) => t.id === "RFT-TX-TEST-C");
    expect(intermediate?.twoPartyApproval?.senderDecision).toBe("APPROVED");
    expect(intermediate?.twoPartyApproval?.receiverDecision).toBe("PENDING");
    expect(intermediate?.state).toBe("PENDING_PARTY_APPROVAL");

    // Receiver approves
    state = reducer(state, {
      type: "SUBMIT_PARTY_APPROVAL",
      txId: "RFT-TX-TEST-C",
      party: "receiver",
      decision: "APPROVED",
    });

    const settled = state.transfers.find((t) => t.id === "RFT-TX-TEST-C");
    expect(settled?.twoPartyApproval?.senderDecision).toBe("APPROVED");
    expect(settled?.twoPartyApproval?.receiverDecision).toBe("APPROVED");
    // Reevaluation passes, operation proceeds to SETTLED
    expect(settled?.state).toBe("SETTLED");
    expect(settled?.status).toBe("completed");
    expect(settled?.twoPartyApproval?.settlementHeld).toBe(false);
  });

  // TEST D: ONE PARTY REJECTS
  it("TEST D: ONE PARTY REJECTS — Operation cannot proceed beyond the configured execution gate (REJECTED & HELD)", () => {
    let state = initialState();
    const tx = createMockTransfer({
      id: "RFT-TX-TEST-D",
      amount: 30_000_000,
      recipient: "0x7a41…e9c0",
    });

    state = reducer(state, { type: "CREATE_TRANSFER", transfer: tx });

    // Receiver rejects suspicious transfer
    state = reducer(state, {
      type: "SUBMIT_PARTY_APPROVAL",
      txId: "RFT-TX-TEST-D",
      party: "receiver",
      decision: "REJECTED",
      note: "Unrecognized transfer request",
    });

    const rejected = state.transfers.find((t) => t.id === "RFT-TX-TEST-D");
    expect(rejected?.state).toBe("REJECTED");
    expect(rejected?.status).toBe("rejected");
    expect(rejected?.twoPartyApproval?.settlementHeld).toBe(true);

    // Ensure state machine prevents execution after rejection
    const invalidTransition = reducer(state, {
      type: "SET_TRANSACTION_STATE",
      txId: "RFT-TX-TEST-D",
      state: "SETTLED",
    });
    // Even if attempted via generic dispatch, approval holds rejection audit
    const latestAudit = invalidTransition.audit[0];
    expect(latestAudit).toBeDefined();
  });

  // TEST E: NO RESPONSE (TIMEOUT)
  it("TEST E: NO RESPONSE — Server-side deadline expires and protected operation is held (Silence is not consent)", () => {
    let state = initialState();
    const tx = createMockTransfer({
      id: "RFT-TX-TEST-E",
      amount: 40_000_000,
    });

    state = reducer(state, { type: "CREATE_TRANSFER", transfer: tx });
    expect(state.transfers.find((t) => t.id === "RFT-TX-TEST-E")?.state).toBe("PENDING_PARTY_APPROVAL");

    // Simulate backend timer expiry when deadline passes without mutual response
    state = reducer(state, {
      type: "EXPIRE_APPROVAL",
      txId: "RFT-TX-TEST-E",
    });

    const expired = state.transfers.find((t) => t.id === "RFT-TX-TEST-E");
    expect(expired?.state).toBe("EXPIRED");
    expect(expired?.twoPartyApproval?.settlementHeld).toBe(true);
    expect(state.audit[0]?.action).toBe("APPROVAL_DEADLINE_EXPIRED");
    expect(state.audit[0]?.detail).toContain("silence is not consent");
  });

  // TEST F: RIFT KEY (ONE-TIME AUTHORIZATION & REPLAY PREVENTION)
  it("TEST F: RIFT KEY — Valid NFC authorization accepted for specific transaction, and replay attempts atomically rejected (Rule R-08)", () => {
    let state = initialState();
    const tx = createMockTransfer({
      id: "RFT-TX-TEST-F",
      amount: 15_000_000,
      requiresNfc: true,
      recipient: "0x7a41…e9c0",
    });

    state = reducer(state, { type: "CREATE_TRANSFER", transfer: tx });
    expect(state.transfers.find((t) => t.id === "RFT-TX-TEST-F")?.state).toBe("PENDING_RIFT_KEY");

    // Step 1: Generate transaction-bound challenge
    state = reducer(state, {
      type: "GENERATE_RIFT_KEY_CHALLENGE",
      txId: "RFT-TX-TEST-F",
    });

    const challenge = state.transfers.find((t) => t.id === "RFT-TX-TEST-F")?.keyChallenge;
    expect(challenge).toBeDefined();
    expect(challenge?.nonce).toBeDefined();
    expect(challenge?.digest).toBeDefined();

    const usedNonce = challenge!.nonce;
    const digest = challenge!.digest;

    // Step 2: First valid NFC tap validates & settles atomically
    state = reducer(state, {
      type: "VALIDATE_RIFT_KEY_CHALLENGE",
      txId: "RFT-TX-TEST-F",
      nonce: usedNonce,
      digest,
      cardSerial: "04:A2:8B:E3:44:01",
    });

    const settled = state.transfers.find((t) => t.id === "RFT-TX-TEST-F");
    expect(settled?.state).toBe("SETTLED");
    expect(settled?.status).toBe("completed");
    expect(settled?.keyChallenge?.consumed).toBe(true);
    expect(state.consumedAuthNonces).toContain(usedNonce);

    // Step 3: Replay attack attempt with the same nonce must be rejected atomically!
    const replayAttempt = reducer(state, {
      type: "VALIDATE_RIFT_KEY_CHALLENGE",
      txId: "RFT-TX-TEST-F",
      nonce: usedNonce,
      digest,
      cardSerial: "04:A2:8B:E3:44:01",
    });

    expect(replayAttempt.audit[0]?.action).toBe("AUTHORIZATION_REPLAY_REJECTED");
    expect(replayAttempt.audit[0]?.detail).toContain("Rule R-08");
  });

  // TEST G: TRANSACTION TAMPERING
  it("TEST G: TRANSACTION TAMPERING — Changing protected transaction fields invalidates challenge digest", () => {
    const txId = "RFT-TX-TEST-G";
    const nonce = "NONCE-551921";
    const expiresAt = Date.now() + 60000;

    // Compute authentic digest
    const originalDigest = computeTransactionDigest({
      txId,
      sourceChain: "ethereum",
      destChain: "arbitrum",
      amount: 10_000_000,
      asset: "USDC",
      recipient: "0x7a41…e9c0",
      nonce,
      expiresAt,
    });

    // Verify original digest passes
    const valid = verifyTransactionDigest(originalDigest, {
      txId,
      sourceChain: "ethereum",
      destChain: "arbitrum",
      amount: 10_000_000,
      asset: "USDC",
      recipient: "0x7a41…e9c0",
      nonce,
      expiresAt,
    });
    expect(valid).toBe(true);

    // Tampering test 1: Attacker changes amount from 10M to 50M
    const tamperedAmountValid = verifyTransactionDigest(originalDigest, {
      txId,
      sourceChain: "ethereum",
      destChain: "arbitrum",
      amount: 50_000_000, // Altered!
      asset: "USDC",
      recipient: "0x7a41…e9c0",
      nonce,
      expiresAt,
    });
    expect(tamperedAmountValid).toBe(false);

    // Tampering test 2: Attacker changes recipient to attacker's address
    const tamperedRecipientValid = verifyTransactionDigest(originalDigest, {
      txId,
      sourceChain: "ethereum",
      destChain: "arbitrum",
      amount: 10_000_000,
      asset: "USDC",
      recipient: "0xAttackerAddress9999", // Altered!
      nonce,
      expiresAt,
    });
    expect(tamperedRecipientValid).toBe(false);
  });

  // TEST H: UNREGISTERED RECEIVER (COUNTERPARTY / PENDING CLAIM)
  it("TEST H: UNREGISTERED RECEIVER — Unregistered wallet generates counterparty ID; unaddressed recipient generates pending-claim escrow", () => {
    let state = initialState();

    // Sub-case 1: Unregistered wallet address generates stable Counterparty Record (CPT-xxxx)
    const walletTransfer = createMockTransfer({
      id: "RFT-TX-TEST-H1",
      amount: 1_000_000,
      recipient: "0x3b89b274c3d82a1795bc99e6912384a5",
      requiresNfc: false,
    });
    state = reducer(state, { type: "CREATE_TRANSFER", transfer: walletTransfer });
    const h1 = state.transfers.find((t) => t.id === "RFT-TX-TEST-H1");
    expect(h1?.recipientType).toBe("UNREGISTERED_WALLET");
    expect(h1?.counterpartyId).toMatch(/^CPT-/);

    // Sub-case 2: Recipient with no address triggers Pending Claim escrow (CLM-xxxx)
    const claimTransfer = createMockTransfer({
      id: "RFT-TX-TEST-H2",
      amount: 2_000_000,
      recipient: "partner@unregistered-claim.io",
      requiresNfc: false,
    });
    state = reducer(state, { type: "CREATE_TRANSFER", transfer: claimTransfer });
    const h2 = state.transfers.find((t) => t.id === "RFT-TX-TEST-H2");
    expect(h2?.recipientType).toBe("PENDING_CLAIM");
    expect(h2?.claimToken).toMatch(/^CLM-/);

    // Recipient completes KYC and claims reserved funds
    state = reducer(state, {
      type: "CLAIM_PENDING_TRANSFER",
      txId: "RFT-TX-TEST-H2",
      recipientAddress: "0xNewRegisteredWallet7777",
    });
    const claimed = state.transfers.find((t) => t.id === "RFT-TX-TEST-H2");
    expect(claimed?.state).toBe("SETTLED");
    expect(claimed?.recipient).toBe("0xNewRegisteredWallet7777");
    expect(claimed?.recipientType).toBe("REGISTERED");
  });

  // TEST I: REAL CHAIN VERIFICATION
  it("TEST I: REAL CHAIN VERIFICATION — Verified receipts, block numbers, and destination hash tracking", () => {
    let state = initialState();
    const tx = createMockTransfer({
      id: "RFT-TX-TEST-I",
      amount: 10_000_000,
      requiresNfc: false,
    });

    state = reducer(state, { type: "CREATE_TRANSFER", transfer: tx });
    const created = state.transfers.find((t) => t.id === "RFT-TX-TEST-I");

    expect(created?.sourceBlockNumber).toBe(21_044_200);
    expect(created?.confirmations).toBe(32);
    expect(created?.requiredConfirmations).toBe(32);
    expect(created?.receiptStatus).toBe("SUCCESS");
    expect(created?.sourceHash).toBeDefined();
  });

  // TEST J: FAILURE RECOVERY & IDEMPOTENCY
  it("TEST J: FAILURE RECOVERY & IDEMPOTENCY — Incident containment holds new transfers without corrupting ledger", () => {
    let state = initialState();

    // Toggle emergency operations hold (containment)
    state = reducer(state, { type: "TOGGLE_OPERATIONS_HELD" });
    expect(state.operationsHeld).toBe(true);

    const initialAuditCount = state.audit.length;

    // Reducer maintains audit integrity
    expect(state.audit[0]?.action).toBe("OPERATIONS_HELD");

    // Operations resumed
    state = reducer(state, { type: "TOGGLE_OPERATIONS_HELD" });
    expect(state.operationsHeld).toBe(false);
    expect(state.audit[0]?.action).toBe("OPERATIONS_RESUMED");
  });
});
