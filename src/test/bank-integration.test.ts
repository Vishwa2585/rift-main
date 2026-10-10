import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { RiftBankClient } from "../lib/rift/bank-client";
import {
  handleRiftApiRequest,
  REPLACEMENT_DEV_API_KEY,
  REPLACEMENT_DEV_WEBHOOK_SECRET,
} from "../lib/rift/api-server";

describe("RIFT Bank & Core Engine End-to-End Real HTTP Integration Verification", () => {
  let server: http.Server;
  let serverOrigin: string;
  let bankClient: RiftBankClient;

  beforeAll(async () => {
    // Spin up an actual Node.js HTTP server on a dynamic TCP port
    server = http.createServer(async (req, res) => {
      try {
        const buffers: Buffer[] = [];
        for await (const chunk of req) {
          buffers.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        const bodyBuffer = Buffer.concat(buffers);
        const host = req.headers.host || "127.0.0.1";
        const fullUrl = `http://${host}${req.url}`;
        const webHeaders = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value) {
            if (Array.isArray(value)) {
              value.forEach((v) => webHeaders.append(key, v));
            } else {
              webHeaders.set(key, value);
            }
          }
        }
        const isBodyless = ["GET", "HEAD", "OPTIONS"].includes(req.method || "GET");
        const reqInit: RequestInit = {
          method: req.method || "GET",
          headers: webHeaders,
        };
        if (!isBodyless) {
          reqInit.body = bodyBuffer;
        }
        const webReq = new Request(fullUrl, reqInit);

        const webRes = await handleRiftApiRequest(webReq);

        res.statusCode = webRes.status;
        webRes.headers.forEach((val, key) => {
          res.setHeader(key, val);
        });
        const arrayBuf = await webRes.arrayBuffer();
        res.end(Buffer.from(arrayBuf));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Internal Server Error", detail: String(err) }));
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        serverOrigin = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Instantiate real bank client communicating over ACTUAL TCP socket
    bankClient = new RiftBankClient({
      baseUrl: `${serverOrigin}/api/v1`,
      apiKey: REPLACEMENT_DEV_API_KEY,
      webhookSecret: REPLACEMENT_DEV_WEBHOOK_SECRET,
      directHandler: null, // Forces real fetch() across local network socket
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // Step 1: Health check over live HTTP socket
  it("1. Verifies live cross-service HTTP connection to RIFT Core health endpoint", async () => {
    const health = await bankClient.health();
    expect(health.status).toBe("operational");
    expect(health.system).toBe("RIFT Core Engine");
    expect(health.activeRules).toBeGreaterThanOrEqual(9);
    expect(health.registeredTransactions).toBeGreaterThanOrEqual(1);
    expect((health as any).blockchainProvenance).toBe("CONTROLLED_SIMULATION");
  });

  // Steps 1-4: Create transaction, submit via HTTP, verify creation and transaction ID receipt
  it("2. Steps 1-4: Creates transaction in RIFT Bank, submits via HTTP, verifies RIFT creates & stores transaction and bank receives actual RIFT transaction ID", async () => {
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
    // Authoritative RIFT ID generated
    expect(intentRes.transaction.id).toMatch(/^RFT-TX-\d{4}$/);
    expect(intentRes.transaction.bankOperationId).toBe("BNK-OP-VERIFY-101");
    expect(intentRes.transaction.recipientType).toBe("REGISTERED");
    expect(intentRes.transaction.counterpartyId).toBe("CPT-7a41e9c0");
    expect(intentRes.transaction.sourceBlockNumber).toBeGreaterThan(0);
    expect(intentRes.transaction.isSimulated).toBe(true);
    expect(intentRes.transaction.blockchainProvenance).toBe("CONTROLLED_SIMULATION");
    expect(intentRes.preflight.approved).toBe(true);
  });

  // Step 5: Retrieve transaction status from RIFT API
  it("3. Step 5: Bank retrieves authoritative transaction status from RIFT API over HTTP", async () => {
    const created = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-STATUS-CHECK",
      senderAccount: "acc-vault-primary",
      recipient: "0x4aa1000000000000000000000000000000009f02",
      amount: 5_000_000,
      asset: "USDC",
      destChain: "arbitrum",
      requiresNfc: false,
    });

    const txId = created.transaction.id;
    const authoritative = await bankClient.getTransactionStatus(txId);

    expect(authoritative.id).toBe(txId);
    expect(authoritative.bankOperationId).toBe("BNK-OP-STATUS-CHECK");
    expect(authoritative.amount).toBe(5_000_000);
    expect(authoritative.asset).toBe("USDC");
    expect(authoritative.confirmations).toBeDefined();
    expect(authoritative.isSimulated).toBe(true);
    expect(authoritative.blockchainProvenance).toBe("CONTROLLED_SIMULATION");
  });

  // Steps 6-8: Trigger suspicious transaction, verify detection logic and incident evidence
  it("4. Steps 6-8: Triggers supported suspicious transaction scenario, verifies real detection logic evaluates input, and verifies incident references correct evidence", async () => {
    // 0x7f39... address is a flagged unapproved beneficiary
    const suspiciousRes = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-SUSPICIOUS-R03",
      senderAccount: "acc-bank-vault-1",
      recipient: "0x7f3910b8f0412b591b92c4a919",
      amount: 50_000_000,
      asset: "USDC",
      destChain: "arbitrum",
    });

    expect(suspiciousRes.success).toBe(true);
    const tx = suspiciousRes.transaction;
    expect(tx.status).toBe("flagged");
    expect(tx.state).toBe("PENDING_PARTY_APPROVAL");
    expect(suspiciousRes.preflight.approved).toBe(false);
    expect(tx.riskScore).toBe(65);

    // Rule R-03 triggered in preflight checks
    const r3Check = suspiciousRes.preflight.checks.find((c) => c.ruleId === "R-03");
    expect(r3Check).toBeDefined();
    expect(r3Check?.passed).toBe(false);
    expect((r3Check as any)?.observed).toContain("0x7f3910b8f0412b591b92c4a919");

    // Incident generation and evidence verification
    expect((suspiciousRes as any).incidentId).toBeDefined();
    const incidentId = (suspiciousRes as any).incidentId;

    // Retrieve the incident from RIFT Core and verify evidence
    const incident = await bankClient.getIncident(incidentId);
    expect(incident.id).toBe(incidentId);
    expect(incident.txId).toBe(tx.id);
    expect(incident.ruleId).toBe("R-03");
    expect(incident.severity).toBe("critical");
    expect(incident.evidence.observedValue).toBe("0x7f3910b8f0412b591b92c4a919");
    expect(incident.evidence.expectedValue).toBe("Authorized Institutional Beneficiary");
  });

  // Step 9: Sender and receiver approval handling
  it("5. Step 9: Tests sender and receiver approval handling (mutual consent vs rejection)", async () => {
    // 50M USDC requires two-party consent
    const intentRes = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-DUAL-CONSENT-TEST",
      senderAccount: "acc-vault-institutional",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 50_000_000,
      asset: "USDC",
      destChain: "arbitrum",
      requiresNfc: false,
    });

    const txId = intentRes.transaction.id;
    expect(intentRes.transaction.state).toBe("PENDING_PARTY_APPROVAL");
    expect(intentRes.transaction.twoPartyApproval?.required).toBe(true);

    // Sender approves
    const senderRes = await bankClient.recordPartyApproval({
      txId,
      party: "sender",
      decision: "APPROVED",
      reason: "Sender officer approved transfer",
    });
    expect(senderRes.transaction.twoPartyApproval?.senderDecision).toBe("APPROVED");
    expect(senderRes.transaction.twoPartyApproval?.receiverDecision).toBe("PENDING");
    expect(senderRes.transaction.state).toBe("PENDING_PARTY_APPROVAL"); // Still awaiting receiver

    // Receiver approves -> transitions to READY_FOR_EXECUTION
    const receiverRes = await bankClient.recordPartyApproval({
      txId,
      party: "receiver",
      decision: "APPROVED",
      reason: "Receiver desk approved transfer",
    });
    expect(receiverRes.transaction.twoPartyApproval?.senderDecision).toBe("APPROVED");
    expect(receiverRes.transaction.twoPartyApproval?.receiverDecision).toBe("APPROVED");
    expect(receiverRes.transaction.state).toBe("READY_FOR_EXECUTION");
    expect(receiverRes.transaction.status).toBe("authorized");

    // Rejection scenario: Party rejects
    const rejectTxRes = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-REJECT-TEST",
      senderAccount: "acc-vault-institutional",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 50_000_000,
      asset: "USDC",
      destChain: "arbitrum",
    });

    const rejectRes = await bankClient.recordPartyApproval({
      txId: rejectTxRes.transaction.id,
      party: "receiver",
      decision: "REJECTED",
      reason: "Receiver rejected transfer due to internal discrepancy",
    });
    expect(rejectRes.transaction.state).toBe("REJECTED");
    expect(rejectRes.transaction.status).toBe("rejected");
    expect(rejectRes.transaction.twoPartyApproval?.settlementHeld).toBe(true);
  });

  // Steps 10-11: Expiry when required response is not received, and bank processes resulting state
  it("6. Steps 10-11: Tests expiry when a required response is not received, and bank processes actual resulting state", async () => {
    // Set 50ms deadline window for testing expiry
    const intentRes = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-EXPIRY-TEST",
      senderAccount: "acc-vault-institutional",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 50_000_000,
      asset: "USDC",
      destChain: "arbitrum",
      approvalDeadlineMs: 50, // 50ms deadline
    });

    const txId = intentRes.transaction.id;
    expect(intentRes.transaction.state).toBe("PENDING_PARTY_APPROVAL");

    // Wait for the deadline to expire
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Attempting approval after deadline must fail with HTTP 410 Gone
    await expect(
      bankClient.recordPartyApproval({
        txId,
        party: "sender",
        decision: "APPROVED",
      }),
    ).rejects.toThrow(/HTTP 410/);

    // Bank queries status and processes the actual resulting state: EXPIRED
    const expiredTx = await bankClient.getTransactionStatus(txId);
    expect(expiredTx.state).toBe("EXPIRED");
    expect(expiredTx.status).toBe("flagged");
    expect(expiredTx.twoPartyApproval?.settlementHeld).toBe(true);
  });

  // Step 12: Retries do not create duplicate transactions
  it("7. Step 12: Confirms that retries with idempotency key do not create duplicate transactions", async () => {
    const idempotencyKey = `IDEMP-RETRY-${Date.now()}`;

    const res1 = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-IDEMP-RETRY",
      senderAccount: "acc-bank-1",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 10_000_000,
      asset: "USDC",
      destChain: "arbitrum",
      idempotencyKey,
    });

    // Exact retry returns same transaction ID
    const res2 = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-IDEMP-RETRY",
      senderAccount: "acc-bank-1",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 10_000_000,
      asset: "USDC",
      destChain: "arbitrum",
      idempotencyKey,
    });

    expect(res2.transaction.id).toBe(res1.transaction.id);

    // Conflict retry (payload mutation) returns HTTP 409
    await expect(
      bankClient.submitTransactionIntent({
        bankOperationId: "BNK-OP-IDEMP-RETRY",
        senderAccount: "acc-bank-1",
        recipient: "0x7a4100000000000000000000000000000000e9c0",
        amount: 88_000_000, // Altered amount
        asset: "USDC",
        destChain: "arbitrum",
        idempotencyKey,
      }),
    ).rejects.toThrow(/HTTP 409/);
  });

  // Hardware challenge & replay protection
  it("8. Hardware challenge validation and single-use replay protection (Rule R-08)", async () => {
    const intentRes = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-NFC-CHALLENGE-2",
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

    const verifyRes = await bankClient.validateHardwareChallenge({
      txId: tx.id,
      nonce,
      digest,
    });
    expect(verifyRes.success).toBe(true);
    expect(verifyRes.transaction.nfcVerified).toBe(true);
    expect(verifyRes.transaction.state).toBe("SETTLED");

    // Replay attack must be blocked (HTTP 409)
    await expect(
      bankClient.validateHardwareChallenge({
        txId: tx.id,
        nonce,
        digest,
      }),
    ).rejects.toThrow(/HTTP 409/);
  });

  // Bridge webhook cross-chain anomaly detection and incident generation
  it("9. Transmits HMAC-signed bridge webhook and verifies cross-chain anomaly detection with incident", async () => {
    // Ingest mismatched bridge event (Source: 50M USDC, Destination: 30M USDC -> R-02 violation)
    const webhookRes = await bankClient.sendBridgeWebhook({
      eventType: "BRIDGE_SETTLEMENT_RECONCILIATION",
      bridgeMsgId: "MSG-ANOMALY-R02-TEST",
      sourceEvent: {
        txId: "RFT-TX-0091",
        chain: "ethereum",
        token: "USDC",
        amount: 50_000_000,
        recipient: "0x7a4100000000000000000000000000000000e9c0",
        confirmations: 32,
      },
      destEvent: {
        txId: "RFT-TX-0091",
        chain: "arbitrum",
        token: "USDC",
        amount: 30_000_000, // 20M mismatch!
        recipient: "0x7a4100000000000000000000000000000000e9c0",
        confirmations: 12,
      },
    });

    expect(webhookRes.success).toBe(true);
    expect(webhookRes.anomalyDetected).toBe(true);
    expect(webhookRes.riskScore).toBeGreaterThan(0);
    const r2Triggered = webhookRes.triggeredRules.find((r) => r.ruleId === "R-02");
    expect(r2Triggered).toBeDefined();
    expect((webhookRes as any).incidentId).toBeDefined();

    // Verify incident record via API
    const incident = await bankClient.getIncident((webhookRes as any).incidentId);
    expect(incident.ruleId).toBe("R-02");
    expect(incident.evidence.observedValue).toContain("30,000,000");
  });

  // Verify Bank Server-Side API Adapter (/api/bank/*) protects frontend credentials
  it("10. Bank Server-Side API Adapter (/api/bank/*) allows frontend execution without exposing secrets", async () => {
    // Client configured in browser mode pointing to /api/bank without API key
    const frontendClient = new RiftBankClient({
      baseUrl: `${serverOrigin}/api/bank`,
      apiKey: "", // No key provided
      directHandler: null,
    });

    const res = await frontendClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-BROWSER-ADAPTER",
      senderAccount: "acc-browser-user",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 2_000_000,
      asset: "USDC",
      destChain: "arbitrum",
      requiresNfc: false,
    });

    expect(res.success).toBe(true);
    expect(res.transaction.id).toMatch(/^RFT-TX-\d{4}$/);
    expect(res.transaction.bankOperationId).toBe("BNK-OP-BROWSER-ADAPTER");
  });

  // Legacy credential rejection verification
  it("11. Verifies deprecated legacy default credential 'rift_live_secret_2026' is rejected (401 Unauthorized)", async () => {
    const legacyClient = new RiftBankClient({
      baseUrl: `${serverOrigin}/api/v1`,
      apiKey: "rift_live_secret_2026",
      directHandler: null,
    });

    await expect(
      legacyClient.submitTransactionIntent({
        senderAccount: "acc-test",
        recipient: "0x7a4100000000000000000000000000000000e9c0",
        amount: 1_000_000,
        asset: "USDC",
        destChain: "arbitrum",
      }),
    ).rejects.toThrow(/HTTP 401/);
  });

  // Blockchain claims transparency verification
  it("12. Verifies blockchain claims are explicitly labeled as controlled simulation", async () => {
    const res = await bankClient.submitTransactionIntent({
      bankOperationId: "BNK-OP-BLOCKCHAIN-AUDIT",
      senderAccount: "acc-audit",
      recipient: "0x7a4100000000000000000000000000000000e9c0",
      amount: 1_000_000,
      asset: "USDC",
      destChain: "arbitrum",
    });

    const bc = (res as any).blockchain;
    expect(bc).toBeDefined();
    expect(bc.provenance).toBe("CONTROLLED_SIMULATION");
    expect(bc.isSimulated).toBe(true);
    expect(bc.note).toContain("Controlled demonstration fixture");
    // Hashes are deterministic simulation fixtures (simHash), not raw RPC responses
    expect(bc.sourceHash).toMatch(/^0x[a-f0-9]{64}$/);
  });

  // 13. Cross-application RIFT Bank contract test (/api/v1/rift/transfers/intent)
  it("13. Cross-application RIFT Bank contract test with exact bank payload and shared transfer_id", async () => {
    const bankTransferId = "BNK-OP-CROSS-APP-7721";
    const payload = {
      transfer_id: bankTransferId,
      idempotency_key: "IDEMP-BANK-CROSS-001",
      client_id: "cl-veyron",
      source_account_id: "acc-veyron-master",
      destination_account_id: "acc-prime-arbitrum",
      asset: "USDC",
      amount_display: 25_000_000,
      destination_address: "0x7a4100000000000000000000000000000000e9c0",
      destChain: "arbitrum",
      requested_by: "Alexander Veyron",
    };

    // Call RIFT Core using the RIFT Bank simulation adapter API key
    const res = await fetch(`${serverOrigin}/api/v1/rift/transfers/intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RIFT-API-Key": "dev_csb01_rift_key_simulation",
        "Idempotency-Key": "IDEMP-BANK-CROSS-001",
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.transfer_id).toBe(bankTransferId);
    expect(data.rift_operation_id).toMatch(/^RFT-TX-\d{4}$/);
    expect(data.risk_assessment.level).toBe("HIGH");
    expect(data.authorization_requirements.requires_two_party).toBe(true);

    const riftOpId = data.rift_operation_id;

    // Verify retrieval by both RIFT operation ID and Bank transfer ID
    const getResByRift = await fetch(`${serverOrigin}/api/v1/rift/operations/${riftOpId}`, {
      headers: { "X-RIFT-API-Key": "dev_csb01_rift_key_simulation" },
    });
    expect(getResByRift.status).toBe(200);
    const opByRift = await getResByRift.json();
    expect(opByRift.transfer_id).toBe(bankTransferId);

    const getResByBank = await fetch(`${serverOrigin}/api/v1/rift/operations/${bankTransferId}`, {
      headers: { "X-RIFT-API-Key": "dev_csb01_rift_key_simulation" },
    });
    expect(getResByBank.status).toBe(200);
    const opByBank = await getResByBank.json();
    expect(opByBank.rift_operation_id).toBe(riftOpId);

    // Bank Authorization step
    const authRes = await fetch(`${serverOrigin}/api/v1/rift/operations/${riftOpId}/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RIFT-API-Key": "dev_csb01_rift_key_simulation",
      },
      body: JSON.stringify({
        approver: "Alexander Veyron Chief Risk Officer",
        comments: "Cross-application dual-sign authorized",
      }),
    });
    expect(authRes.status).toBe(200);
    const authData = await authRes.json();
    expect(authData.status).toBe("AUTHORIZED");
    expect(authData.transfer_id).toBe(bankTransferId);

    // Verify updated authoritative status across both applications
    const finalRes = await fetch(`${serverOrigin}/api/v1/transactions/${riftOpId}`, {
      headers: { "x-rift-api-key": REPLACEMENT_DEV_API_KEY },
    });
    const finalData = await finalRes.json();
    expect(finalData.transaction.status).toBe("authorized");
  });

  // 14. Verify security alerts and investigations in RIFT Bank contract
  it("14. Security alerts and forensic investigations reflect correctly in RIFT Bank contract", async () => {
    const bankTransferId = "BNK-OP-ALERT-9912";
    const flaggedPayload = {
      transfer_id: bankTransferId,
      client_id: "cl-veyron",
      source_account_id: "acc-veyron-master",
      destination_address: "0x7f39000000000000000000000000000000000001", // Flagged attacker address
      asset: "USDC",
      amount_display: 80_000_000,
      destChain: "arbitrum",
    };

    const res = await fetch(`${serverOrigin}/api/v1/rift/transfers/intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RIFT-API-Key": "dev_csb01_rift_key_simulation",
      },
      body: JSON.stringify(flaggedPayload),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.risk_assessment.level).toBe("CRITICAL");
    expect(data.transaction.status).toBe("flagged");
    expect(data.incidentId).toBeDefined();

    // Query investigation endpoint as used by RIFT Bank
    const invRes = await fetch(`${serverOrigin}/api/v1/rift/investigation/${data.rift_operation_id}`, {
      headers: { "X-RIFT-API-Key": "dev_csb01_rift_key_simulation" },
    });
    expect(invRes.status).toBe(200);
    const invData = await invRes.json();
    expect(invData.success).toBe(true);
    expect(invData.incident.ruleId).toBe("R-03");
    expect(invData.incident.severity).toBe("critical");
  });

  // 15. Verify Supabase schema endpoint (/api/v1/schema)
  it("15. Schema endpoint provides DDL for persistent rift_ Supabase tables", async () => {
    const res = await fetch(`${serverOrigin}/api/v1/schema`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.sql).toContain("create table if not exists rift_transactions");
    expect(data.sql).toContain("create table if not exists rift_incidents");
    expect(data.sql).toContain("create table if not exists rift_nonces");
    expect(data.sql).toContain("create table if not exists rift_idempotency");
    expect(data.storageStatus).toBeDefined();
  });
});

