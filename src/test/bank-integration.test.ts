import { describe, it, expect, beforeEach } from "vitest";
import { RiftBankClient } from "../lib/rift/bank-client";
import { handleRiftApiRequest } from "../lib/rift/api-server";

describe("RIFT Bank & Core Engine End-to-End Integration Verification", () => {
  let bankClient: RiftBankClient;

  beforeEach(() => {
    // Instantiate real bank client wired directly to the authoritative RIFT server handler
    bankClient = new RiftBankClient({
      baseUrl: "http://localhost:3000/api/v1",
      apiKey: "rift_live_secret_2026",
      webhookSecret: "rift_webhook_signing_secret_2026",
      directHandler: handleRiftApiRequest,
    });
  });

  it("1. Verifies RIFT Bank can connect to RIFT Engine health check", async () => {
    const health = await bankClient.health();
    expect(health.status).toBe("operational");
    expect(health.system).toBe("RIFT Core Engine");
    expect(health.activeRules).toBeGreaterThanOrEqual(9);
    expect(health.registeredTransactions).toBeGreaterThanOrEqual(1);
  });

  it("2. Submits transfer intent from RIFT Bank and receives authoritative transaction ID", async () => {
    const intentRes = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-VERIFY-101",
      clientId: "cl-veyron",
      senderAccount: "acc-bank-vault-1",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 15_000_000,
      asset: "USDC",
      sourceChain: "ethereum",
      destChain: "arbitrum",
      requiresNfc: false,
    });

    expect(intentRes.success).toBe(true);
    expect(intentRes.transaction).toBeDefined();
    expect(intentRes.transaction.id).toMatch(/^RFT-TX-\d{4}$/);
    expect(intentRes.transaction.bankOperationId).toBe("BNK-OP-VERIFY-101");
    expect(intentRes.transaction.recipientType).toBe("REGISTERED");
    expect(intentRes.transaction.counterpartyId).toBe("CPT-7a41e9c0");
    expect(intentRes.transaction.sourceBlockNumber).toBeGreaterThan(0);
    expect(intentRes.transaction.keyChallenge).toBeDefined();
    expect(intentRes.preflight.approved).toBe(true);
  });

  it("3. Enforces idempotency on bank retries (safe retry and collision rejection)", async () => {
    const idempotencyKey = `IDEMP-TEST-${Date.now()}`;

    // Initial submission
    const res1 = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-IDEMP-1",
      senderAccount: "acc-bank-1",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 10_000_000,
      asset: "USDC",
      destChain: "arbitrum",
      idempotencyKey,
    });

    // Exact retry with identical payload should return identical transaction ID
    const res2 = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-IDEMP-1",
      senderAccount: "acc-bank-1",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 10_000_000,
      asset: "USDC",
      destChain: "arbitrum",
      idempotencyKey,
    });

    expect(res2.transaction.id).toBe(res1.transaction.id);

    // Collision attempt: Same idempotency key with modified amount
    await expect(
      bankClient.submitTransactionIntent({
        bankOperationId: "BNK-OP-IDEMP-1",
        senderAccount: "acc-bank-1",
        recipient: "0x7a4100000000000000000000000000000000e9c0",
        amount: 99_000_000, // Altered payload
        asset: "USDC",
        destChain: "arbitrum",
        idempotencyKey,
      }),
    ).rejects.toThrow(/HTTP 409/);
  });

  it("4. Bank retrieves authoritative transaction status from backend", async () => {
    // Create transaction first
    const created = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-STATUS-CHECK",
      senderAccount: "acc-vault-primary",
      recipient: "0x4aa1000000000000000000000000000000009f02",
      amount: 5_000_000,
      asset: "USDC",
      destChain: "base",
    });

    const txId = created.transaction.id;
    const authoritative = await bankClient.getTransactionStatus(txId);

    expect(authoritative.id).toBe(txId);
    expect(authoritative.bankOperationId).toBe("BNK-OP-STATUS-CHECK");
    expect(authoritative.amount).toBe(5_000_000);
    expect(authoritative.asset).toBe("USDC");
    expect(authoritative.confirmations).toBeDefined();
    expect(authoritative.sourceBlockNumber).toBeGreaterThan(0);
  });

  it("5. Orchestrates high-value two-party consent between bank parties", async () => {
    // $60,000,000 triggers high-value policy dual-consent mandate
    const intentRes = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-DUAL-CONSENT",
      senderAccount: "acc-institutional-vault",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 60_000_000,
      asset: "USDC",
      destChain: "arbitrum",
    });

    const txId = intentRes.transaction.id;
    expect(intentRes.transaction.state).toBe("PENDING_PARTY_APPROVAL");
    expect(intentRes.transaction.twoPartyApproval?.required).toBe(true);
    expect(intentRes.transaction.twoPartyApproval?.senderDecision).toBe("PENDING");
    expect(intentRes.transaction.twoPartyApproval?.receiverDecision).toBe("PENDING");

    // Sender approves
    const senderRes = await bankClient.recordPartyApproval({
      txId,
      party: "sender",
      decision: "APPROVED",
      reason: "Institutional sender verified via hardware token",
    });
    expect(senderRes.transaction.twoPartyApproval?.senderDecision).toBe("APPROVED");
    expect(senderRes.transaction.twoPartyApproval?.receiverDecision).toBe("PENDING");
    expect(senderRes.transaction.state).toBe("PENDING_PARTY_APPROVAL"); // Still awaiting receiver

    // Receiver approves
    const receiverRes = await bankClient.recordPartyApproval({
      txId,
      party: "receiver",
      decision: "APPROVED",
      reason: "Counterparty settlement desk confirmed",
    });
    expect(receiverRes.transaction.twoPartyApproval?.senderDecision).toBe("APPROVED");
    expect(receiverRes.transaction.twoPartyApproval?.receiverDecision).toBe("APPROVED");
    // Mutual approval unlocks state
    expect(receiverRes.transaction.state).toBe("READY_FOR_EXECUTION");
    expect(receiverRes.transaction.status).toBe("authorized");
  });

  it("6. Executes and binds RIFT KEY challenge, blocking replay attacks", async () => {
    const intentRes = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-NFC-CHALLENGE",
      senderAccount: "acc-nfc-tester",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 8_000_000,
      asset: "USDC",
      destChain: "arbitrum",
      requiresNfc: true,
    });

    const tx = intentRes.transaction;
    expect(tx.keyChallenge).toBeDefined();
    const { nonce, digest } = tx.keyChallenge!;

    // Initial valid hardware challenge verification
    const verifyRes = await bankClient.validateHardwareChallenge({
      txId: tx.id,
      nonce,
      digest,
    });
    expect(verifyRes.success).toBe(true);
    expect(verifyRes.consumedNonce).toBe(nonce);
    expect(verifyRes.transaction.nfcVerified).toBe(true);

    // Replay attack: Submitting identical consumed nonce must fail with HTTP 409
    await expect(
      bankClient.validateHardwareChallenge({
        txId: tx.id,
        nonce,
        digest,
      }),
    ).rejects.toThrow(/HTTP 409/);
  });

  it("7. Transmits HMAC-SHA256 signed bridge webhook from RIFT Bank to RIFT Engine", async () => {
    const webhookRes = await bankClient.sendBridgeWebhook({
      eventType: "BRIDGE_DEPOSIT_FINALIZED",
      bridgeMsgId: "MSG-BANK-WH-5011",
      sourceEvent: {
        txId: "RFT-TX-0091",
        chain: "ethereum",
        token: "USDC",
        amount: 50_000_000,
        recipient: "0x7a4100000000000000000000000000000000e9c0",
        confirmations: 32,
        detail: "Source vault locked 50M USDC on Ethereum block 21044200",
      },
      destEvent: {
        txId: "RFT-TX-0091",
        chain: "arbitrum",
        token: "USDC",
        amount: 50_000_000,
        recipient: "0x7a4100000000000000000000000000000000e9c0",
        confirmations: 12,
        detail: "Destination gateway minted 50M USDC on Arbitrum block 1829940",
      },
    });

    expect(webhookRes.success).toBe(true);
    expect(webhookRes.bridgeMsgId).toBe("MSG-BANK-WH-5011");
    expect(webhookRes.correlationStatus).toBe("matched");
    expect(webhookRes.anomalyDetected).toBe(false);
    expect(webhookRes.riskScore).toBe(0);
  });
});
