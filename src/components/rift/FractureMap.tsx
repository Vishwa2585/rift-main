import React, { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";
import { useRift } from "@/lib/rift/store";
import { fmtMoney } from "@/lib/rift/data";
import { GlassPanel, Mono, StatusPill } from "./ui";
import { cn } from "@/lib/utils";

// 3D cross-chain fracture map: two transaction networks (source / destination),
// correlations as clear links, missing events as broken paths, suspicious nodes distinct.

interface Node {
  id: string;
  label: string;
  chain: "source" | "destination";
  pos: [number, number, number];
  suspicious: boolean;
  txId?: string;
  detail: string;
}

interface Link {
  from: [number, number, number];
  to: [number, number, number];
  broken: boolean;
  label: string;
}

interface SelectionState {
  id: string;
  kind: "node" | "link";
  title: string;
  chain?: "source" | "destination";
  detail: string;
  suspicious?: boolean;
  broken?: boolean;
}

function buildGraph(attackCount: number, flagged: boolean): { nodes: Node[]; links: Link[] } {
  const nodes: Node[] = [];
  const links: Link[] = [];
  const srcY = 1.6, dstY = -1.6;

  const srcDefs = [
    { id: "src-origin", label: "Origin Account", r: 0 },
    { id: "src-bridge", label: "Bridge Lock", r: 1 },
    { id: "src-relayer", label: "Relayer", r: 2 },
  ];
  const dstDefs = [
    { id: "dst-mint", label: "Dest Mint", r: 2 },
    { id: "dst-vault", label: "Dest Vault", r: 1 },
    { id: "dst-beneficiary", label: "Beneficiary", r: 0 },
  ];

  srcDefs.forEach((d, i) => {
    const a = (i / srcDefs.length) * Math.PI * 2 + 0.5;
    nodes.push({
      id: d.id, label: d.label, chain: "source",
      pos: [Math.cos(a) * 2.2, srcY, Math.sin(a) * 2.2],
      suspicious: flagged && d.id === "src-relayer",
      txId: "RFT-TX-ACTIVE",
      detail: `Source-chain event node · ${d.label} (simulated)`,
    });
  });
  dstDefs.forEach((d, i) => {
    const a = (i / dstDefs.length) * Math.PI * 2 - 0.5;
    nodes.push({
      id: d.id, label: d.label, chain: "destination",
      pos: [Math.cos(a) * 2.2, dstY, Math.sin(a) * 2.2],
      suspicious: flagged && d.id === "dst-beneficiary",
      txId: "RFT-TX-ACTIVE",
      detail: `Destination-chain event node · ${d.label} (simulated)`,
    });
  });

  const byId: Record<string, Node> = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const intra: [string, string][] = [["src-origin", "src-bridge"], ["src-bridge", "src-relayer"], ["dst-mint", "dst-vault"], ["dst-vault", "dst-beneficiary"]];
  for (const [a, b] of intra) {
    links.push({ from: byId[a]!.pos, to: byId[b]!.pos, broken: false, label: `${a} → ${b}` });
  }
  // cross-chain correlation
  links.push({
    from: byId["src-relayer"]!.pos, to: byId["dst-mint"]!.pos,
    broken: flagged,
    label: flagged ? "BROKEN CORRELATION — destination event missing (simulated anomaly)" : "Verified correlation (simulated)",
  });
  if (attackCount > 1) {
    links.push({
      from: byId["src-bridge"]!.pos, to: byId["dst-beneficiary"]!.pos,
      broken: true,
      label: "BROKEN PATH — replayed message ID detected (simulated anomaly)",
    });
  }
  return { nodes, links };
}

function NodeMesh({ node, onSelect, isSelected }: { node: Node; onSelect: (n: Node) => void; isSelected: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  useFrame((state: any) => {
    const clock = state.clock;
    if (ref.current) {
      const s = node.suspicious
        ? 1 + Math.sin(clock.elapsedTime * 5) * 0.12
        : isSelected
          ? 1.25 + Math.sin(clock.elapsedTime * 4) * 0.08
          : 1;
      ref.current.scale.setScalar(hover || isSelected ? s * 1.3 : s);
    }
  });
  const color = node.suspicious ? "#e05555" : node.chain === "source" ? "#d4b06a" : "#7fa8c9";
  return (
    <group position={node.pos}>
      <mesh
        ref={ref}
        onClick={(e) => { e.stopPropagation(); onSelect(node); }}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshStandardMaterial
          color={isSelected ? "#ffffff" : color}
          metalness={0.85}
          roughness={0.2}
          emissive={node.suspicious ? "#a02020" : isSelected ? color : color}
          emissiveIntensity={node.suspicious ? 1.0 : isSelected ? 1.2 : 0.25}
        />
      </mesh>
      {/* Visual ring when node is selected */}
      {isSelected && (
        <mesh>
          <ringGeometry args={[0.32, 0.38, 32]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.85} />
        </mesh>
      )}
      <Html distanceFactor={10} className="pointer-events-none">
        <div className={cn(
          "whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] tracking-wide transition-all backdrop-blur-md",
          isSelected
            ? "bg-gold text-black font-bold ring-2 ring-white shadow-lg"
            : "bg-black/85 text-white/90 border border-white/10"
        )}>
          {node.label}
        </div>
      </Html>
    </group>
  );
}

function LinkLine({ link, onSelect, isSelected }: { link: Link; onSelect: (l: Link) => void; isSelected: boolean }) {
  const ref = useRef<any>(null);
  useFrame((state: any) => {
    const clock = state.clock;
    if (ref.current?.material) {
      ref.current.material.opacity = link.broken
        ? 0.5 + Math.sin(clock.elapsedTime * 4) * 0.3
        : isSelected
          ? 1.0
          : 0.85;
    }
  });
  return (
    <Line
      ref={ref}
      points={[link.from, link.to]}
      color={link.broken ? "#e05555" : isSelected ? "#ffffff" : "#d4b06a"}
      lineWidth={link.broken ? 2.5 : isSelected ? 3 : 1.5}
      dashed={link.broken}
      dashSize={0.15}
      gapSize={0.12}
      transparent
      onClick={(e: any) => { e.stopPropagation(); onSelect(link); }}
    />
  );
}

function Scene({
  onSelectNode,
  onSelectLink,
  selectedId,
  oneFingerRotate,
}: {
  onSelectNode: (n: Node) => void;
  onSelectLink: (l: Link) => void;
  selectedId?: string | undefined;
  oneFingerRotate?: boolean | undefined;
}) {
  const { state } = useRift();
  const flagged = state.incidents.some((i) => i.status !== "resolved");
  const { nodes, links } = useMemo(() => buildGraph(state.attackCount, flagged), [state.attackCount, flagged]);
  const group = useRef<THREE.Group>(null);
  useFrame((_state: any, delta: number) => {
    const speed = selectedId ? 0.02 : 0.07;
    if (group.current) group.current.rotation.y += delta * speed;
  });
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 8, 4]} intensity={1.4} />
      <pointLight position={[-5, -3, -4]} intensity={0.6} color="#d4b06a" />
      <group ref={group}>
        {links.map((l, i) => (
          <LinkLine
            key={i}
            link={l}
            onSelect={onSelectLink}
            isSelected={selectedId === l.label}
          />
        ))}
        {nodes.map((n) => (
          <NodeMesh
            key={n.id}
            node={n}
            onSelect={onSelectNode}
            isSelected={selectedId === n.id}
          />
        ))}
        {/* chain ground rings */}
        <mesh position={[0, 1.6, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[2.5, 2.56, 64]} />
          <meshBasicMaterial color="#d4b06a" transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -1.6, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[2.5, 2.56, 64]} />
          <meshBasicMaterial color="#7fa8c9" transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <OrbitControls
        enablePan={false}
        enableRotate={Boolean(oneFingerRotate)}
        minDistance={4}
        maxDistance={12}
      />
    </>
  );
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function FractureMap({ height = 460 }: { height?: number }) {
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [oneFingerRotate, setOneFingerRotate] = useState(false);
  const { state } = useRift();
  const [supported] = useState(() => (typeof window === "undefined" ? false : webglAvailable()));

  if (!supported) {
    // Lightweight fallback when 3D rendering is unavailable.
    return (
      <GlassPanel className="p-6">
        <p className="mb-3 text-sm font-semibold text-foreground">Fracture Map — 2D fallback</p>
        <p className="mb-4 text-xs text-muted-foreground">3D rendering is unavailable on this device, so the network is shown as a list. All data remains live.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {["Origin Account", "Bridge Lock", "Relayer", "Dest Mint", "Dest Vault", "Beneficiary"].map((n) => (
            <div key={n} className="rounded-xl border border-border bg-secondary/40 p-3 text-sm text-foreground">{n}</div>
          ))}
        </div>
      </GlassPanel>
    );
  }

  return (
    <div className="relative max-w-full">
      <div className="overflow-hidden rounded-2xl border border-border bg-black h-[340px] sm:h-[440px] lg:h-[500px]">
        <Canvas
          camera={{ position: [0, 1.2, 7.5], fov: 55 }}
          dpr={[1, 1.5]}
          style={{ touchAction: oneFingerRotate ? "none" : "pan-y" }}
        >
          <color attach="background" args={["#05060a"]} />
          <fog attach="fog" args={["#05060a", 9, 16]} />
          <Suspense fallback={null}>
            <Scene
              selectedId={selection?.id}
              oneFingerRotate={oneFingerRotate}
              onSelectNode={(n) => setSelection({
                id: n.id,
                kind: "node",
                title: n.label,
                chain: n.chain,
                detail: n.detail,
                suspicious: n.suspicious,
              })}
              onSelectLink={(l) => setSelection({
                id: l.label,
                kind: "link",
                title: l.broken ? "Broken Correlation Path" : "Verified Cross-Chain Path",
                detail: l.label,
                broken: l.broken,
              })}
            />
          </Suspense>
        </Canvas>
        <div className="pointer-events-none absolute left-3 top-3 sm:left-4 sm:top-4 flex flex-wrap gap-1.5 sm:gap-2">
          <span className="rounded-full border border-gold/40 bg-black/80 px-2.5 sm:px-3 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.18em] text-gold backdrop-blur">Source Chain</span>
          <span className="rounded-full border border-[#7fa8c9]/40 bg-black/80 px-2.5 sm:px-3 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7fa8c9] backdrop-blur">Destination Chain</span>
        </div>

        {/* Bottom controls: Touch rotate toggle on mobile */}
        <div className="absolute bottom-2.5 inset-x-3 sm:inset-x-4 flex items-center justify-between pointer-events-none">
          <p className="text-[9px] sm:text-[10px] text-white/50 truncate">Tap nodes to inspect</p>
          <button
            onClick={() => setOneFingerRotate(!oneFingerRotate)}
            className="pointer-events-auto rounded-full border border-white/20 bg-black/80 px-2.5 py-0.5 text-[9px] sm:text-[10px] text-white/80 hover:text-white flex items-center gap-1 backdrop-blur transition-colors"
            title="Toggle 1-finger 3D rotation vs page scroll safe mode"
          >
            <span>{oneFingerRotate ? "🔒 1-Finger 3D Active" : "👆 2-Finger 3D (Scroll Safe)"}</span>
          </button>
        </div>
      </div>

      {/* Enhanced Solid High-Contrast Telemetry Inspection Window */}
      {selection && (
        <div className="absolute inset-x-2 bottom-2 sm:inset-auto sm:right-4 sm:top-4 sm:w-84 max-w-sm max-h-[85%] overflow-y-auto rounded-2xl border border-gold/50 bg-[#0d0e17] p-3.5 sm:p-5 z-30 shadow-[0_25px_60px_rgba(0,0,0,0.95)] ring-1 ring-gold/25 animate-in fade-in zoom-in-95 duration-150">
          {/* Header with chain badge and close button */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className={cn(
                "size-2 rounded-full",
                selection.suspicious || selection.broken
                  ? "bg-danger shadow-[0_0_8px_rgba(224,85,85,0.8)]"
                  : selection.chain === "source"
                    ? "bg-gold shadow-[0_0_8px_rgba(212,176,106,0.8)]"
                    : "bg-[#7fa8c9] shadow-[0_0_8px_rgba(127,168,201,0.8)]"
              )} />
              <span className={cn(
                "rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider",
                selection.suspicious || selection.broken
                  ? "bg-danger/20 text-danger border border-danger/40"
                  : selection.chain === "source"
                    ? "bg-gold/20 text-gold border border-gold/40"
                    : "bg-[#7fa8c9]/20 text-[#7fa8c9] border border-[#7fa8c9]/40"
              )}>
                {selection.kind === "node"
                  ? (selection.chain === "source" ? "ETH Source Chain" : "ARB Destination Chain")
                  : "Cross-Chain Relayer Link"}
              </span>
            </div>
            <button
              onClick={() => setSelection(null)}
              className="flex size-7 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
              title="Close inspection"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Node / Link Title */}
          <div className="mt-3">
            <h4 className="font-display text-lg font-bold text-white tracking-wide">
              {selection.title}
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-zinc-300 font-medium">
              {selection.detail}
            </p>
          </div>

          {/* Real-time Telemetry Verdict */}
          <div className="mt-3.5">
            {selection.suspicious || selection.broken ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-danger/40 bg-danger/15 p-2.5 text-xs text-danger">
                <AlertTriangle className="size-4 shrink-0 mt-0.5 text-danger" />
                <div>
                  <span className="font-bold block">Security Anomaly Flagged</span>
                  <span className="text-[11px] text-danger/90">Divergent invariant observed on cross-chain telemetry.</span>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Verified Invariant</span>
                  <span className="text-[11px] text-emerald-400/90">Signatures and transfer states are healthy.</span>
                </div>
              </div>
            )}
          </div>

          {/* Associated Ledger Transaction */}
          {state.transfers[0] && (
            <div className="mt-3.5 pt-3 border-t border-white/10 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">ACTIVE LEDGER TX</span>
                <Mono className="text-gold font-bold text-xs">{state.transfers[0].id}</Mono>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Execution Status:</span>
                <StatusPill status={state.transfers[0].status} />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Volume / Asset:</span>
                <span className="font-bold text-white">{fmtMoney(state.transfers[0].amount)} {state.transfers[0].asset}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
