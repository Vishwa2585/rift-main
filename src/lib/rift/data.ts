// Deterministic demo data for RIFT — all fictional, no real bank connection.

export interface Client {
  id: string;
  name: string;
  netWorth: string;
  netWorthB: number;
  initials: string;
  tier: string;
  since: number;
  riskProfile: string;
  accounts: Account[];
  allocation: { label: string; pct: number }[];
}

export interface Account {
  id: string;
  label: string;
  number: string;
  balance: number;
  currency: string;
  chain: ChainId;
}

export type ChainId = "ethereum" | "solana" | "polygon" | "arbitrum";

export const CHAINS: { id: ChainId; name: string; status: "operational" | "degraded"; latencyMs: number }[] = [
  { id: "ethereum", name: "Ethereum", status: "operational", latencyMs: 12 },
  { id: "solana", name: "Solana", status: "operational", latencyMs: 4 },
  { id: "polygon", name: "Polygon", status: "operational", latencyMs: 8 },
  { id: "arbitrum", name: "Arbitrum", status: "operational", latencyMs: 6 },
];

export const ASSETS = ["USDC", "ETH", "SOL", "WBTC", "USDT"];

export const CLIENTS: Client[] = [
  {
    id: "cl-veyron", name: "Alexander Veyron", netWorth: "$86.4B", netWorthB: 86.4,
    initials: "AV", tier: "Sovereign", since: 2011, riskProfile: "Conservative",
    accounts: [
      { id: "acc-veyron-1", label: "Vault Reserve", number: "RFT-0001-4410", balance: 12_400_000_000, currency: "USD", chain: "ethereum" },
      { id: "acc-veyron-2", label: "Chain Operations", number: "RFT-0001-8821", balance: 2_150_000_000, currency: "USD", chain: "arbitrum" },
    ],
    allocation: [
      { label: "Equities", pct: 41 }, { label: "Real Assets", pct: 22 },
      { label: "Digital Assets", pct: 19 }, { label: "Cash & Bonds", pct: 18 },
    ],
  },
  {
    id: "cl-laurent", name: "Isabella Laurent", netWorth: "$52.8B", netWorthB: 52.8,
    initials: "IL", tier: "Sovereign", since: 2014, riskProfile: "Balanced",
    accounts: [
      { id: "acc-laurent-1", label: "Vault Reserve", number: "RFT-0002-1190", balance: 8_900_000_000, currency: "USD", chain: "ethereum" },
      { id: "acc-laurent-2", label: "Yield Desk", number: "RFT-0002-5543", balance: 1_420_000_000, currency: "USD", chain: "solana" },
    ],
    allocation: [
      { label: "Equities", pct: 48 }, { label: "Real Assets", pct: 18 },
      { label: "Digital Assets", pct: 12 }, { label: "Cash & Bonds", pct: 22 },
    ],
  },
  {
    id: "cl-wolfe", name: "Cassian Wolfe", netWorth: "$34.2B", netWorthB: 34.2,
    initials: "CW", tier: "Apex", since: 2016, riskProfile: "Aggressive",
    accounts: [
      { id: "acc-wolfe-1", label: "Vault Reserve", number: "RFT-0003-7712", balance: 5_600_000_000, currency: "USD", chain: "ethereum" },
      { id: "acc-wolfe-2", label: "Trading Cell", number: "RFT-0003-3308", balance: 980_000_000, currency: "USD", chain: "solana" },
    ],
    allocation: [
      { label: "Equities", pct: 35 }, { label: "Real Assets", pct: 12 },
      { label: "Digital Assets", pct: 38 }, { label: "Cash & Bonds", pct: 15 },
    ],
  },
  {
    id: "cl-ellington", name: "Zara Ellington", netWorth: "$19.6B", netWorthB: 19.6,
    initials: "ZE", tier: "Apex", since: 2018, riskProfile: "Balanced",
    accounts: [
      { id: "acc-ellington-1", label: "Vault Reserve", number: "RFT-0004-2091", balance: 3_100_000_000, currency: "USD", chain: "polygon" },
      { id: "acc-ellington-2", label: "Venture Desk", number: "RFT-0004-6645", balance: 640_000_000, currency: "USD", chain: "ethereum" },
    ],
    allocation: [
      { label: "Equities", pct: 44 }, { label: "Real Assets", pct: 26 },
      { label: "Digital Assets", pct: 14 }, { label: "Cash & Bonds", pct: 16 },
    ],
  },
  {
    id: "cl-blackwell", name: "Adrian Blackwell", netWorth: "$12.7B", netWorthB: 12.7,
    initials: "AB", tier: "Apex", since: 2019, riskProfile: "Conservative",
    accounts: [
      { id: "acc-blackwell-1", label: "Vault Reserve", number: "RFT-0005-9024", balance: 2_050_000_000, currency: "USD", chain: "ethereum" },
      { id: "acc-blackwell-2", label: "Settlement", number: "RFT-0005-4177", balance: 410_000_000, currency: "USD", chain: "arbitrum" },
    ],
    allocation: [
      { label: "Equities", pct: 38 }, { label: "Real Assets", pct: 30 },
      { label: "Digital Assets", pct: 8 }, { label: "Cash & Bonds", pct: 24 },
    ],
  },
  {
    id: "cl-ashford", name: "Helena Ashford", netWorth: "$8.9B", netWorthB: 8.9,
    initials: "HA", tier: "Crest", since: 2021, riskProfile: "Balanced",
    accounts: [
      { id: "acc-ashford-1", label: "Vault Reserve", number: "RFT-0006-1358", balance: 1_480_000_000, currency: "USD", chain: "polygon" },
      { id: "acc-ashford-2", label: "Philanthropy", number: "RFT-0006-7762", balance: 290_000_000, currency: "USD", chain: "ethereum" },
    ],
    allocation: [
      { label: "Equities", pct: 46 }, { label: "Real Assets", pct: 20 },
      { label: "Digital Assets", pct: 10 }, { label: "Cash & Bonds", pct: 24 },
    ],
  },
];

export const DEMO_TAG_PAYLOAD = "RIFT-KEY:DEMO-01";

export const ENROLLED_DEVICES = [
  { id: "dev-demo-01", label: "RIFT Key · Demo Unit 01", payload: DEMO_TAG_PAYLOAD, enrolled: "2026-09-28" },
];

// Deterministic hash-like identifiers (clearly simulated).
export function simHash(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return "0x" + hex(h) + hex(h * 7 + 3) + hex(h * 13 + 5) + hex(h * 29 + 11) + hex(h * 37 + 17) + hex(h * 43 + 23) + hex(h * 53 + 31) + hex(h * 59 + 41);
}

export function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
