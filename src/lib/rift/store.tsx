// Shared deterministic state & detection pipeline for RIFT
// Fusion 2026 | Real-Time Interchain Fraud Tracking (CSB-01)
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { CLIENTS, CHAINS, simHash, type ChainId } from "./data";
import {
  DEFAULT_RULES,
  ATTACK_SCENARIOS,
  SCENARIOS,
  CANONICAL_TOKEN_MAPPINGS,
  evaluateCorrelatedPair,
  riskBand,
  makeNormalizedEvent,
  makeEvent,
  resetEventSeq,
  type Rule,
  type NormalizedEvent,
  type CorrelatedPair,
  type RuleEvaluationResult,
  type AttackScenarioTemplate,
  evaluateTransferPreflight,
  type PreflightRuleCheck,
} from "./engine";

export type TxStage =
  | "CREATED" | "RISK_ASSESSMENT" | "AWAITING_AUTHORIZATION" | "AUTHORIZATION_VERIFIED"
  | "SOURCE_TRANSACTION" | "DESTINATION_TRANSACTION" | "CORRELATION" | "FINAL_RESULT";

export const STAGES: TxStage[] = [
  "CREATED", "RISK_ASSESSMENT", "AWAITING_AUTHORIZATION", "AUTHORIZATION_VERIFIED",
  "SOURCE_TRANSACTION", "DESTINATION_TRANSACTION", "CORRELATION", "FINAL_RESULT",
];

export interface Transfer {
  id: string;
  clientId: string;
  fromAccount: string;
  toAccount: string;
  asset: string;
  amount: number;
  destChain: ChainId;
  recipient: string;
  stage: TxStage;
  status: "pending" | "authorized" | "completed" | "flagged" | "rejected";
  nfcVerified: boolean;
  nfcPayload?: string | undefined;
  riftKeyPayload?: string | undefined;
  requiresNfc?: boolean | undefined;
  sourceHash: string;
  destHash?: string | undefined;
  createdAt: number;
  note?: string | undefined;
}

export interface PendingInboundTransfer {
  txId: string;
  senderName: string;
  senderAddress: string;
  asset: string;
  amount: number;
  destChain: string;
  recipientAddress: string;
  riftKeyPayload: string;
  requiresNfc: boolean;
  nfcValidated: boolean;
  settled: boolean;
  createdAt: number;
  settledAt?: number;
}

export interface DemoReceiverAccount {
  id: string;
  name: string;
  address: string;
  balance: number;
  asset: string;
  pendingInbound: PendingInboundTransfer[];
}

export interface VirtualNfcCard {
  programmed: boolean;
  payload: string | null;
  txId: string | null;
  keyId: string | null;
  serial: string;
  lastWrittenAt?: number;
}

export interface StreamEvent {
  id: string;
  chain: string;
  type: string;
  txId: string;
  detail: string;
  hash: string;
  at: number;
  isSimulated?: boolean;
}

export interface IncidentTimelineEntry {
  step: string;
  timestamp: number;
  detail: string;
  status: "info" | "warning" | "alert" | "action";
}

export interface Incident {
  id: string;
  scenarioId?: string | undefined;
  title: string;
  txId: string;
  score: number;
  severity: "low" | "medium" | "high" | "critical";
  anomalyType: string;
  dataSource: "CONTROLLED DEMO STREAM" | "LIVE LOCAL CHAIN" | "HISTORICAL REPLAY";
  contributions: { ruleId: string; name: string; weight: number; applied: boolean }[];
  evidence: string[];
  status: "open" | "investigating" | "resolved" | "false_positive";
  falsePositiveJustification?: string | undefined;
  correlatedPair?: CorrelatedPair | undefined;
  ruleResults: RuleEvaluationResult[];
  evidenceLimitations: string[];
  timeline: IncidentTimelineEntry[];
  notes: string[];
  createdAt: number;
}

export interface AuditEntry {
  id: string;
  at: number;
  actor: string;
  action: string;
  detail: string;
}

export interface RiftState {
  transfers: Transfer[];
  events: StreamEvent[];
  normalizedEvents: NormalizedEvent[];
  correlatedPairs: CorrelatedPair[];
  incidents: Incident[];
  audit: AuditEntry[];
  rules: Rule[];
  attackCount: number;
  activeTxId: string | null;
  selectedNode: string | null;
  dataSource: "CONTROLLED DEMO STREAM" | "LIVE LOCAL CHAIN" | "HISTORICAL REPLAY";
  scanningState: "IDLE" | "SCANNING" | "PAUSED" | "CORRELATING" | "ALERT_GENERATED";
  operationsHeld: boolean;
  activeAlert: Incident | null;
  receiverAccount: DemoReceiverAccount;
  virtualNfcCard: VirtualNfcCard;
}

const STORAGE_KEY = "rift-demo-state-v4";

export const INITIAL_RECEIVER_ACCOUNT: DemoReceiverAccount = {
  id: "rec-apex-01",
  name: "Apex Global Settlement Corp",
  address: "0x7a41…e9c0",
  balance: 145_000_000,
  asset: "USDC",
  pendingInbound: [
    {
      txId: "RFT-TX-0088",
      senderName: "Veyron Vault Reserve",
      senderAddress: "0x1142…99aa",
      asset: "USDC",
      amount: 40_000_000,
      destChain: "arbitrum",
      recipientAddress: "0x7a41…e9c0",
      riftKeyPayload: "RIFT-KEY:v2:RFT-TX-0088:AUTH-55219:0x7a41…e9c0:40000000:USDC:7c19a",
      requiresNfc: true,
      nfcValidated: true,
      settled: true,
      createdAt: Date.now() - 1000 * 60 * 40,
      settledAt: Date.now() - 1000 * 60 * 38,
    },
  ],
};

export const INITIAL_VIRTUAL_NFC_CARD: VirtualNfcCard = {
  programmed: false,
  payload: null,
  txId: null,
  keyId: null,
  serial: "04:A2:8B:E3:44:01",
};

function seedEvents(): StreamEvent[] {
  resetEventSeq();
  const base = Date.now() - 1000 * 60 * 42;
  const seeds: [string, string, string, string][] = [
    ["ethereum", "DEPOSIT", "RFT-TX-0088", "Vault Reserve credited 40.0M USDC [Simulated]"],
    ["arbitrum", "TRANSFER", "RFT-TX-0089", "Chain Operations → Settlement 12.5M USDC [Simulated]"],
    ["solana", "YIELD", "RFT-TX-0090", "Yield Desk harvested 1.8M USDC [Simulated]"],
    ["ethereum", "TRANSFER", "RFT-TX-0091", "Vault Reserve → Venture Desk 75.0M USDC [Simulated]"],
    ["polygon", "SWAP", "RFT-TX-0092", "Swapped 5.0M USDC → WETH [Simulated]"],
    ["ethereum", "WITHDRAWAL", "RFT-TX-0093", "Settlement payout 9.2M USDC [Simulated]"],
  ];
  return seeds.map(([chain, type, txId, detail], i) => ({
    id: `EV-${String(i + 1).padStart(4, "0")}`,
    chain,
    type,
    txId,
    detail,
    hash: simHash(`${txId}:${type}`),
    at: base + i * 1000 * 60 * 6,
    isSimulated: true,
  }));
}

function seedTransfers(): Transfer[] {
  const now = Date.now();
  return [
    {
      id: "RFT-TX-0091", clientId: "cl-ellington", fromAccount: "acc-ellington-1", toAccount: "acc-ellington-2",
      asset: "USDC", amount: 75_000_000, destChain: "ethereum", recipient: "0x4aa1…9f02",
      stage: "FINAL_RESULT", status: "completed", nfcVerified: true, nfcPayload: "RIFT-KEY:DEMO-01",
      sourceHash: simHash("RFT-TX-0091:src"), destHash: simHash("RFT-TX-0091:dst"), createdAt: now - 1000 * 60 * 30,
    },
    {
      id: "RFT-TX-0093", clientId: "cl-blackwell", fromAccount: "acc-blackwell-2", toAccount: "acc-blackwell-1",
      asset: "USDC", amount: 9_200_000, destChain: "ethereum", recipient: "0x91bc…44de",
      stage: "CORRELATION", status: "pending", nfcVerified: true, nfcPayload: "RIFT-KEY:DEMO-01",
      sourceHash: simHash("RFT-TX-0093:src"), createdAt: now - 1000 * 60 * 8,
    },
  ];
}

function seedIncidents(): Incident[] {
  const now = Date.now() - 1000 * 60 * 60 * 5;
  const initialPair: CorrelatedPair = {
    correlationId: "CORR-0087",
    bridgeMsgId: "MSG-88400",
    txId: "RFT-TX-0087",
    sourceEvent: {
      id: "EV-0001",
      txHash: simHash("RFT-TX-0087:src"),
      chain: "ethereum",
      type: "DEPOSIT",
      direction: "source",
      bridgeMsgId: "MSG-88400",
      blockNumber: 21_044_118,
      confirmations: 32,
      requiredConfirmations: 32,
      finalized: true,
      sender: "0x1142…99aa",
      recipient: "0x7a41…e9c0",
      token: "USDC",
      amount: 40_000_000,
      timestamp: now - 12_000,
      detail: "Source collateral lock 40.0M USDC on Ethereum",
      isSimulated: true,
    },
    status: "unmatched_source",
    evaluatedAt: now,
  };

  return [
    {
      id: "INC-0001",
      scenarioId: "sc-missing-dest",
      title: "Missing Destination Credit Event",
      txId: "RFT-TX-0087",
      score: 35,
      severity: "high",
      anomalyType: "UNMATCHED_DESTINATION",
      dataSource: "CONTROLLED DEMO STREAM",
      contributions: [{ ruleId: "R-01", name: "Unmatched Destination Event", weight: 35, applied: true }],
      evidence: [
        "Source collateral lock 40.0M USDC observed at Ethereum block 21,044,118",
        "Bridge relayer MSG-88400 emitted with 32 confirmations",
        "Destination credit event missing after 15s finality window",
      ],
      status: "resolved",
      ruleResults: [
        {
          ruleId: "R-01",
          ruleName: "Unmatched Destination Event",
          severity: "high",
          triggered: true,
          reason: "Source debit finalized on ethereum at block 21044118; destination credit missing after finality window (15s).",
          eventRefs: ["EV-0001"],
          expectedValue: "Destination credit within 15s on bridge msg MSG-88400",
          observedValue: "Destination event not observed",
          timestamp: now,
          riskContribution: 35,
        },
      ],
      evidenceLimitations: ["Destination relayer RPC nominal; cross-chain latency exceeded threshold."],
      timeline: [
        { step: "EVENT_INGESTED", timestamp: now - 15000, detail: "Ingested source deposit event EV-0001 on Ethereum", status: "info" },
        { step: "NORMALIZATION", timestamp: now - 14500, detail: "Normalized event schema and extracted bridge msg MSG-88400", status: "info" },
        { step: "CORRELATION_CHECK", timestamp: now - 12000, detail: "Awaiting destination mint on Arbitrum", status: "warning" },
        { step: "RULE_TRIGGERED", timestamp: now - 5000, detail: "Rule R-01 (Unmatched Destination) triggered: 15s timeout reached", status: "alert" },
        { step: "ALERT_GENERATED", timestamp: now, detail: "Incident INC-0001 created with Risk Score 35", status: "alert" },
        { step: "RESOLVED", timestamp: now + 60000, detail: "Incident resolved: relayer outage cleared, destination credit verified", status: "action" },
      ],
      notes: ["Resolved: relayer outage confirmed; funds re-routed. (Simulated historical record)"],
      createdAt: now,
      correlatedPair: initialPair,
    },
  ];
}

function seedAudit(): AuditEntry[] {
  const now = Date.now();
  return [
    { id: "AUD-0001", at: now - 1000 * 60 * 60 * 5, actor: "RIFT DETECTOR", action: "INCIDENT_RESOLVED", detail: "INC-0001 closed after relayer recovery" },
    { id: "AUD-0002", at: now - 1000 * 60 * 30, actor: "RIFT KEY", action: "AUTHORIZATION", detail: "RFT-TX-0091 authorized via Demo Unit 01" },
    { id: "AUD-0003", at: now - 1000 * 60 * 30, actor: "RIFT BANK", action: "TRANSFER_COMPLETED", detail: "RFT-TX-0091 settled 75.0M USDC" },
  ];
}

export function initialState(): RiftState {
  return {
    transfers: seedTransfers(),
    events: seedEvents(),
    normalizedEvents: [],
    correlatedPairs: [],
    incidents: seedIncidents(),
    audit: seedAudit(),
    rules: DEFAULT_RULES.map((r) => ({ ...r })),
    attackCount: 0,
    activeTxId: null,
    selectedNode: null,
    dataSource: "CONTROLLED DEMO STREAM",
    scanningState: "SCANNING",
    operationsHeld: false,
    activeAlert: null,
    receiverAccount: INITIAL_RECEIVER_ACCOUNT,
    virtualNfcCard: INITIAL_VIRTUAL_NFC_CARD,
  };
}

let auditSeq = 100;
let evSeq = 100;
let incSeq = 100;
let txSeq = 100;

export function nextTxId() { return `RFT-TX-${String(++txSeq + 100).padStart(4, "0")}`; }

type Action =
  | { type: "RESET" }
  | { type: "CREATE_TRANSFER"; transfer: Transfer }
  | { type: "WRITE_RIFT_NFC_KEY"; txId: string; payload: string; serial?: string }
  | { type: "RECEIVER_VALIDATE_NFC"; txId: string; payload: string; serial?: string }
  | { type: "SET_STAGE"; txId: string; stage: TxStage }
  | { type: "SET_STATUS"; txId: string; status: Transfer["status"] }
  | { type: "NFC_VERIFIED"; txId: string; payload: string }
  | { type: "ADD_EVENT"; event: StreamEvent }
  | { type: "INGEST_NORMALIZED_EVENT"; event: NormalizedEvent }
  | { type: "PROCESS_ATTACK_SCENARIO"; scenarioId: string; txId?: string }
  | { type: "PROCESS_NORMAL_DEMO"; txId?: string }
  | { type: "SET_INCIDENT_STATUS"; id: string; status: Incident["status"]; note?: string }
  | { type: "ADD_NOTE"; id: string; note: string }
  | { type: "TOGGLE_RULE"; id: string }
  | { type: "SET_ACTIVE_TX"; txId: string | null }
  | { type: "SELECT_NODE"; node: string | null }
  | { type: "AUDIT"; actor: string; action: string; detail: string }
  | { type: "SET_DATA_SOURCE"; source: RiftState["dataSource"] }
  | { type: "SET_SCANNING_STATE"; state: RiftState["scanningState"] }
  | { type: "TOGGLE_OPERATIONS_HELD" }
  | { type: "DISMISS_ALERT" };

function coreDetectionPipeline(
  state: RiftState,
  incomingEvent: NormalizedEvent,
): { state: RiftState; newIncident?: Incident } {
  const streamEv: StreamEvent = {
    id: incomingEvent.id,
    chain: incomingEvent.chain,
    type: incomingEvent.type,
    txId: incomingEvent.bridgeMsgId || "RFT-TX-LIVE",
    detail: incomingEvent.detail,
    hash: incomingEvent.txHash,
    at: incomingEvent.timestamp,
    isSimulated: incomingEvent.isSimulated,
  };

  const updatedNormalized = [incomingEvent, ...state.normalizedEvents].slice(0, 200);
  const updatedEvents = [streamEv, ...state.events].slice(0, 150);

  // Cross-chain correlation by bridgeMsgId
  const msgId = incomingEvent.bridgeMsgId;
  let pairIndex = state.correlatedPairs.findIndex((p) => p.bridgeMsgId === msgId);
  let pair: CorrelatedPair;

  const currentPairs = [...state.correlatedPairs];

  if (pairIndex >= 0) {
    const existing = currentPairs[pairIndex]!;
    pair = {
      ...existing,
      sourceEvent: incomingEvent.direction === "source" ? incomingEvent : existing.sourceEvent,
      destEvent: incomingEvent.direction === "destination" ? incomingEvent : existing.destEvent,
      status: "matched",
      timeDeltaMs: existing.sourceEvent ? incomingEvent.timestamp - existing.sourceEvent.timestamp : undefined,
      evaluatedAt: Date.now(),
    };
    currentPairs[pairIndex] = pair;
  } else {
    pair = {
      correlationId: `CORR-${String(incomingEvent.id).slice(-4)}`,
      bridgeMsgId: msgId,
      txId: streamEv.txId,
      sourceEvent: incomingEvent.direction === "source" ? incomingEvent : undefined,
      destEvent: incomingEvent.direction === "destination" ? incomingEvent : undefined,
      status: incomingEvent.direction === "destination" ? "unmatched_destination" : "correlating",
      evaluatedAt: Date.now(),
    };
    currentPairs.unshift(pair);
  }

  // Execute Detection Rules against the pair
  const evaluation = evaluateCorrelatedPair(pair, currentPairs, state.rules);

  if (evaluation.anomalyDetected) {
    const incId = `INC-${String(++incSeq).padStart(4, "0")}`;
    const band = riskBand(evaluation.score);
    const primaryRule = evaluation.triggeredRules[0];
    const title = primaryRule ? `Anomaly: ${primaryRule.ruleName}` : "Interchain Anomaly Detected";

    const evidenceList: string[] = [
      `Data Source: ${state.dataSource} (Simulated Event)`,
      `Bridge Msg ID: ${pair.bridgeMsgId}`,
      pair.sourceEvent ? `Source Lock: ${pair.sourceEvent.amount.toLocaleString("en-US")} ${pair.sourceEvent.token} on ${pair.sourceEvent.chain} (Tx ${pair.sourceEvent.txHash.slice(0, 12)}…)` : "No source lock event observed",
      pair.destEvent ? `Destination Release: ${pair.destEvent.amount.toLocaleString("en-US")} ${pair.destEvent.token} on ${pair.destEvent.chain} (Tx ${pair.destEvent.txHash.slice(0, 12)}…)` : "No destination release event observed",
      ...evaluation.triggeredRules.map((r) => `Violation [${r.ruleId}]: ${r.reason}`),
    ];

    const timeline: IncidentTimelineEntry[] = [
      {
        step: "EVENT_INGESTED",
        timestamp: incomingEvent.timestamp - 200,
        detail: `Ingested ${incomingEvent.direction} event ${incomingEvent.id} on ${incomingEvent.chain}`,
        status: "info",
      },
      {
        step: "NORMALIZATION",
        timestamp: incomingEvent.timestamp - 100,
        detail: `Event normalized: bridgeMsgId=${incomingEvent.bridgeMsgId}, token=${incomingEvent.token}, amount=${incomingEvent.amount.toLocaleString("en-US")}`,
        status: "info",
      },
      {
        step: "CORRELATION",
        timestamp: incomingEvent.timestamp,
        detail: `Correlation status: ${pair.status}. Matched against historical ledger.`,
        status: pair.destEvent && !pair.sourceEvent ? "warning" : "info",
      },
      ...evaluation.triggeredRules.map((r) => ({
        step: `RULE_TRIGGERED: ${r.ruleId}`,
        timestamp: incomingEvent.timestamp + 50,
        detail: `${r.ruleName} — ${r.reason} (Expected: "${r.expectedValue}", Observed: "${r.observedValue}")`,
        status: "alert" as const,
      })),
      {
        step: "RISK_ASSESSED",
        timestamp: incomingEvent.timestamp + 80,
        detail: `Deterministic risk calculated: ${evaluation.score}/100 (${band.label}) from ${evaluation.triggeredRules.length} rule(s).`,
        status: "alert",
      },
      {
        step: "ALERT_GENERATED",
        timestamp: incomingEvent.timestamp + 100,
        detail: `Incident ${incId} opened. High-priority alert broadcasted to operator.`,
        status: "alert",
      },
    ];

    const incident: Incident = {
      id: incId,
      title,
      txId: pair.txId || streamEv.txId,
      score: evaluation.score,
      severity: band.tone,
      anomalyType: primaryRule?.ruleName || "GENERAL_ANOMALY",
      dataSource: state.dataSource,
      contributions: evaluation.results.map((r) => ({
        ruleId: r.ruleId,
        name: r.ruleName,
        weight: r.riskContribution,
        applied: r.triggered,
      })),
      evidence: evidenceList,
      status: "open",
      falsePositiveJustification: undefined,
      correlatedPair: pair,
      ruleResults: evaluation.results,
      evidenceLimitations: evaluation.evidenceLimitations,
      timeline,
      notes: [],
      createdAt: Date.now(),
    };

    const alertEvent: StreamEvent = {
      id: `EV-${String(++evSeq).padStart(4, "0")}`,
      chain: "rift-watch",
      type: "ALERT",
      txId: incident.txId,
      detail: `SECURITY ALERT: ${title} — Risk ${incident.score} (${band.label})`,
      hash: simHash(`ALERT:${incId}`),
      at: Date.now(),
      isSimulated: true,
    };

    const auditEntry: AuditEntry = {
      id: `AUD-${String(++auditSeq).padStart(4, "0")}`,
      at: Date.now(),
      actor: "RIFT DETECTOR",
      action: "ALERT_GENERATED",
      detail: `${incident.id} [${incident.severity.toUpperCase()}] Risk ${incident.score} — ${incident.title}`,
    };

    return {
      state: {
        ...state,
        events: [alertEvent, ...updatedEvents],
        normalizedEvents: updatedNormalized,
        correlatedPairs: currentPairs,
        incidents: [incident, ...state.incidents],
        attackCount: state.attackCount + 1,
        scanningState: "ALERT_GENERATED",
        activeAlert: incident,
        audit: [auditEntry, ...state.audit],
      },
      newIncident: incident,
    };
  }

  // Clean event without anomalies
  const auditEntry: AuditEntry = {
    id: `AUD-${String(++auditSeq).padStart(4, "0")}`,
    at: Date.now(),
    actor: "RIFT DETECTOR",
    action: "CORRELATION_VERIFIED",
    detail: `Transfer ${pair.bridgeMsgId} verified clean. Invariant checks passed (Risk: 0).`,
  };

  return {
    state: {
      ...state,
      events: updatedEvents,
      normalizedEvents: updatedNormalized,
      correlatedPairs: currentPairs,
      scanningState: state.scanningState === "ALERT_GENERATED" ? "ALERT_GENERATED" : "SCANNING",
      audit: [auditEntry, ...state.audit],
    },
  };
}

function reducer(state: RiftState, action: Action): RiftState {
  switch (action.type) {
    case "RESET":
      return initialState();

    case "CREATE_TRANSFER": {
      const client = CLIENTS.find((c) => c.id === action.transfer.clientId);
      const isForDemoReceiver =
        action.transfer.recipient.toLowerCase().includes("7a41") ||
        action.transfer.recipient === state.receiverAccount.address;

      const newPendingInbound: PendingInboundTransfer = {
        txId: action.transfer.id,
        senderName: client?.name || "Private Client Vault",
        senderAddress: action.transfer.fromAccount,
        asset: action.transfer.asset,
        amount: action.transfer.amount,
        destChain: action.transfer.destChain,
        recipientAddress: action.transfer.recipient,
        riftKeyPayload: action.transfer.riftKeyPayload || `RIFT-KEY:v2:${action.transfer.id}:PENDING`,
        requiresNfc: action.transfer.requiresNfc ?? true,
        nfcValidated: false,
        settled: false,
        createdAt: Date.now(),
      };

      return {
        ...state,
        transfers: [action.transfer, ...state.transfers],
        activeTxId: action.transfer.id,
        receiverAccount: {
          ...state.receiverAccount,
          pendingInbound: isForDemoReceiver
            ? [newPendingInbound, ...state.receiverAccount.pendingInbound]
            : state.receiverAccount.pendingInbound,
        },
      };
    }

    case "WRITE_RIFT_NFC_KEY": {
      const serial = action.serial || "04:A2:8B:E3:44:01";
      const keyId = `KEY-${action.txId.replace(/[^0-9]/g, "").slice(-4) || "8812"}`;

      const updatedTransfers = state.transfers.map((t) =>
        t.id === action.txId
          ? { ...t, nfcPayload: action.payload, riftKeyPayload: action.payload }
          : t
      );

      const updatedPending = state.receiverAccount.pendingInbound.map((p) =>
        p.txId === action.txId
          ? { ...p, riftKeyPayload: action.payload }
          : p
      );

      return {
        ...state,
        transfers: updatedTransfers,
        virtualNfcCard: {
          programmed: true,
          payload: action.payload,
          txId: action.txId,
          keyId,
          serial,
          lastWrittenAt: Date.now(),
        },
        receiverAccount: {
          ...state.receiverAccount,
          pendingInbound: updatedPending,
        },
        audit: [
          {
            id: `AUD-${String(++auditSeq).padStart(4, "0")}`,
            at: Date.now(),
            actor: "RIFT_NFC_WRITER",
            action: "KEY_WRITTEN_TO_CARD",
            detail: `NFC Card (Serial ${serial}) programmed with key for transfer ${action.txId}`,
          },
          ...state.audit,
        ],
      };
    }

    case "RECEIVER_VALIDATE_NFC": {
      const targetInbound = state.receiverAccount.pendingInbound.find((p) => p.txId === action.txId);
      const amountToAdd = targetInbound ? targetInbound.amount : 50_000_000;

      const updatedPending = state.receiverAccount.pendingInbound.map((p) =>
        p.txId === action.txId
          ? { ...p, nfcValidated: true, settled: true, settledAt: Date.now() }
          : p
      );

      const updatedTransfers = state.transfers.map((t) =>
        t.id === action.txId
          ? {
              ...t,
              stage: "FINAL_RESULT" as const,
              status: "completed" as const,
              nfcVerified: true,
              nfcPayload: action.payload,
              destHash: t.destHash || simHash(`${action.txId}:dest:settled`),
            }
          : t
      );

      const newAudit: AuditEntry = {
        id: `AUD-${String(++auditSeq).padStart(4, "0")}`,
        at: Date.now(),
        actor: "RECEIVER_PORTAL",
        action: "TRANSFER_SETTLED_VIA_NFC",
        detail: `Transfer ${action.txId} validated via physical NFC tap. +${amountToAdd.toLocaleString("en-US")} ${targetInbound?.asset || "USDC"} credited to ${state.receiverAccount.name}`,
      };

      const newEvent: StreamEvent = {
        id: `EV-${String(++evSeq).padStart(4, "0")}`,
        chain: targetInbound?.destChain || "arbitrum",
        type: "SETTLEMENT",
        txId: action.txId,
        detail: `Destination settlement confirmed: +${amountToAdd.toLocaleString("en-US")} USDC credited to ${state.receiverAccount.address} via verified RIFT Key`,
        hash: simHash(`${action.txId}:release`),
        at: Date.now(),
        isSimulated: true,
      };

      return {
        ...state,
        transfers: updatedTransfers,
        receiverAccount: {
          ...state.receiverAccount,
          balance: state.receiverAccount.balance + amountToAdd,
          pendingInbound: updatedPending,
        },
        audit: [newAudit, ...state.audit],
        events: [newEvent, ...state.events],
      };
    }

    case "SET_STAGE":
      return { ...state, transfers: state.transfers.map((t) => (t.id === action.txId ? { ...t, stage: action.stage } : t)) };

    case "SET_STATUS":
      return { ...state, transfers: state.transfers.map((t) => (t.id === action.txId ? { ...t, status: action.status } : t)) };

    case "NFC_VERIFIED":
      return {
        ...state,
        transfers: state.transfers.map((t) =>
          t.id === action.txId ? { ...t, nfcVerified: true, nfcPayload: action.payload, status: "authorized", stage: "AUTHORIZATION_VERIFIED" } : t),
      };

    case "ADD_EVENT":
      return { ...state, events: [action.event, ...state.events].slice(0, 150) };

    case "INGEST_NORMALIZED_EVENT":
      return coreDetectionPipeline(state, action.event).state;

    case "PROCESS_ATTACK_SCENARIO": {
      const scenario = ATTACK_SCENARIOS.find((s) => s.id === action.scenarioId) || ATTACK_SCENARIOS[0]!;
      const txId = action.txId || nextTxId();
      const bridgeMsgId = `MSG-${Math.floor(10000 + Math.random() * 90000)}`;

      let intermediate: RiftState = { ...state, scanningState: "CORRELATING" };

      // Ingest source event if present in scenario
      if (scenario.sourceEvent) {
        const srcEv = makeNormalizedEvent({
          chain: scenario.sourceEvent.chain || "ethereum",
          type: "DEPOSIT",
          direction: "source",
          txId,
          bridgeMsgId: scenario.id === "sc-reused-msg" ? "MSG-88412" : bridgeMsgId,
          token: scenario.sourceEvent.token || "USDC",
          amount: scenario.sourceEvent.amount || 250_000_000,
          recipient: scenario.sourceEvent.recipient || "0x7a41…e9c0",
          confirmations: scenario.sourceEvent.confirmations ?? 32,
          requiredConfirmations: scenario.sourceEvent.requiredConfirmations ?? 32,
          finalized: scenario.sourceEvent.finalized ?? true,
          detail: scenario.sourceEvent.detail || `Source deposit on ${scenario.sourceEvent.chain}`,
        });
        intermediate = coreDetectionPipeline(intermediate, srcEv).state;
      }

      // Ingest destination event if present in scenario
      if (scenario.destEvent) {
        const dstEv = makeNormalizedEvent({
          chain: scenario.destEvent.chain || "arbitrum",
          type: "WITHDRAWAL",
          direction: "destination",
          txId,
          bridgeMsgId: scenario.id === "sc-reused-msg" ? "MSG-88412" : bridgeMsgId,
          token: scenario.destEvent.token || "USDC",
          amount: scenario.destEvent.amount || 239_500_000,
          recipient: scenario.destEvent.recipient || "0x7a41…e9c0",
          confirmations: scenario.destEvent.confirmations ?? 12,
          requiredConfirmations: scenario.destEvent.requiredConfirmations ?? 12,
          finalized: scenario.destEvent.finalized ?? true,
          detail: scenario.destEvent.detail || `Destination withdrawal on ${scenario.destEvent.chain}`,
        });
        const finalStep = coreDetectionPipeline(intermediate, dstEv);
        return finalStep.state;
      }

      return intermediate;
    }

    case "PROCESS_NORMAL_DEMO": {
      const txId = action.txId || nextTxId();
      const bridgeMsgId = `MSG-${Math.floor(10000 + Math.random() * 90000)}`;

      const srcEv = makeNormalizedEvent({
        chain: "ethereum",
        type: "DEPOSIT",
        direction: "source",
        txId,
        bridgeMsgId,
        token: "USDC",
        amount: 50_000_000,
        recipient: "0x7a41…e9c0",
        confirmations: 32,
        requiredConfirmations: 32,
        finalized: true,
        detail: "Normal collateral lock 50.0M USDC on Ethereum [Verified Clean]",
      });

      const dstEv = makeNormalizedEvent({
        chain: "arbitrum",
        type: "WITHDRAWAL",
        direction: "destination",
        txId,
        bridgeMsgId,
        token: "USDC",
        amount: 50_000_000,
        recipient: "0x7a41…e9c0",
        confirmations: 12,
        requiredConfirmations: 12,
        finalized: true,
        detail: "Matching destination credit 50.0M USDC on Arbitrum [Verified Clean]",
      });

      const step1 = coreDetectionPipeline(state, srcEv).state;
      const step2 = coreDetectionPipeline(step1, dstEv).state;
      return step2;
    }

    case "SET_INCIDENT_STATUS": {
      const target = state.incidents.find((i) => i.id === action.id);
      const isDismiss = state.activeAlert?.id === action.id && (action.status === "resolved" || action.status === "false_positive");
      return {
        ...state,
        activeAlert: isDismiss ? null : state.activeAlert,
        incidents: state.incidents.map((i) => {
          if (i.id !== action.id) return i;
          const updatedTimeline = [
            ...i.timeline,
            {
              step: `STATUS_CHANGED: ${action.status.toUpperCase()}`,
              timestamp: Date.now(),
              detail: action.note ? `Operator update: ${action.note}` : `Investigation status transitioned to ${action.status}`,
              status: "action" as const,
            },
          ];
          return {
            ...i,
            status: action.status,
            falsePositiveJustification: action.status === "false_positive" ? action.note : i.falsePositiveJustification,
            notes: action.note ? [...i.notes, action.note] : i.notes,
            timeline: updatedTimeline,
          };
        }),
        audit: [
          {
            id: `AUD-${String(++auditSeq).padStart(4, "0")}`,
            at: Date.now(),
            actor: "OPERATOR",
            action: `INCIDENT_${action.status.toUpperCase()}`,
            detail: `${action.id} status changed to ${action.status}${action.note ? `: ${action.note}` : ""}`,
          },
          ...state.audit,
        ],
      };
    }

    case "ADD_NOTE":
      return {
        ...state,
        incidents: state.incidents.map((i) => (i.id === action.id ? { ...i, notes: [...i.notes, action.note] } : i)),
      };

    case "TOGGLE_RULE":
      return {
        ...state,
        rules: state.rules.map((r) => (r.id === action.id ? { ...r, enabled: !r.enabled } : r)),
        audit: [
          {
            id: `AUD-${String(++auditSeq).padStart(4, "0")}`,
            at: Date.now(),
            actor: "OPERATOR",
            action: "RULE_TOGGLED",
            detail: `Detection rule ${action.id} toggled`,
          },
          ...state.audit,
        ],
      };

    case "SET_ACTIVE_TX":
      return { ...state, activeTxId: action.txId };

    case "SELECT_NODE":
      return { ...state, selectedNode: action.node };

    case "AUDIT":
      return {
        ...state,
        audit: [{ id: `AUD-${String(++auditSeq).padStart(4, "0")}`, at: Date.now(), actor: action.actor, action: action.action, detail: action.detail }, ...state.audit].slice(0, 200),
      };

    case "SET_DATA_SOURCE":
      return {
        ...state,
        dataSource: action.source,
        audit: [
          {
            id: `AUD-${String(++auditSeq).padStart(4, "0")}`,
            at: Date.now(),
            actor: "OPERATOR",
            action: "DATA_SOURCE_CHANGED",
            detail: `Active ingestion source switched to ${action.source}`,
          },
          ...state.audit,
        ],
      };

    case "SET_SCANNING_STATE":
      return { ...state, scanningState: action.state };

    case "TOGGLE_OPERATIONS_HELD": {
      const nextHeld = !state.operationsHeld;
      return {
        ...state,
        operationsHeld: nextHeld,
        audit: [
          {
            id: `AUD-${String(++auditSeq).padStart(4, "0")}`,
            at: Date.now(),
            actor: "INCIDENT_RESPONSE",
            action: nextHeld ? "OPERATIONS_HELD" : "OPERATIONS_RESUMED",
            detail: nextHeld
              ? "Emergency containment activated: New demonstration transfers held across RIFT Bank."
              : "Operations resumed: Transfer authorization controls restored to standard state.",
          },
          ...state.audit,
        ],
      };
    }

    case "DISMISS_ALERT":
      return { ...state, activeAlert: null };

    default:
      return state;
  }
}

const RiftContext = createContext<{ state: RiftState; dispatch: React.Dispatch<Action> } | null>(null);

export function RiftProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    if (typeof window === "undefined") return initialState();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RiftState;
        if (parsed && Array.isArray(parsed.transfers) && Array.isArray(parsed.rules)) return parsed;
      }
    } catch { /* storage fallback */ }
    return initialState();
  });

  // Background ticker for the active Demo Stream when scanning is active
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (state.scanningState === "SCANNING") {
      timerRef.current = setInterval(() => {
        // Emit nominal background telemetry events periodically
        const chains = ["ethereum", "arbitrum", "polygon", "solana"];
        const chain = chains[Math.floor(Math.random() * chains.length)]!;
        const types = ["RELAY_BEAT", "STATE_SYNC", "BLOCK_HEADER", "ORACLE_TICK"];
        const type = types[Math.floor(Math.random() * types.length)]!;
        const ev = makeEvent(chain, type, "SYS-BEAT", `Heartbeat nominal on ${chain} · block synced (simulated stream)`);
        dispatch({ type: "ADD_EVENT", event: ev });
      }, 5000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.scanningState]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* memory only */ }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <RiftContext.Provider value={value}>{children}</RiftContext.Provider>;
}

export function useRift() {
  const ctx = useContext(RiftContext);
  if (!ctx) throw new Error("useRift must be used inside RiftProvider");
  return ctx;
}

export function useClient(id: string | undefined) {
  return CLIENTS.find((c) => c.id === id);
}

export {
  CLIENTS,
  CHAINS,
  ATTACK_SCENARIOS,
  SCENARIOS,
  makeEvent,
  makeNormalizedEvent,
  simHash,
  riskBand,
  evaluateTransferPreflight,
};
export type {
  Rule,
  NormalizedEvent,
  CorrelatedPair,
  RuleEvaluationResult,
  AttackScenarioTemplate,
  PreflightRuleCheck,
};
