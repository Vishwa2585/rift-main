// Shared deterministic demo state for the whole RIFT app.
import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { CLIENTS, CHAINS, simHash, type ChainId } from "./data";
import { DEFAULT_RULES, SCENARIOS, evaluateScenario, makeEvent, resetEventSeq, type Rule, type Scenario } from "./engine";

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
  nfcPayload?: string;
  sourceHash: string;
  destHash?: string;
  createdAt: number;
  note?: string;
}

export interface StreamEvent {
  id: string; chain: string; type: string; txId: string; detail: string; hash: string; at: number;
}

export interface Incident {
  id: string;
  scenarioId: string;
  title: string;
  txId: string;
  score: number;
  contributions: { ruleId: string; name: string; weight: number; applied: boolean }[];
  evidence: string[];
  status: "open" | "investigating" | "resolved";
  notes: string[];
  createdAt: number;
}

export interface AuditEntry {
  id: string; at: number; actor: string; action: string; detail: string;
}

export interface RiftState {
  transfers: Transfer[];
  events: StreamEvent[];
  incidents: Incident[];
  audit: AuditEntry[];
  rules: Rule[];
  attackCount: number;
  activeTxId: string | null;
  selectedNode: string | null;
}

const STORAGE_KEY = "rift-demo-state-v1";

function seedEvents(): StreamEvent[] {
  resetEventSeq();
  const base = Date.now() - 1000 * 60 * 42;
  const seeds: [string, string, string, string][] = [
    ["ethereum", "DEPOSIT", "RFT-TX-0088", "Vault Reserve credited 40.0M USDC"],
    ["arbitrum", "TRANSFER", "RFT-TX-0089", "Chain Operations → Settlement 12.5M USDC"],
    ["solana", "YIELD", "RFT-TX-0090", "Yield Desk harvested 1.8M USDC"],
    ["ethereum", "TRANSFER", "RFT-TX-0091", "Vault Reserve → Venture Desk 75.0M USDC"],
    ["polygon", "SWAP", "RFT-TX-0092", "Swapped 5.0M USDC → WETH"],
    ["ethereum", "WITHDRAWAL", "RFT-TX-0093", "Settlement payout 9.2M USDC"],
  ];
  return seeds.map(([chain, type, txId, detail], i) => ({
    id: `EV-${String(i + 1).padStart(4, "0")}`,
    chain, type, txId, detail,
    hash: simHash(`${txId}:${type}`),
    at: base + i * 1000 * 60 * 6,
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
  const sc = SCENARIOS[0];
  const { contributions, score } = evaluateScenario(sc, DEFAULT_RULES);
  return [{
    id: "INC-0001", scenarioId: sc.id, title: sc.name, txId: "RFT-TX-0087",
    score, contributions, evidence: sc.evidence, status: "resolved",
    notes: ["Resolved: relayer outage confirmed; funds re-routed. (Simulated record)"],
    createdAt: Date.now() - 1000 * 60 * 60 * 5,
  }];
}

function seedAudit(): AuditEntry[] {
  const now = Date.now();
  return [
    { id: "AUD-0001", at: now - 1000 * 60 * 60 * 5, actor: "RIFT WATCH", action: "INCIDENT_RESOLVED", detail: "INC-0001 closed after relayer recovery" },
    { id: "AUD-0002", at: now - 1000 * 60 * 30, actor: "RIFT KEY", action: "AUTHORIZATION", detail: "RFT-TX-0091 authorized via Demo Unit 01" },
    { id: "AUD-0003", at: now - 1000 * 60 * 30, actor: "RIFT BANK", action: "TRANSFER_COMPLETED", detail: "RFT-TX-0091 settled 75.0M USDC" },
  ];
}

export function initialState(): RiftState {
  return {
    transfers: seedTransfers(),
    events: seedEvents(),
    incidents: seedIncidents(),
    audit: seedAudit(),
    rules: DEFAULT_RULES.map((r) => ({ ...r })),
    attackCount: 0,
    activeTxId: null,
    selectedNode: null,
  };
}

type Action =
  | { type: "RESET" }
  | { type: "CREATE_TRANSFER"; transfer: Transfer }
  | { type: "SET_STAGE"; txId: string; stage: TxStage }
  | { type: "SET_STATUS"; txId: string; status: Transfer["status"] }
  | { type: "NFC_VERIFIED"; txId: string; payload: string }
  | { type: "ADD_EVENT"; event: StreamEvent }
  | { type: "LAUNCH_ATTACK"; scenarioId: string; txId: string }
  | { type: "SET_INCIDENT_STATUS"; id: string; status: Incident["status"] }
  | { type: "ADD_NOTE"; id: string; note: string }
  | { type: "TOGGLE_RULE"; id: string }
  | { type: "SET_ACTIVE_TX"; txId: string | null }
  | { type: "SELECT_NODE"; node: string | null }
  | { type: "AUDIT"; actor: string; action: string; detail: string };

let auditSeq = 100;
let evSeq = 100;
let incSeq = 100;
let txSeq = 100;

export function nextTxId() { return `RFT-TX-${String(++txSeq + 100).padStart(4, "0")}`; }

function reducer(state: RiftState, action: Action): RiftState {
  switch (action.type) {
    case "RESET":
      return initialState();
    case "CREATE_TRANSFER":
      return { ...state, transfers: [action.transfer, ...state.transfers], activeTxId: action.transfer.id };
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
      return { ...state, events: [action.event, ...state.events].slice(0, 120) };
    case "LAUNCH_ATTACK": {
      const sc = SCENARIOS.find((s) => s.id === action.scenarioId);
      if (!sc) return state;
      const { contributions, score } = evaluateScenario(sc, state.rules);
      const incident: Incident = {
        id: `INC-${String(++incSeq).padStart(4, "0")}`,
        scenarioId: sc.id, title: sc.name, txId: action.txId,
        score, contributions, evidence: sc.evidence, status: "open", notes: [], createdAt: Date.now(),
      };
      const ev = makeEvent("rift-watch", "ALERT", action.txId, `SIMULATED DETECTION: ${sc.name} — risk ${score}`);
      ev.id = `EV-${String(++evSeq).padStart(4, "0")}`;
      return {
        ...state,
        incidents: [incident, ...state.incidents],
        events: [ev, ...state.events].slice(0, 120),
        attackCount: state.attackCount + 1,
        transfers: state.transfers.map((t) => (t.id === action.txId ? { ...t, status: score > 0 ? "flagged" : t.status } : t)),
      };
    }
    case "SET_INCIDENT_STATUS":
      return { ...state, incidents: state.incidents.map((i) => (i.id === action.id ? { ...i, status: action.status } : i)) };
    case "ADD_NOTE":
      return { ...state, incidents: state.incidents.map((i) => (i.id === action.id ? { ...i, notes: [...i.notes, action.note] } : i)) };
    case "TOGGLE_RULE":
      return { ...state, rules: state.rules.map((r) => (r.id === action.id ? { ...r, enabled: !r.enabled } : r)) };
    case "SET_ACTIVE_TX":
      return { ...state, activeTxId: action.txId };
    case "SELECT_NODE":
      return { ...state, selectedNode: action.node };
    case "AUDIT":
      return {
        ...state,
        audit: [{ id: `AUD-${String(++auditSeq).padStart(4, "0")}`, at: Date.now(), actor: action.actor, action: action.action, detail: action.detail }, ...state.audit].slice(0, 200),
      };
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
    } catch { /* fall through to seed */ }
    return initialState();
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* storage full/blocked — demo still works in memory */ }
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

export { CLIENTS, CHAINS, SCENARIOS, makeEvent, simHash };
export type { Rule, Scenario };
