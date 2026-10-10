import { describe, it, expect, beforeEach } from "vitest";
import { RiftStorage, RIFT_SUPABASE_SCHEMA_SQL } from "../lib/rift/storage";
import type { ApiTransaction } from "../lib/rift/api-server";

describe("RIFT Persistent Storage & Cross-Instance State Engine", () => {
  let storage: RiftStorage;

  beforeEach(() => {
    storage = new RiftStorage();
    storage.resetMemoryStore();
  });

  it("1. Initializes with default seed transactions (RFT-TX-0091, RFT-TX-0093)", async () => {
    const tx = await storage.getTransaction("RFT-TX-0091");
    expect(tx).toBeDefined();
    expect(tx?.bankOperationId).toBe("BNK-OP-0091");
    expect(tx?.state).toBe("SETTLED");
    expect(tx?.status).toBe("completed");
  });

  it("2. Persists new transaction and retrieves by ID and bankOperationId", async () => {
    const testTx: ApiTransaction = {
      id: "RFT-TX-9999",
      bankOperationId: "BNK-OP-TEST-9999",
      clientId: "cl-veyron",
      senderAccount: "acc-treasury",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      recipientType: "REGISTERED",
      amount: 10_000_000,
      asset: "USDC",
      sourceChain: "ethereum",
      destChain: "arbitrum",
      state: "PENDING_PARTY_APPROVAL",
      status: "pending",
      requiresNfc: true,
      nfcVerified: false,
      riskScore: 30,
      twoPartyApproval: {
        required: true,
        senderDecision: "APPROVED",
        receiverDecision: "PENDING",
        deadlineTimestamp: Date.now() + 60_000,
        reason: "Dual consent required",
        settlementHeld: true,
      },
      sourceHash: "0x" + "a".repeat(64),
      sourceBlockNumber: 21_044_200,
      confirmations: 1,
      requiredConfirmations: 32,
      receiptStatus: "PENDING",
      isSimulated: true,
      blockchainProvenance: "CONTROLLED_SIMULATION",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.saveTransaction(testTx);

    // Retrieve by RIFT ID
    const retrievedById = await storage.getTransaction("RFT-TX-9999");
    expect(retrievedById).toBeDefined();
    expect(retrievedById?.bankOperationId).toBe("BNK-OP-TEST-9999");
    expect(retrievedById?.twoPartyApproval?.senderDecision).toBe("APPROVED");

    // Retrieve by Bank Operation ID
    const retrievedByBankOp = await storage.getTransactionByBankOpId("BNK-OP-TEST-9999");
    expect(retrievedByBankOp).toBeDefined();
    expect(retrievedByBankOp?.id).toBe("RFT-TX-9999");
  });

  it("3. Nonce replay prevention: marks nonce as consumed and blocks reuse", async () => {
    const testNonce = "NONCE-TEST-REPLAY-123";
    expect(await storage.isNonceConsumed(testNonce)).toBe(false);

    await storage.consumeNonce(testNonce, "RFT-TX-9999");
    expect(await storage.isNonceConsumed(testNonce)).toBe(true);

    // Initial default burned nonces from specification
    expect(await storage.isNonceConsumed("AUTH-55219")).toBe(true);
    expect(await storage.isNonceConsumed("AUTH-55231")).toBe(true);
  });

  it("4. Idempotency store caches request hash and response payload", async () => {
    const key = "IDEMP-TEST-KEY-456";
    expect(await storage.getIdempotency(key)).toBeNull();

    const record = {
      requestHash: "hash-abc-123",
      responseStatus: 201,
      responseBody: { success: true, riftTxId: "RFT-TX-0099" },
      createdAt: Date.now(),
    };

    await storage.saveIdempotency(key, record);

    const cached = await storage.getIdempotency(key);
    expect(cached).toBeDefined();
    expect(cached?.requestHash).toBe("hash-abc-123");
    expect(cached?.responseStatus).toBe(201);
  });

  it("5. Persists and queries security incident records", async () => {
    const incident = {
      id: "INC-TEST-001",
      txId: "RFT-TX-9999",
      title: "Cross-Chain Amount Mismatch",
      ruleId: "R-02",
      severity: "high" as const,
      status: "open" as const,
      evidence: {
        expectedValue: "50,000,000",
        observedValue: "20,000,000",
        detail: "Debit and credit amounts do not reconcile",
      },
      riskScore: 75,
      createdAt: Date.now(),
    };

    await storage.saveIncident(incident);

    const retrieved = await storage.getIncident("INC-TEST-001");
    expect(retrieved).toBeDefined();
    expect(retrieved?.ruleId).toBe("R-02");
    expect(retrieved?.riskScore).toBe(75);

    const allInc = await storage.getAllIncidents();
    expect(allInc.some((i) => i.id === "INC-TEST-001")).toBe(true);
  });

  it("6. Schema DDL includes all 4 persistent rift_ tables with proper indices", () => {
    expect(RIFT_SUPABASE_SCHEMA_SQL).toContain("create table if not exists rift_transactions");
    expect(RIFT_SUPABASE_SCHEMA_SQL).toContain("create table if not exists rift_incidents");
    expect(RIFT_SUPABASE_SCHEMA_SQL).toContain("create table if not exists rift_nonces");
    expect(RIFT_SUPABASE_SCHEMA_SQL).toContain("create table if not exists rift_idempotency");
    expect(RIFT_SUPABASE_SCHEMA_SQL).toContain("idx_rift_tx_bank_op");
  });

  it("7. Gracefully degrades to memory engine when Supabase keys are not present", () => {
    const memoryStorage = new RiftStorage({});
    const status = memoryStorage.getStatus();
    expect(status.engine).toBe("memory");
    expect(status.supabaseConfigured).toBe(false);
  });
});
