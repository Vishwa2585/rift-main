import { describe, expect, it } from "vitest";
import {
  handleRiftApiRequest,
  REPLACEMENT_DEV_API_KEY,
  REPLACEMENT_DEV_WEBHOOK_SECRET,
} from "../lib/rift/api-server";
import crypto from "crypto";

const API_KEY = process.env["RIFT_API_KEY"] || REPLACEMENT_DEV_API_KEY;
const WEBHOOK_SECRET = process.env["RIFT_WEBHOOK_SECRET"] || REPLACEMENT_DEV_WEBHOOK_SECRET;

function createMockRequest(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  const init: RequestInit = {
    method,
    headers: {
      "x-rift-api-key": API_KEY,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  return new Request(`https://rift.local${path}`, init);
}

describe("RIFT Bank Integration REST API & Security Test Suite", () => {
  // 1. Health check
  it("GET /api/v1/health returns operational status without authentication", async () => {
    const req = new Request("https://rift.local/api/v1/health", { method: "GET" });
    const res = await handleRiftApiRequest(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("operational");
    expect(data.problemStatement).toBe("CSB-01");
  });

  // 2. Authentication enforcement & legacy credential rejection
  it("Rejects requests with missing or invalid API keys (401 Unauthorized)", async () => {
    const req = new Request("https://rift.local/api/v1/transactions/RFT-TX-0091", {
      method: "GET",
      headers: { "x-rift-api-key": "invalid_untrusted_key" },
    });
    const res = await handleRiftApiRequest(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("Rejects deprecated legacy default credential 'rift_live_secret_2026' (401 Unauthorized)", async () => {
    const req = new Request("https://rift.local/api/v1/transactions/RFT-TX-0091", {
      method: "GET",
      headers: { "x-rift-api-key": "rift_live_secret_2026" },
    });
    const res = await handleRiftApiRequest(req);
    expect(res.status).toBe(401);
  });

  // 3. Submit Transaction Intent (Normal Permitted)
  it("POST /api/v1/transactions/intent accepts valid transaction intent and returns stable RIFT ID", async () => {
    const payload = {
      bankOperationId: "BNK-OP-TEST-01",
      clientId: "cl-veyron",
      senderAccount: "acc-veyron-1",
      recipientAddress: "0x7a41…e9c0",
      recipientType: "REGISTERED",
      amount: 5_000_000,
      asset: "USDC",
      sourceChain: "ethereum",
      destChain: "arbitrum",
      requiresNfc: false,
    };

    const req = createMockRequest("/api/v1/transactions/intent", "POST", payload, {
      "idempotency-key": "IDEMP-KEY-TEST-01",
    });
    const res = await handleRiftApiRequest(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.riftTxId).toMatch(/^RFT-TX-/);
    expect(data.state).toBe("SETTLED");
    expect(data.recipientType).toBe("REGISTERED");
  });

  // 4. Idempotency Key Handling
  it("POST /api/v1/transactions/intent is idempotent for repeated submissions with same key", async () => {
    const payload = {
      bankOperationId: "BNK-OP-IDEMP-01",
      senderAccount: "0xSourceVault",
      recipientAddress: "0x7a41…e9c0",
      amount: 10_000_000,
      asset: "USDC",
      sourceChain: "ethereum",
      destChain: "arbitrum",
    };

    const req1 = createMockRequest("/api/v1/transactions/intent", "POST", payload, {
      "idempotency-key": "IDEMP-KEY-STABLE-01",
    });
    const res1 = await handleRiftApiRequest(req1);
    expect(res1.status).toBe(201);
    const data1 = await res1.json();

    // Replay identical submission
    const req2 = createMockRequest("/api/v1/transactions/intent", "POST", payload, {
      "idempotency-key": "IDEMP-KEY-STABLE-01",
    });
    const res2 = await handleRiftApiRequest(req2);
    expect(res2.status).toBe(201);
    const data2 = await res2.json();
    expect(data2.riftTxId).toBe(data1.riftTxId);

    // Conflict test: same key with altered payload must return 409 Conflict
    const alteredPayload = { ...payload, amount: 99_000_000 };
    const req3 = createMockRequest("/api/v1/transactions/intent", "POST", alteredPayload, {
      "idempotency-key": "IDEMP-KEY-STABLE-01",
    });
    const res3 = await handleRiftApiRequest(req3);
    expect(res3.status).toBe(409);
  });

  // 5. High-Value / Anomaly triggers Two-Party Approval
  it("POST /api/v1/transactions/intent enters PENDING_PARTY_APPROVAL on high-value transfer", async () => {
    const payload = {
      bankOperationId: "BNK-OP-HIGHVAL",
      senderAccount: "0xSourceVault",
      recipientAddress: "0x7a41…e9c0",
      amount: 50_000_000, // Exceeds 20M threshold
      asset: "USDC",
      sourceChain: "ethereum",
      destChain: "arbitrum",
    };

    const req = createMockRequest("/api/v1/transactions/intent", "POST", payload);
    const res = await handleRiftApiRequest(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.state).toBe("PENDING_PARTY_APPROVAL");
    expect(data.requiresTwoPartyConsent).toBe(true);
    expect(data.twoPartyApproval.senderDecision).toBe("PENDING");
    expect(data.twoPartyApproval.receiverDecision).toBe("PENDING");
  });

  // 6. Two-Party Approval Endpoint
  it("POST /api/v1/transactions/:id/approval records party decisions and reevaluates policy", async () => {
    // Retrieve seeded pending transaction RFT-TX-0093
    const approvalReq = createMockRequest("/api/v1/transactions/RFT-TX-0093/approval", "POST", {
      party: "receiver",
      decision: "APPROVED",
      note: "Institutional recipient confirmed",
    });
    const approvalRes = await handleRiftApiRequest(approvalReq);
    expect(approvalRes.status).toBe(200);
    const approvalData = await approvalRes.json();
    expect(approvalData.success).toBe(true);
    // Since RFT-TX-0093 requires RIFT KEY, both approvals advance it to PENDING_RIFT_KEY
    expect(approvalData.state).toBe("PENDING_RIFT_KEY");
  });

  // 7. RIFT Key Challenge Generation & Validation
  it("POST /api/v1/transactions/:id/challenge validates challenge and atomically prevents replay", async () => {
    // Generate fresh challenge
    const genReq = createMockRequest("/api/v1/transactions/RFT-TX-0093/challenge", "POST", {
      action: "generate",
    });
    const genRes = await handleRiftApiRequest(genReq);
    expect(genRes.status).toBe(200);
    const genData = await genRes.json();
    expect(genData.nonce).toBeDefined();
    expect(genData.expectedDigest).toBeDefined();

    const usedNonce = genData.nonce;
    const digest = genData.expectedDigest;

    // Validate challenge (First attempt succeeds)
    const valReq = createMockRequest("/api/v1/transactions/RFT-TX-0093/challenge", "POST", {
      action: "validate",
      nonce: usedNonce,
      digest,
    });
    const valRes = await handleRiftApiRequest(valReq);
    expect(valRes.status).toBe(200);
    const valData = await valRes.json();
    expect(valData.state).toBe("SETTLED");

    // Replay attack attempt with same nonce must be rejected (409 Conflict)
    const replayReq = createMockRequest("/api/v1/transactions/RFT-TX-0093/challenge", "POST", {
      action: "validate",
      nonce: usedNonce,
      digest,
    });
    const replayRes = await handleRiftApiRequest(replayReq);
    expect(replayRes.status).toBe(409);
    const replayData = await replayRes.json();
    expect(replayData.error).toBe("Replay Detected");
  });

  // 8. Inbound Bank Webhook with HMAC Signature
  it("POST /api/v1/webhooks/bank verifies HMAC signature and ingests bridge event", async () => {
    const webhookPayload = {
      eventType: "BRIDGE_DEPOSIT_FINALIZED",
      bridgeMsgId: "MSG-WEBHOOK-9941",
      sourceEvent: {
        chain: "ethereum",
        token: "USDC",
        amount: 50_000_000,
        recipient: "0x7a41…e9c0",
        confirmations: 32,
      },
    };

    const rawBody = JSON.stringify(webhookPayload);
    const validSignature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const req = new Request("https://rift.local/api/v1/webhooks/bank", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rift-signature": validSignature,
      },
      body: rawBody,
    });

    const res = await handleRiftApiRequest(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.bridgeMsgId).toBe("MSG-WEBHOOK-9941");
    expect(data.correlationStatus).toBe("pending_dest");
  });

  // 9. Rejects Webhook with Invalid Signature
  it("POST /api/v1/webhooks/bank rejects forged or invalid HMAC signature (403 Forbidden)", async () => {
    const rawBody = JSON.stringify({ bridgeMsgId: "MSG-FAKE" });
    const req = new Request("https://rift.local/api/v1/webhooks/bank", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rift-signature": "forged_invalid_signature_hex",
      },
      body: rawBody,
    });

    const res = await handleRiftApiRequest(req);
    expect(res.status).toBe(403);
  });
});
