import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

// Cinematic opening: darkness → kinetic typography → particle shower of
// banknotes / metallic fragments / financial glyphs → the billionaire question.
// Fully canvas-driven (no WebGL dependency) so the core UI survives failure.

type Phase = "dark" | "title" | "shower" | "question" | "dissolve";

const GLYPHS = ["$", "€", "¥", "£", "₿", "◆", "▲", "%"];

interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  rot: number; vr: number; kind: "note" | "shard" | "glyph"; glyph?: string;
  w: number; h: number; hue: number;
}

export function Intro() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("dark");
  const [typed, setTyped] = useState("");
  const navigate = useNavigate();
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dissolveRef = useRef(false);

  // phase timeline
  useEffect(() => {
    if (reduced) { setPhase("question"); return; }
    const t1 = setTimeout(() => setPhase("title"), 700);
    const t2 = setTimeout(() => setPhase("shower"), 2600);
    const t3 = setTimeout(() => setPhase("question"), 6400);
    // Idle auto-dissolve: if the visitor does nothing, typography dissolves
    // into monochrome particles revealing the dashboard underneath.
    const t4 = setTimeout(() => dissolveRef.current || dissolve(), 20000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // typewriter for the question
  useEffect(() => {
    if (phase !== "question") return;
    const q = "So, you're a billionaire?";
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setTyped(q.slice(0, i));
      if (i >= q.length) clearInterval(iv);
    }, reduced ? 1 : 55);
    return () => clearInterval(iv);
  }, [phase, reduced]);

  // particle engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let particles: P[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const spawn = (n: number) => {
      const W = canvas.width, H = canvas.height;
      for (let i = 0; i < n; i++) {
        const kind = Math.random() < 0.4 ? "note" : Math.random() < 0.5 ? "shard" : "glyph";
        particles.push({
          x: Math.random() * W, y: -80 - Math.random() * H * 0.5, z: 0.3 + Math.random() * 0.7,
          vx: (Math.random() - 0.5) * 1.2, vy: 1 + Math.random() * 3.2, vz: 0,
          rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.08,
          kind, glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          w: 26 + Math.random() * 30, h: 12 + Math.random() * 14,
          hue: 70 + Math.random() * 30,
        });
      }
    };

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.7, 3);
      last = now;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      if (phase === "shower" && !reduced && particles.length < 260) spawn(6);
      if (phase === "question") particles = particles.filter((p) => p.y < H + 100);

      for (const p of particles) {
        p.x += p.vx * dt * p.z; p.y += p.vy * dt * p.z; p.rot += p.vr * dt;
        const s = p.z * dpr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.kind === "note") {
          // stylized banknote
          ctx.fillStyle = `oklch(0.75 0.08 ${p.hue} / ${0.55 * p.z})`;
          ctx.fillRect((-p.w / 2) * s, (-p.h / 2) * s, p.w * s, p.h * s);
          ctx.strokeStyle = `oklch(0.9 0.06 ${p.hue} / ${0.7 * p.z})`;
          ctx.lineWidth = dpr * 0.7;
          ctx.strokeRect((-p.w / 2 + 3) * s, (-p.h / 2 + 3) * s, (p.w - 6) * s, (p.h - 6) * s);
          ctx.beginPath();
          ctx.arc(0, 0, p.h * 0.28 * s, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.kind === "shard") {
          // reflective glass fragment
          const g = ctx.createLinearGradient(-8 * s, -8 * s, 8 * s, 8 * s);
          g.addColorStop(0, `oklch(0.95 0.02 250 / ${0.5 * p.z})`);
          g.addColorStop(1, `oklch(0.6 0.03 250 / ${0.15 * p.z})`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, -9 * s); ctx.lineTo(7 * s, 5 * s); ctx.lineTo(-6 * s, 7 * s);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = `oklch(0.85 0.1 85 / ${0.8 * p.z})`;
          ctx.font = `${Math.round(20 * s)}px var(--font-display), sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(p.glyph!, 0, 0);
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [phase, reduced]);

  const dissolve = () => {
    dissolveRef.current = true;
    setPhase("dissolve");
    setTimeout(() => navigate({ to: "/overview" }), reduced ? 50 : 900);
  };

  const enter = (to: string) => {
    dissolveRef.current = true;
    navigate({ to });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* vignette */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.85) 100%)" }} />

      <div className={`relative flex h-full flex-col items-center justify-center px-6 text-center transition-all duration-700 ${phase === "dissolve" ? "scale-110 opacity-0 blur-sm" : "opacity-100"}`}>
        {(phase === "title" || phase === "shower" || phase === "question") && (
          <>
            <h1 className="font-display text-[clamp(4rem,18vw,14rem)] font-bold leading-none tracking-[0.12em] gold-text animate-float-slow">
              RIFT
            </h1>
            <p className="mt-2 text-[clamp(0.65rem,2vw,1.1rem)] font-medium uppercase tracking-[0.5em] text-white/70">
              Real-Time Interchain Fraud Tracking
            </p>
            <div className="mx-auto mt-6 h-px w-48 shimmer-line" />
            <p className="mt-6 text-[clamp(0.7rem,1.6vw,0.95rem)] uppercase tracking-[0.3em] text-white/45">
              Every transaction leaves a trace.
            </p>
          </>
        )}

        {phase === "question" && (
          <div className="mt-14 flex flex-col items-center">
            <p className="min-h-10 font-display text-[clamp(1.4rem,4vw,2.6rem)] font-medium text-white/90">
              {typed}
              <span className="animate-pulse text-gold">▍</span>
            </p>
            <div className={`mt-10 flex flex-col gap-4 sm:flex-row transition-all duration-700 ${typed.length > 10 ? "opacity-100" : "opacity-0"}`}>
              <button
                onClick={() => enter("/bank")}
                className="rounded-2xl border border-gold/60 bg-gold/10 px-10 py-4 font-display text-sm font-semibold uppercase tracking-[0.25em] text-gold backdrop-blur-md transition-all hover:bg-gold hover:text-black"
              >
                Enter the Vault
              </button>
              <button
                onClick={() => enter("/command-room")}
                className="rounded-2xl border border-white/25 bg-white/5 px-10 py-4 font-display text-sm font-semibold uppercase tracking-[0.25em] text-white/85 backdrop-blur-md transition-all hover:border-white/60 hover:bg-white/10"
              >
                Explore the Threats
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={dissolve}
        className="absolute bottom-6 right-6 rounded-full border border-white/20 px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50 transition-colors hover:border-gold hover:text-gold"
      >
        Skip intro
      </button>
    </div>
  );
}
