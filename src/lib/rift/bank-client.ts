/**
 * RIFT Bank API Client & Integration Adapter
 *
 * Official client used by RIFT Bank to communicate with the authoritative
 * RIFT Interchain Fraud Tracking backend.
 *
 * Capabilities:
 * - Submit transaction intents with idempotency keys
 * - Retrieve authoritative transaction statuses
 * - Record sender and receiver two-party consent decisions
 * - Execute transaction-bound hardware challenges (RIFT KEY)
 * - Transmit HMAC-signed cross-chain bridge webhooks
 * - Map schemas seamlessly between Bank and RIFT domains
 */

import type { ApiTransaction } from "./api-server";
import {
  handleRiftApiRequest,
  REPLACEMENT_DEV_API_KEY,
  REPLACEMENT_DEV_WEBHOOK_SECRET,
} from "./api-server";

export interface RiftBankClientConfig {
  baseUrl?: string;
  apiKey?: string;
  webhookSecret?: string;
  /** When true or in server test environments without active HTTP listener, route through internal handler */
  directHandler?: typeof handleRiftApiRequest | null;
}

export interface CreateIntentParams {
  bankOperationId?: string;
  clientId?: string;
  senderAccount: string;
  recipient: string;
  amount: number;
  asset: string;
  sourceChain?: string;
  destChain: string;
  recipientType?: "REGISTERED" | "UNREGISTERED_WALLET" | "PENDING_CLAIM";
  requiresNfc?: boolean;
  approvalDeadlineMs?: number;
  idempotencyKey?: string;
}

export interface PartyApprovalParams {
  txId: string;
  party: "sender" | "receiver";
  decision: "APPROVED" | "REJECTED";
  reason?: string;
}

export interface HardwareChallengeParams {
  txId: string;
  nonce: string;
  digest: string;
}

export interface BridgeWebhookPayload {
  eventType: string;
  bridgeMsgId: string;
  sourceEvent?: {
    txId: string;
    chain: string;
    token: string;
    amount: number;
    recipient: string;
    confirmations?: number;
    detail?: string;
  };
  destEvent?: {
    txId: string;
    chain: string;
    token: string;
    amount: number;
    recipient: string;
    confirmations?: number;
    detail?: string;
  };
}

export class RiftBankClient {
  private baseUrl: string;
  private apiKey: string;
  private webhookSecret: string;
  private directHandler: typeof handleRiftApiRequest | null;
  private isBrowserClient: boolean;

  constructor(config: RiftBankClientConfig = {}) {
    const isBrowser = typeof window !== "undefined" && Boolean(window.location);
    this.isBrowserClient = isBrowser && !config.apiKey && !config.directHandler;

    if (config.baseUrl) {
      this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    } else if (this.isBrowserClient) {
      // Browser client routes through the Bank's secure server-side adapter.
      // Privileged API keys are never exposed in browser requests or bundles.
      this.baseUrl = "/api/bank";
    } else if (typeof process !== "undefined" && process.env && process.env["RIFT_CORE_URL"]) {
      this.baseUrl = process.env["RIFT_CORE_URL"].replace(/\/+$/, "");
    } else {
      this.baseUrl = "http://localhost:3000/api/v1";
    }

    // Resolve API key: In browser client mode, never bundle or transmit privileged secrets
    if (this.isBrowserClient) {
      this.apiKey = "";
      this.webhookSecret = "";
    } else {
      this.apiKey =
        config.apiKey ||
        (typeof process !== "undefined" && process.env ? process.env["RIFT_API_KEY"] : null) ||
        REPLACEMENT_DEV_API_KEY;

      this.webhookSecret =
        config.webhookSecret ||
        (typeof process !== "undefined" && process.env ? process.env["RIFT_WEBHOOK_SECRET"] : null) ||
        REPLACEMENT_DEV_WEBHOOK_SECRET;
    }

    this.directHandler = config.directHandler ?? null;
  }

  /**
   * Internal request dispatcher.
   * Dispatches via standard fetch(), or routes via direct server handler in Node tests.
   */
  private async dispatchRequest(
    path: string,
    method: "GET" | "POST",
    headers: Record<string, string>,
    body?: string,
  ): Promise<{ status: number; ok: boolean; data: any; rawResponse: Response }> {
    const fullUrl = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    const requestHeaders = new Headers();
    Object.entries(headers).forEach(([k, v]) => {
      // Never transmit privileged secret headers in browser client mode
      if (this.isBrowserClient && (k.toLowerCase() === "x-rift-api-key" || k.toLowerCase() === "x-rift-signature")) {
        return;
      }
      if (v) requestHeaders.set(k, v);
    });

    const reqInit: RequestInit = {
      method,
      headers: requestHeaders,
    };
    if (body) {
      reqInit.body = body;
    }

    let response: Response;

    // In Node environments without an open HTTP server, execute through handleRiftApiRequest
    if (this.directHandler) {
      const internalRequest = new Request(fullUrl, reqInit);
      response = await this.directHandler(internalRequest);
    } else {
      try {
        response = await fetch(fullUrl, reqInit);
      } catch (err) {
        // Fallback for SSR / Node environment if local fetch failed
        if (typeof window === "undefined") {
          const internalRequest = new Request(fullUrl, reqInit);
          response = await handleRiftApiRequest(internalRequest);
        } else {
          throw err;
        }
      }
    }

    const contentType = response.headers.get("content-type") || "";
    let data: any = null;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      ok: response.ok,
      data,
      rawResponse: response,
    };
  }

  /**
   * Helper to compute HMAC-SHA256 signature across Node and browser environments
   */
  private async signPayload(payload: string): Promise<string> {
    if (typeof process !== "undefined" && process.versions && process.versions.node) {
      try {
        const cryptoModule = await import("crypto");
        return cryptoModule.createHmac("sha256", this.webhookSecret).update(payload).digest("hex");
      } catch {
        // continue to WebCrypto
      }
    }

    // Web Crypto API
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(this.webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
      return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    // Deterministic fallback for non-crypto environments
    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
      hash = (hash << 5) - hash + payload.charCodeAt(i);
      hash |= 0;
    }
    return `hmac_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Check RIFT System Health
   */
  async health(): Promise<{ status: string; system?: string; activeRules: number; version: string; registeredTransactions: number }> {
    const res = await this.dispatchRequest("/health", "GET", {
      Accept: "application/json",
    });
    if (!res.ok) {
      throw new Error(`Health check failed with status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    return res.data;
  }

  /**
   * Submit a new transaction intent to Project RIFT
   */
  async submitTransactionIntent(params: CreateIntentParams): Promise<{
    success: boolean;
    transaction: ApiTransaction;
    preflight: {
      approved: boolean;
      score: number;
      checks: Array<{ ruleId: string; name: string; passed: boolean; detail: string }>;
    };
  }> {
    const idempotencyKey =
      params.idempotencyKey ||
      `IDEMP-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const payload = JSON.stringify({
      bankOperationId: params.bankOperationId || `BNK-OP-${Date.now()}`,
      clientId: params.clientId || "cl-veyron",
      senderAccount: params.senderAccount,
      recipient: params.recipient,
      recipientAddress: params.recipient,
      amount: params.amount,
      asset: params.asset,
      sourceChain: params.sourceChain || "ethereum",
      destChain: params.destChain,
      recipientType: params.recipientType || "REGISTERED",
      requiresNfc: params.requiresNfc ?? false,
      approvalDeadlineMs: params.approvalDeadlineMs,
    });

    const res = await this.dispatchRequest("/transactions/intent", "POST", {
      "Content-Type": "application/json",
      "x-rift-api-key": this.apiKey,
      "idempotency-key": idempotencyKey,
    }, payload);

    if (!res.ok) {
      throw new Error(`Submit transaction intent failed with HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    return {
      success: res.data.success ?? true,
      transaction: res.data.transaction,
      preflight: {
        approved: res.data.preflightPassed ?? res.data.preflight?.approved ?? true,
        score: res.data.riskScore ?? 0,
        checks: res.data.preflightChecks ?? res.data.preflight?.checks ?? [],
      },
      ...res.data,
    };
  }

  /**
   * Retrieve authoritative transaction status and state
   */
  async getTransactionStatus(txId: string): Promise<ApiTransaction> {
    const res = await this.dispatchRequest(`/transactions/${encodeURIComponent(txId)}`, "GET", {
      Accept: "application/json",
      "x-rift-api-key": this.apiKey,
    });

    if (!res.ok) {
      throw new Error(`Get transaction status failed for ${txId} with HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    return res.data.transaction || res.data;
  }

  /**
   * Run stateless preflight check
   */
  async preflightCheck(params: {
    amount: number;
    asset: string;
    recipient: string;
    destChain: string;
    hasNfcKey?: boolean;
  }): Promise<{ approved: boolean; score: number; checks: any[] }> {
    const payload = JSON.stringify(params);
    const res = await this.dispatchRequest("/transactions/preflight", "POST", {
      "Content-Type": "application/json",
      "x-rift-api-key": this.apiKey,
    }, payload);

    if (!res.ok) {
      throw new Error(`Preflight check failed with HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    return res.data;
  }

  /**
   * Record Sender or Receiver Approval/Rejection
   */
  async recordPartyApproval(params: PartyApprovalParams): Promise<{
    success: boolean;
    transaction: ApiTransaction;
    party: string;
    decision: string;
  }> {
    const payload = JSON.stringify({
      party: params.party,
      decision: params.decision,
      reason: params.reason || `Party ${params.party} recorded decision ${params.decision}`,
    });

    const res = await this.dispatchRequest(`/transactions/${encodeURIComponent(params.txId)}/approval`, "POST", {
      "Content-Type": "application/json",
      "x-rift-api-key": this.apiKey,
    }, payload);

    if (!res.ok) {
      throw new Error(`Party approval failed for ${params.txId} with HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    return {
      success: res.data.success ?? true,
      transaction: res.data.transaction,
      party: params.party,
      decision: params.decision,
      ...res.data,
    };
  }

  /**
   * Validate Transaction-Bound Hardware Challenge (RIFT KEY)
   */
  async validateHardwareChallenge(params: HardwareChallengeParams): Promise<{
    success: boolean;
    transaction: ApiTransaction;
    consumedNonce: string;
    message: string;
  }> {
    const payload = JSON.stringify({
      action: "validate",
      nonce: params.nonce,
      digest: params.digest,
    });

    const res = await this.dispatchRequest(`/transactions/${encodeURIComponent(params.txId)}/challenge`, "POST", {
      "Content-Type": "application/json",
      "x-rift-api-key": this.apiKey,
    }, payload);

    if (!res.ok) {
      throw new Error(`Hardware challenge verification failed for ${params.txId} with HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    return {
      success: res.data.success ?? true,
      transaction: res.data.transaction,
      consumedNonce: res.data.consumedNonce || res.data.nonce || params.nonce,
      message: res.data.message || "Hardware challenge verified successfully",
      ...res.data,
    };
  }

  /**
   * Ingest Bridge Event Webhook (HMAC signed)
   */
  async sendBridgeWebhook(payload: BridgeWebhookPayload): Promise<{
    success: boolean;
    eventType: string;
    bridgeMsgId: string;
    correlationStatus: string;
    anomalyDetected: boolean;
    riskScore: number;
    triggeredRules: any[];
  }> {
    const rawBody = JSON.stringify(payload);
    const signature = await this.signPayload(rawBody);

    const res = await this.dispatchRequest("/webhooks/bank", "POST", {
      "Content-Type": "application/json",
      "x-rift-signature": signature,
    }, rawBody);

    if (!res.ok) {
      throw new Error(`Webhook ingestion failed with HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    return res.data;
  }

  /**
   * Retrieve Incident Record by ID from RIFT Core
   */
  async getIncident(incidentId: string): Promise<any> {
    const res = await this.dispatchRequest(`/incidents/${encodeURIComponent(incidentId)}`, "GET", {
      Accept: "application/json",
      "x-rift-api-key": this.apiKey,
    });

    if (!res.ok) {
      throw new Error(`Get incident failed for ${incidentId} with HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    return res.data.incident || res.data;
  }
}

// Default singleton client instance for direct application consumption
export const riftBankClient = new RiftBankClient();
