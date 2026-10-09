import React, { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { useRift } from "@/lib/rift/store";
import { GlassPanel, Mono, StatusPill } from "./ui";

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

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const intra: [string, string][] = [["src-origin", "src-bridge"], ["src-bridge", "src-relayer"], ["dst-mint", "dst-vault"], ["dst-vault", "dst-beneficiary"]];
  for (const [a, b] of intra) {
    links.push({ from: byId[a].pos, to: byId[b].pos, broken: false, label: `${a} → ${b}` });
  }
  // cross-chain correlation
  links.push({
    from: byId["src-relayer"].pos, to: byId["dst-mint"].pos,
    broken: flagged,
    label: flagged ? "BROKEN CORRELATION — destination event missing (simulated anomaly)" : "Verified correlation (simulated)",
  });
  if (attackCount > 1) {
    links.push({
      from: byId["src-bridge"].pos, to: byId["dst-beneficiary"].pos,
      broken: true,
      label: "BROKEN PATH — replayed message ID detected (simulated anomaly)",
    });
  }
  return { nodes, links };
}

function NodeMesh({ node, onSelect }: { node: Node; onSelect: (n: Node) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = node.suspicious ? 1 + Math.sin(clock.elapsedTime * 5) * 0.12 : 1;
      ref.current.scale.setScalar(hover ? s * 1.25 : s);
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
          color={color} metalness={0.85} roughness={0.2}
          emissive={node.suspicious ? "#a02020" : color} emissiveIntensity={node.suspicious ? 0.9 : 0.25}
        />
      </mesh>
      <Html distanceFactor={10} className="pointer-events-none">
        <div className="whitespace-nowrap rounded-md bg-black/60 px-2 py-0.5 text-[10px] tracking-wide text-white/85 backdrop-blur-sm">
          {node.label}
        </div>
      </Html>
    </group>
  );
}

function LinkLine({ link, onSelect }: { link: Link; onSelect: (l: Link) => void }) {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => {
    if (ref.current?.material) {
      ref.current.material.opacity = link.broken ? 0.45 + Math.sin(clock.elapsedTime * 4) * 0.3 : 0.85;
    }
  });
  return (
    <Line
      ref={ref}
      points={[link.from, link.to]}
      color={link.broken ? "#e05555" : "#d4b06a"}
      lineWidth={link.broken ? 2.5 : 1.5}
      dashed={link.broken}
      dashSize={0.15}
      gapSize={0.12}
      transparent
      onClick={(e: any) => { e.stopPropagation(); onSelect(link); }}
    />
  );
}

function Scene({ onSelectNode, onSelectLink }: { onSelectNode: (n: Node) => void; onSelectLink: (l: Link) => void }) {
  const { state } = useRift();
  const flagged = state.incidents.some((i) => i.status !== "resolved");
  const { nodes, links } = useMemo(() => buildGraph(state.attackCount, flagged), [state.attackCount, flagged]);
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.08;
  });
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[6, 8, 4]} intensity={1.4} />
      <pointLight position={[-5, -3, -4]} intensity={0.6} color="#d4b06a" />
      <group ref={group}>
        {links.map((l, i) => <LinkLine key={i} link={l} onSelect={onSelectLink} />)}
        {nodes.map((n) => <NodeMesh key={n.id} node={n} onSelect={onSelectNode} />)}
        {/* chain ground rings */}
        <mesh position={[0, 1.6, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[2.5, 2.56, 64]} />
          <meshBasicMaterial color="#d4b06a" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -1.6, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[2.5, 2.56, 64]} />
          <meshBasicMaterial color="#7fa8c9" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <OrbitControls enablePan={false} minDistance={4} maxDistance={12} />
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
  const [selection, setSelection] = useState<{ kind: "node" | "link"; title: string; body: string } | null>(null);
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
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-border bg-black" style={{ height }}>
        <Canvas camera={{ position: [0, 1.2, 7.5], fov: 55 }} dpr={[1, 1.75]}>
          <color attach="background" args={["#05060a"]} />
          <fog attach="fog" args={["#05060a", 9, 16]} />
          <Suspense fallback={null}>
            <Scene
              onSelectNode={(n) => setSelection({ kind: "node", title: n.label, body: `${n.detail}\nChain: ${n.chain === "source" ? "SOURCE CHAIN" : "DESTINATION CHAIN"}${n.suspicious ? "\nStatus: SUSPICIOUS (simulated detection)" : ""}` })}
              onSelectLink={(l) => setSelection({ kind: "link", title: l.broken ? "Broken Path" : "Correlation", body: l.label })}
            />
          </Suspense>
        </Canvas>
        <div className="pointer-events-none absolute left-4 top-4 flex gap-2">
          <span className="rounded-full border border-gold/40 bg-black/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold backdrop-blur">Source Chain</span>
          <span className="rounded-full border border-[#7fa8c9]/40 bg-black/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7fa8c9] backdrop-blur">Destination Chain</span>
        </div>
        <p className="pointer-events-none absolute bottom-3 left-4 text-[10px] text-white/40">Drag to rotate · scroll to zoom · click nodes and paths to inspect</p>
      </div>

      {selection && (
        <GlassPanel deep className="absolute right-4 top-4 w-72 p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-display text-sm font-semibold text-foreground">{selection.title}</p>
            <button onClick={() => setSelection(null)} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{selection.body}</p>
          {selection.kind === "node" && state.transfers[0] && (
            <div className="mt-3 border-t border-border pt-3">
              <Mono className="text-muted-foreground">Latest tx: {state.transfers[0].id}</Mono>
              <div className="mt-1"><StatusPill status={state.transfers[0].status} /></div>
            </div>
          )}
        </GlassPanel>
      )}
    </div>
  );
}
