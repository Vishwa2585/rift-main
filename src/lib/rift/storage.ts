/**
 * RIFT Persistent Storage Engine
 * Supports seamless hybrid operation:
 * - Supabase PostgREST (rift_ prefixed tables) for cross-instance and serverless persistence
 * - In-memory cache & fallback for high-performance testing and graceful degradation
 */

import type { ApiTransaction, IncidentRecord } from "./api-server";

export interface IdempotencyRecord {
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: number;
}

// SQL DDL for initializing persistent Supabase tables
export const RIFT_SUPABASE_SCHEMA_SQL = `
-- ==============================================================================
-- RIFT Persistent Storage Schema (FUSION 2026 | CSB-01)
-- Run this migration in the Supabase SQL Editor to enable cross-instance storage
-- ==============================================================================

create table if not exists rift_transactions (
  id text primary key,
  bank_operation_id text,
  client_id text,
  state text not null,
  status text not null,
  risk_score integer default 0,
  data jsonb not null,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists rift_incidents (
  id text primary key,
  tx_id text,
  bridge_msg_id text,
  rule_id text not null,
  severity text not null,
  status text not null,
  risk_score integer default 0,
  data jsonb not null,
  created_at bigint not null
);

create table if not exists rift_nonces (
  nonce text primary key,
  consumed_at bigint not null,
  tx_id text
);

create table if not exists rift_idempotency (
  idempotency_key text primary key,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null,
  created_at bigint not null
);

-- Indices for rapid querying
create index if not exists idx_rift_tx_bank_op on rift_transactions(bank_operation_id);
create index if not exists idx_rift_tx_state on rift_transactions(state);
create index if not exists idx_rift_inc_tx on rift_incidents(tx_id);
`;

export interface StorageConfig {
  supabaseUrl?: string | undefined;
  supabaseKey?: string | undefined; // Service-role key preferred server-side
}

export class RiftStorage {
  private inMemoryTransactions = new Map<string, ApiTransaction>();
  private inMemoryIncidents = new Map<string, IncidentRecord>();
  private inMemoryNonces = new Set<string>(["AUTH-55219", "AUTH-55231"]);
  private inMemoryIdempotency = new Map<string, IdempotencyRecord>();
  private supabaseUrl: string | undefined;
  private supabaseKey: string | undefined;
  private isSupabaseAvailable: boolean | null = null;

  constructor(config?: StorageConfig) {
    this.supabaseUrl = config?.supabaseUrl || process.env["SUPABASE_URL"] || undefined;
    // Prefer service role key server-side, fallback to anon key if provided
    this.supabaseKey =
      config?.supabaseKey ||
      process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
      process.env["SUPABASE_ANON_KEY"] ||
      undefined;

    this.initDefaultSeed();
  }

  public getStatus(): {
    engine: "supabase" | "memory";
    supabaseConfigured: boolean;
    supabaseAvailable: boolean | null;
    transactionsCount: number;
    incidentsCount: number;
    consumedNoncesCount: number;
  } {
    return {
      engine: this.supabaseUrl && this.supabaseKey ? "supabase" : "memory",
      supabaseConfigured: !!(this.supabaseUrl && this.supabaseKey),
      supabaseAvailable: this.isSupabaseAvailable,
      transactionsCount: this.inMemoryTransactions.size,
      incidentsCount: this.inMemoryIncidents.size,
      consumedNoncesCount: this.inMemoryNonces.size,
    };
  }

  private initDefaultSeed() {
    if (this.inMemoryTransactions.size > 0) return;

    const tx0091: ApiTransaction = {
      id: "RFT-TX-0091",
      bankOperationId: "BNK-OP-0091",
      clientId: "cl-veyron",
      senderAccount: "acc-veyron-1",
      recipient: "0x7a41…e9c0",
      recipientType: "REGISTERED",
      counterpartyId: "CPT-7a41e9c0",
      amount: 50_000_000,
      asset: "USDC",
      sourceChain: "ethereum",
      destChain: "arbitrum",
      state: "SETTLED",
      status: "completed",
      requiresNfc: true,
      nfcVerified: true,
      riskScore: 0,
      sourceHash: "0x3f9a7b1c4e2d8a5f0b3e6c9d2a1f4e7b8c0d3e5a7f9b1c4e2d8a5f0b3e6c9d2a",
      destHash: "0x8a5f0b3e6c9d2a1f4e7b8c0d3e5a7f9b1c4e2d8a5f0b3e6c9d2a1f4e7b8c0d3e",
      sourceBlockNumber: 21_044_200,
      confirmations: 32,
      requiredConfirmations: 32,
      receiptStatus: "SUCCESS",
      isSimulated: true,
      blockchainProvenance: "CONTROLLED_SIMULATION",
      createdAt: Date.now() - 1000 * 60 * 30,
      updatedAt: Date.now() - 1000 * 60 * 25,
    };

    const tx0093: ApiTransaction = {
      id: "RFT-TX-0093",
      bankOperationId: "BNK-OP-0093",
      clientId: "cl-veyron",
      senderAccount: "acc-veyron-1",
      recipient: "0x7a41…e9c0",
      recipientType: "REGISTERED",
      counterpartyId: "CPT-7a41e9c0",
      amount: 50_000_000,
      asset: "USDC",
      sourceChain: "ethereum",
      destChain: "arbitrum",
      state: "PENDING_PARTY_APPROVAL",
      status: "flagged",
      requiresNfc: true,
      nfcVerified: false,
      riskScore: 65,
      twoPartyApproval: {
        required: true,
        senderDecision: "APPROVED",
        receiverDecision: "PENDING",
        deadlineTimestamp: Date.now() + 1000 * 60 * 5,
        reason: "High-value cross-chain transfer requiring counterparty two-party consent.",
        settlementHeld: true,
      },
      keyChallenge: {
        nonce: "NONCE-884122",
        digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        expiresAt: Date.now() + 1000 * 60 * 15,
        consumed: false,
      },
      sourceHash: "0x5a7f9b1c4e2d8a5f0b3e6c9d2a1f4e7b8c0d3e5a7f9b1c4e2d8a5f0b3e6c9d2a",
      sourceBlockNumber: 21_044_205,
      confirmations: 16,
      requiredConfirmations: 32,
      receiptStatus: "PENDING",
      isSimulated: true,
      blockchainProvenance: "CONTROLLED_SIMULATION",
      createdAt: Date.now() - 1000 * 60 * 5,
      updatedAt: Date.now() - 1000 * 60 * 2,
    };

    this.inMemoryTransactions.set(tx0091.id, tx0091);
    this.inMemoryTransactions.set(tx0093.id, tx0093);
  }

  // --- Transactions ---

  public async getTransaction(id: string): Promise<ApiTransaction | null> {
    // 1. Try Supabase PostgREST if configured
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const url = `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rift_transactions?id=eq.${encodeURIComponent(id)}&select=*`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            Accept: "application/json",
          },
        });
        if (res.ok) {
          this.isSupabaseAvailable = true;
          const rows = (await res.json()) as Array<{ data: ApiTransaction }>;
          if (rows && rows.length > 0 && rows[0]?.data) {
            const tx = rows[0].data;
            this.inMemoryTransactions.set(tx.id, tx); // cache locally
            return tx;
          }
        }
      } catch {
        this.isSupabaseAvailable = false;
      }
    }

    // 2. Fallback to memory
    return this.inMemoryTransactions.get(id) || null;
  }

  public async getTransactionByBankOpId(bankOpId: string): Promise<ApiTransaction | null> {
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const url = `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rift_transactions?bank_operation_id=eq.${encodeURIComponent(bankOpId)}&select=*`;
        const res = await fetch(url, {
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const rows = (await res.json()) as Array<{ data: ApiTransaction }>;
          if (rows && rows.length > 0 && rows[0]?.data) {
            return rows[0].data;
          }
        }
      } catch {
        // Fallback
      }
    }

    for (const tx of this.inMemoryTransactions.values()) {
      if (tx.bankOperationId === bankOpId) return tx;
    }
    return null;
  }

  public async getAllTransactions(): Promise<ApiTransaction[]> {
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const url = `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rift_transactions?select=*&order=created_at.desc`;
        const res = await fetch(url, {
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const rows = (await res.json()) as Array<{ data: ApiTransaction }>;
          if (Array.isArray(rows) && rows.length > 0) {
            return rows.map((r) => r.data);
          }
        }
      } catch {
        // Fallback
      }
    }

    return Array.from(this.inMemoryTransactions.values());
  }

  public async saveTransaction(tx: ApiTransaction): Promise<void> {
    // Save to memory cache first for instant synchronous consistency
    this.inMemoryTransactions.set(tx.id, tx);

    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const url = `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rift_transactions`;
        const row = {
          id: tx.id,
          bank_operation_id: tx.bankOperationId,
          client_id: tx.clientId,
          state: tx.state,
          status: tx.status,
          risk_score: tx.riskScore,
          data: tx,
          created_at: tx.createdAt,
          updated_at: tx.updatedAt,
        };
        await fetch(url, {
          method: "POST",
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify(row),
        });
      } catch {
        // Log silently; memory state holds authoritative transaction
      }
    }
  }

  // --- Incidents ---

  public async getIncident(id: string): Promise<IncidentRecord | null> {
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const url = `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rift_incidents?id=eq.${encodeURIComponent(id)}&select=*`;
        const res = await fetch(url, {
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const rows = (await res.json()) as Array<{ data: IncidentRecord }>;
          if (rows && rows.length > 0 && rows[0]?.data) {
            const inc = rows[0].data;
            this.inMemoryIncidents.set(inc.id, inc);
            return inc;
          }
        }
      } catch {
        // Fallback
      }
    }

    return this.inMemoryIncidents.get(id) || null;
  }

  public async getAllIncidents(): Promise<IncidentRecord[]> {
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const url = `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rift_incidents?select=*&order=created_at.desc`;
        const res = await fetch(url, {
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const rows = (await res.json()) as Array<{ data: IncidentRecord }>;
          if (Array.isArray(rows) && rows.length > 0) {
            return rows.map((r) => r.data);
          }
        }
      } catch {
        // Fallback
      }
    }

    return Array.from(this.inMemoryIncidents.values());
  }

  public async saveIncident(incident: IncidentRecord): Promise<void> {
    this.inMemoryIncidents.set(incident.id, incident);

    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const url = `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rift_incidents`;
        const row = {
          id: incident.id,
          tx_id: incident.txId || null,
          bridge_msg_id: incident.bridgeMsgId || null,
          rule_id: incident.ruleId,
          severity: incident.severity,
          status: incident.status,
          risk_score: incident.riskScore,
          data: incident,
          created_at: incident.createdAt,
        };
        await fetch(url, {
          method: "POST",
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify(row),
        });
      } catch {
        // Fallback
      }
    }
  }

  // --- Nonces (Replay Protection R-08) ---

  public async isNonceConsumed(nonce: string): Promise<boolean> {
    if (this.inMemoryNonces.has(nonce)) return true;

    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const url = `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rift_nonces?nonce=eq.${encodeURIComponent(nonce)}&select=nonce`;
        const res = await fetch(url, {
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const rows = (await res.json()) as Array<{ nonce: string }>;
          if (rows && rows.length > 0) {
            this.inMemoryNonces.add(nonce);
            return true;
          }
        }
      } catch {
        // Fallback
      }
    }

    return false;
  }

  public async consumeNonce(nonce: string, txId?: string): Promise<void> {
    this.inMemoryNonces.add(nonce);

    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const url = `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rift_nonces`;
        const row = {
          nonce,
          consumed_at: Date.now(),
          tx_id: txId || null,
        };
        await fetch(url, {
          method: "POST",
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=ignore-duplicates",
          },
          body: JSON.stringify(row),
        });
      } catch {
        // Fallback
      }
    }
  }

  // --- Idempotency ---

  public async getIdempotency(key: string): Promise<IdempotencyRecord | null> {
    if (this.inMemoryIdempotency.has(key)) {
      return this.inMemoryIdempotency.get(key) || null;
    }

    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const url = `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rift_idempotency?idempotency_key=eq.${encodeURIComponent(key)}&select=*`;
        const res = await fetch(url, {
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const rows = (await res.json()) as Array<{
            idempotency_key: string;
            request_hash: string;
            response_status: number;
            response_body: unknown;
            created_at: number;
          }>;
          if (rows && rows.length > 0 && rows[0]) {
            const rec: IdempotencyRecord = {
              requestHash: rows[0].request_hash,
              responseStatus: rows[0].response_status,
              responseBody: rows[0].response_body,
              createdAt: rows[0].created_at,
            };
            this.inMemoryIdempotency.set(key, rec);
            return rec;
          }
        }
      } catch {
        // Fallback
      }
    }

    return null;
  }

  public async saveIdempotency(key: string, record: IdempotencyRecord): Promise<void> {
    this.inMemoryIdempotency.set(key, record);

    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const url = `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rift_idempotency`;
        const row = {
          idempotency_key: key,
          request_hash: record.requestHash,
          response_status: record.responseStatus,
          response_body: record.responseBody,
          created_at: record.createdAt,
        };
        await fetch(url, {
          method: "POST",
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify(row),
        });
      } catch {
        // Fallback
      }
    }
  }

  public resetMemoryStore(): void {
    this.inMemoryTransactions.clear();
    this.inMemoryIncidents.clear();
    this.inMemoryNonces.clear();
    this.inMemoryIdempotency.clear();
    this.inMemoryNonces.add("AUTH-55219");
    this.inMemoryNonces.add("AUTH-55231");
    this.initDefaultSeed();
  }
}

// Global singleton instance
export const riftStorage = new RiftStorage();
