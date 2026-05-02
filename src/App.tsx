/**
 * Distância de Edição Visual
 * Daniel Dionísio — UFRPE — Biologia Computacional
 */

import { useState, useRef, useEffect } from "react";
import {
  motion, AnimatePresence,
  useSpring, useMotionValue, animate,
} from "framer-motion";

// ─── API ───────────────────────────────────────────────────────────────────────
const BASE = "https://biocomp-back.onrender.com/distancia-edicao";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Operacao {
  tipo: "INSERT" | "DELETE" | "REPLACE";
  posicao: number;
  valor?: string;
}
interface ResultadoResponse  { distancia: number; operacoes: Operacao[] }
interface PassoAnimacao      { antes: string; operacao: string; depois: string }
interface MatrizResponse     { distancia: number; matriz: number[][] }

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        "#06060e",
  surface:   "#0e0e1a",
  surfaceHi: "#141428",
  border:    "rgba(255,255,255,0.07)",
  borderHi:  "rgba(255,255,255,0.14)",
  text:      "#e8e8f0",
  muted:     "rgba(232,232,240,0.35)",
  dim:       "rgba(232,232,240,0.18)",

  indigo:    "#818cf8",
  indigoFg:  "#c7d2fe",
  indigoBg:  "rgba(99,102,241,0.12)",
  indigoBd:  "rgba(99,102,241,0.3)",
  indigoGl:  "rgba(99,102,241,0.18)",

  emerald:   "#34d399",
  emeraldFg: "#a7f3d0",
  emeraldBg: "rgba(52,211,153,0.09)",
  emeraldBd: "rgba(52,211,153,0.28)",

  rose:      "#fb7185",
  roseFg:    "#fecdd3",
  roseBg:    "rgba(251,113,133,0.09)",
  roseBd:    "rgba(251,113,133,0.28)",

  amber:     "#fbbf24",
  amberFg:   "#fde68a",
  amberBg:   "rgba(251,191,36,0.08)",
  amberBd:   "rgba(251,191,36,0.25)",

  sky:       "#38bdf8",
  skyFg:     "#bae6fd",
  skyBg:     "rgba(56,189,248,0.08)",
  skyBd:     "rgba(56,189,248,0.25)",
} as const;

const OP = {
  INSERT:  { bg: C.emeraldBg, text: C.emeraldFg, border: C.emeraldBd, dot: C.emerald, glow: "rgba(52,211,153,0.22)"  },
  DELETE:  { bg: C.roseBg,    text: C.roseFg,    border: C.roseBd,    dot: C.rose,    glow: "rgba(251,113,133,0.22)" },
  REPLACE: { bg: C.indigoBg,  text: C.indigoFg,  border: C.indigoBd,  dot: C.indigo,  glow: C.indigoGl              },
  MATCH:   { bg: C.amberBg,   text: C.amberFg,   border: C.amberBd,   dot: C.amber,   glow: "rgba(251,191,36,0.18)" },
  GAP:     { bg: C.skyBg,     text: C.skyFg,     border: C.skyBd,     dot: C.sky,     glow: "rgba(56,189,248,0.18)" },
} as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────
function pill(
  label: string,
  colors: { bg: string; text: string; border: string },
  extra?: React.CSSProperties,
) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: colors.bg, color: colors.text,
      border: `1px solid ${colors.border}`,
      borderRadius: 6, padding: "2px 10px",
      fontSize: 10, fontWeight: 700,
      fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: "0.1em", whiteSpace: "nowrap",
      ...extra,
    }}>{label}</span>
  );
}

// ─── Animated counter ──────────────────────────────────────────────────────────
function Num({ value, color }: { value: number; color: string }) {
  const mv = useMotionValue(0);
  const sp = useSpring(mv, { stiffness: 90, damping: 20 });
  const [d, setD] = useState(0);
  useEffect(() => {
    mv.set(0); sp.set(0);
    animate(mv, value, { duration: 1.0, ease: "easeOut" });
    return sp.on("change", (v) => setD(Math.round(v)));
  }, [value]);
  return (
    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color, lineHeight: 1 }}>
      {d}
    </span>
  );
}

// ─── Shared button ─────────────────────────────────────────────────────────────
function Btn({
  children, onClick, style, disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: C.surfaceHi,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "7px 14px",
        color: C.muted,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        transition: "all 0.18s",
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─── Section card ──────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ANIMAÇÃO TAB
// Corrigido: marca exatamente o caractere inserido/removido/substituído
// step -1 = estado inicial; step 0…N-1 = depois de aplicar passo[step]
// ──────────────────────────────────────────────────────────────────────────────
function diffIndices(antes: string, depois: string, op: string): Set<number> {
  const changed = new Set<number>();
  if (op === "INSERT") {
    // Encontra a posição onde depois tem um char a mais
    let i = 0;
    while (i < antes.length && antes[i] === depois[i]) i++;
    changed.add(i); // exatamente 1 char inserido
  } else if (op === "DELETE") {
    // Encontra a posição onde antes tem um char a mais
    let i = 0;
    while (i < depois.length && antes[i] === depois[i]) i++;
    changed.add(i); // posição no "antes" que foi deletada
  } else if (op === "REPLACE") {
    for (let i = 0; i < Math.max(antes.length, depois.length); i++) {
      if (antes[i] !== depois[i]) changed.add(i);
    }
  }
  return changed;
}

function StepString({
  str, highlight, colors, isAntes, size = 20,
}: {
  str: string;
  highlight: Set<number>;
  colors: (typeof OP)[keyof typeof OP];
  isAntes: boolean;
  size?: number;
}) {
  return (
    <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.16em", lineHeight: 1 }}>
      {str.split("").map((ch, i) => {
        const hi = highlight.has(i);
        return (
          <motion.span
            key={`${i}-${ch}`}
            initial={hi ? { scale: 1.5, opacity: 0 } : { scale: 1, opacity: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.38, ease: "backOut", delay: hi ? 0.05 : 0 }}
            style={{
              display: "inline-block",
              fontSize: size,
              fontWeight: hi ? 800 : 400,
              color: hi ? colors.text : C.text,
              textShadow: hi ? `0 0 16px ${colors.glow}` : "none",
              borderBottom: hi
                ? `2px solid ${colors.dot}`
                : isAntes && highlight.size > 0
                  ? "2px solid transparent"
                  : "2px solid transparent",
              paddingBottom: 2,
              transition: "color 0.2s",
              textDecoration: isAntes && hi && highlight.size > 0 ? "line-through" : "none",
              textDecorationColor: colors.dot,
            }}
          >
            {ch}
          </motion.span>
        );
      })}
    </span>
  );
}

function AnimacaoTab({
  passos, textoOrigem, textoDestino,
}: {
  passos: PassoAnimacao[];
  textoOrigem: string;
  textoDestino: string;
}) {
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const N = passos.length;

  useEffect(() => { setStep(-1); setPlaying(false); }, [passos]);

  useEffect(() => {
    if (!playing) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setStep((s) => {
        if (s >= N - 1) { setPlaying(false); return s; }
        return s + 1;
      });
    }, 1200);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, N]);

  const passo = step >= 0 ? passos[step] : null;
  const cols  = passo ? (OP[passo.operacao as keyof typeof OP] ?? OP.REPLACE) : null;
  const progress = step === -1 ? 0 : ((step + 1) / N) * 100;

  // Diff indices — only used for DEPOIS string
  const diffIdx = passo
    ? diffIndices(passo.antes, passo.depois, passo.operacao)
    : new Set<number>();

  // For ANTES: highlight the char(s) that WILL be changed
  const diffIdxAntes = passo
    ? diffIndices(passo.antes, passo.depois, passo.operacao)
    : new Set<number>();

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Goal strip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "10px 14px", background: C.surfaceHi,
        borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 18,
      }}>
        <span style={{ fontSize: 9, color: C.dim, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.15em" }}>ORIGEM</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: C.amberFg, letterSpacing: "0.14em", wordBreak: "break-all" }}>{textoOrigem}</span>
        <span style={{ color: C.dim, fontSize: 14, flexShrink: 0 }}>→</span>
        <span style={{ fontSize: 9, color: C.dim, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.15em" }}>DESTINO</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: C.emeraldFg, letterSpacing: "0.14em", wordBreak: "break-all" }}>{textoDestino}</span>
      </div>

      {/* Progress */}
      <div style={{ height: 2, background: C.surfaceHi, borderRadius: 1, marginBottom: 16, overflow: "hidden" }}>
        <motion.div
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
          style={{ height: "100%", background: cols ? cols.dot : C.indigo, borderRadius: 1 }}
        />
      </div>

      {/* Timeline pills */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
        <button
          onClick={() => { setStep(-1); setPlaying(false); }}
          style={{
            width: 28, height: 28, borderRadius: 6,
            border: `1px solid ${step === -1 ? C.borderHi : C.border}`,
            background: step === -1 ? C.surfaceHi : "transparent",
            cursor: "pointer", fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
            color: step === -1 ? C.text : C.dim, transition: "all 0.15s",
          }}
        >0</button>
        {passos.map((p, i) => {
          const c = OP[p.operacao as keyof typeof OP] ?? OP.REPLACE;
          const active = step === i, done = step > i;
          return (
            <button key={i} onClick={() => { setStep(i); setPlaying(false); }} title={`${p.operacao}: ${p.antes} → ${p.depois}`}
              style={{
                width: 28, height: 28, borderRadius: 6,
                border: `1px solid ${active ? c.border : done ? C.border : "rgba(255,255,255,0.05)"}`,
                background: active ? c.bg : "transparent",
                cursor: "pointer", fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                color: active ? c.text : done ? C.muted : C.dim,
                transition: "all 0.15s",
              }}
            >{i + 1}</button>
          );
        })}
      </div>

      {/* Stage */}
      <AnimatePresence mode="wait">
        <motion.div key={step}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}
          style={{
            background: cols ? cols.bg : C.surfaceHi,
            border: `1px solid ${cols ? cols.border : C.border}`,
            borderRadius: 14, padding: "24px 20px", marginBottom: 18,
            boxShadow: cols ? `0 0 40px ${cols.glow}` : "none",
            overflow: "hidden",
          }}
        >
          {step === -1 ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.2em", color: C.dim, marginBottom: 14, fontFamily: "'JetBrains Mono', monospace" }}>ESTADO INICIAL</div>
              <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, color: C.text, letterSpacing: "0.14em", whiteSpace: "nowrap" }}>
                  {textoOrigem}
                </span>
              </div>
              <div style={{ marginTop: 14, fontSize: 11, color: C.dim }}>Pressione ▶ para iniciar a transformação</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                {pill(passo!.operacao, cols!)}
                <span style={{ fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono', monospace" }}>
                  passo {step + 1} / {N}
                </span>
              </div>

              {/* ANTES */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.2em", color: C.dim, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>ANTES</div>
                <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                  <StepString
                    str={passo!.antes}
                    highlight={passo!.operacao === "DELETE" ? diffIdxAntes : new Set()}
                    colors={cols!}
                    isAntes={true}
                    size={18}
                  />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
                <div style={{ flex: 1, height: 1, background: cols!.border }} />
                <span style={{ fontSize: 14, color: cols!.text }}>↓ {passo!.operacao}</span>
                <div style={{ flex: 1, height: 1, background: cols!.border }} />
              </div>

              {/* DEPOIS */}
              <div>
                <div style={{ fontSize: 9, letterSpacing: "0.2em", color: C.dim, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>DEPOIS</div>
                <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                  <StepString
                    str={passo!.depois}
                    highlight={passo!.operacao === "DELETE" ? new Set() : diffIdx}
                    colors={cols!}
                    isAntes={false}
                    size={18}
                  />
                </div>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Controls */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Btn onClick={() => { setStep(-1); setPlaying(false); }}>⟪</Btn>
        <Btn onClick={() => { setStep((s) => Math.max(-1, s - 1)); setPlaying(false); }}>‹ Anterior</Btn>
        <Btn
          onClick={() => {
            if (step >= N - 1) { setStep(-1); setTimeout(() => setPlaying(true), 60); }
            else setPlaying((p) => !p);
          }}
          style={{
            minWidth: 100, fontWeight: 600,
            background: playing ? C.indigoBg : C.surfaceHi,
            borderColor: playing ? C.indigoBd : C.border,
            color: playing ? C.indigoFg : C.text,
          }}
        >
          {playing ? "⏸ Pausar" : step >= N - 1 ? "↺ Repetir" : "▶ Play"}
        </Btn>
        <Btn onClick={() => { setStep((s) => Math.min(N - 1, s + 1)); setPlaying(false); }}>Próximo ›</Btn>
        <Btn onClick={() => { setStep(N - 1); setPlaying(false); }}>⟫</Btn>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.dim, fontFamily: "'JetBrains Mono', monospace" }}>
          {step === -1 ? "início" : `${step + 1}/${N}`}
        </span>
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MATRIZ TAB
// Constrói [0,0]→[n-1][m-1], depois revela traceback
// Células rolam horizontalmente sem quebrar layout
// ──────────────────────────────────────────────────────────────────────────────
function buildPath(matriz: number[][]): Set<string> {
  const path = new Set<string>();
  const n = matriz.length, m = matriz[0].length;
  let i = n - 1, j = m - 1;
  while (i > 0 || j > 0) {
    path.add(`${i},${j}`);
    if (i === 0) { j--; continue; }
    if (j === 0) { i--; continue; }
    const d = matriz[i-1][j-1], u = matriz[i-1][j], l = matriz[i][j-1];
    const mv = Math.min(d, u, l);
    if (mv === d) { i--; j--; } else if (mv === u) i--; else j--;
  }
  path.add("0,0");
  return path;
}

function MatrizTab({ texto1, texto2, data }: {
  texto1: string; texto2: string; data: MatrizResponse;
}) {
  const { matriz, distancia } = data;
  const n = matriz.length, m = matriz[0]?.length ?? 0;
  const mx = Math.max(...matriz.flat(), 1);
  const total = n * m;
  const path = buildPath(matriz);

  const [revealed, setRevealed] = useState(total);
  const [showPath, setShowPath] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    if (revealed >= total) { setTimeout(() => setShowPath(true), 400); setRunning(false); return; }
    const delay = Math.max(6, Math.min(40, 500 / total));
    const t = setTimeout(() => setRevealed((r) => r + 1), delay);
    return () => clearTimeout(t);
  }, [running, revealed, total]);

  function restart() { setRevealed(0); setShowPath(false); setRunning(true); }

  // Cell size: clamp between 24 and 40px, shrink for large matrices
  const cs = Math.max(24, Math.min(40, Math.floor(520 / Math.max(n, m))));
  const lT1 = ["", ...texto1.split("")];
  const lT2 = ["", ...texto2.split("")];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ background: C.indigoBg, border: `1px solid ${C.indigoBd}`, borderRadius: 8, padding: "5px 14px", fontSize: 13, color: C.indigoFg, fontFamily: "'JetBrains Mono', monospace" }}>
          Distância: <strong>{distancia}</strong>
        </div>
        <Btn
          onClick={restart}
          style={{ background: C.indigoBg, borderColor: C.indigoBd, color: C.indigoFg }}
        >▶ Animar construção</Btn>
        {running && (
          <span style={{ fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono', monospace" }}>
            {Math.round((revealed / total) * 100)}%
          </span>
        )}
        {showPath && !running && (
          <span style={{ fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono', monospace" }}>
            caminho ótimo destacado
          </span>
        )}
      </div>

      {running && (
        <div style={{ height: 2, background: C.surfaceHi, borderRadius: 1, marginBottom: 14, overflow: "hidden" }}>
          <motion.div style={{ height: "100%", background: C.indigo, width: `${(revealed / total) * 100}%` }} />
        </div>
      )}

      <div style={{ overflowX: "auto", overflowY: "visible" }}>
        <div style={{
          display: "inline-grid",
          gridTemplateColumns: `${cs}px repeat(${m}, ${cs}px)`,
          gap: 2,
          minWidth: (m + 1) * (cs + 2),
        }}>
          {/* Header */}
          <div style={{ display: "contents" }}>
            <div />
            {lT2.map((ch, j) => (
              <div key={j} style={{
                height: cs, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: Math.max(9, cs * 0.36), fontFamily: "'JetBrains Mono', monospace",
                color: C.muted, fontWeight: 600,
              }}>{ch || "ε"}</div>
            ))}
          </div>
          {/* Rows */}
          {matriz.map((row, i) => (
            <div key={i} style={{ display: "contents" }}>
              <div style={{
                height: cs, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: Math.max(9, cs * 0.36), fontFamily: "'JetBrains Mono', monospace",
                color: C.muted, fontWeight: 600,
              }}>{lT1[i] || "ε"}</div>
              {row.map((val, j) => {
                const vis = revealed > i * m + j;
                const inPath = showPath && path.has(`${i},${j}`);
                const intensity = val / mx;
                return (
                  <motion.div
                    key={j}
                    animate={{
                      opacity: vis ? 1 : 0,
                      scale: vis ? 1 : 0.2,
                      background: inPath
                        ? `rgba(99,102,241,${0.18 + intensity * 0.48})`
                        : `rgba(255,255,255,${0.02 + intensity * 0.08})`,
                    }}
                    transition={{
                      opacity: { duration: 0.15 },
                      scale: { duration: 0.2, ease: "backOut" },
                      background: { duration: 0.5 },
                    }}
                    title={`dp[${i}][${j}] = ${val}`}
                    style={{
                      border: `1px solid ${inPath ? "rgba(99,102,241,0.55)" : C.border}`,
                      borderRadius: 4,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: Math.max(8, cs * 0.32),
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: inPath ? 700 : 400,
                      color: inPath ? C.indigoFg : `rgba(232,232,240,${0.25 + intensity * 0.65})`,
                      aspectRatio: "1", minWidth: 0, position: "relative",
                    }}
                  >
                    {vis ? val : ""}
                    {inPath && <span style={{ position: "absolute", inset: 0, borderRadius: 4, boxShadow: "0 0 8px rgba(99,102,241,0.5)", pointerEvents: "none" }} />}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.dim }}>
          <div style={{ width: 14, height: 14, background: "rgba(99,102,241,0.35)", border: "1px solid rgba(99,102,241,0.6)", borderRadius: 3 }} />
          Caminho ótimo (traceback)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.dim }}>
          <div style={{ width: 14, height: 14, background: "rgba(255,255,255,0.08)", border: `1px solid ${C.border}`, borderRadius: 3 }} />
          Células preenchidas
        </div>
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ALINHAMENTO GLOBAL — Needleman-Wunsch (frontend)
// ──────────────────────────────────────────────────────────────────────────────
function nwAlign(s1: string, s2: string, matchSc: number, mismatchSc: number, gapSc: number) {
  const n = s1.length + 1, m = s2.length + 1;
  const dp: number[][] = Array.from({ length: n }, () => Array(m).fill(0));
  for (let i = 0; i < n; i++) dp[i][0] = i * gapSc;
  for (let j = 0; j < m; j++) dp[0][j] = j * gapSc;
  for (let i = 1; i < n; i++)
    for (let j = 1; j < m; j++) {
      const sc = s1[i-1] === s2[j-1] ? matchSc : mismatchSc;
      dp[i][j] = Math.max(dp[i-1][j-1] + sc, dp[i-1][j] + gapSc, dp[i][j-1] + gapSc);
    }
  const a1: string[] = [], a2: string[] = [], ops: string[] = [];
  let i = n - 1, j = m - 1;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const sc = s1[i-1] === s2[j-1] ? matchSc : mismatchSc;
      if (dp[i][j] === dp[i-1][j-1] + sc) {
        a1.unshift(s1[i-1]); a2.unshift(s2[j-1]);
        ops.unshift(s1[i-1] === s2[j-1] ? "MATCH" : "REPLACE");
        i--; j--; continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i-1][j] + gapSc) {
      a1.unshift(s1[i-1]); a2.unshift("-"); ops.unshift("DELETE"); i--;
    } else {
      a1.unshift("-"); a2.unshift(s2[j-1]); ops.unshift("INSERT"); j--;
    }
  }
  return { dp, a1, a2, ops, score: dp[n-1][m-1] };
}

function AlinhamentoTab({ texto1, texto2 }: { texto1: string; texto2: string }) {
  const [matchSc, setMatch]    = useState(1);
  const [mmSc, setMismatch]    = useState(-1);
  const [gapSc, setGap]        = useState(-2);

  const { dp, a1, a2, ops, score } = nwAlign(texto1, texto2, matchSc, mmSc, gapSc);
  const matches    = ops.filter((o) => o === "MATCH").length;
  const mismatches = ops.filter((o) => o === "REPLACE").length;
  const gaps       = ops.filter((o) => o === "INSERT" || o === "DELETE").length;
  const identity   = ops.length > 0 ? Math.round((matches / ops.length) * 100) : 0;

  const n = dp.length, m = dp[0]?.length ?? 0;
  const maxAbs = Math.max(...dp.flat().map(Math.abs), 1);
  const cs = Math.max(22, Math.min(34, Math.floor(480 / Math.max(n, m))));
  const lT1 = ["", ...texto1.split("")];
  const lT2 = ["", ...texto2.split("")];

  // Traceback NW
  const pathNW = new Set<string>();
  {
    let pi = n - 1, pj = m - 1;
    while (pi > 0 || pj > 0) {
      pathNW.add(`${pi},${pj}`);
      if (pi > 0 && pj > 0) {
        const sc = texto1[pi-1] === texto2[pj-1] ? matchSc : mmSc;
        if (dp[pi][pj] === dp[pi-1][pj-1] + sc) { pi--; pj--; continue; }
      }
      if (pi > 0 && dp[pi][pj] === dp[pi-1][pj] + gapSc) pi--;
      else pj--;
    }
    pathNW.add("0,0");
  }

  // Alignment view: chunk into rows of 60
  const CHUNK = 60;
  const chunks: { a1: string[]; a2: string[]; ops: string[]; start: number }[] = [];
  for (let s = 0; s < a1.length; s += CHUNK) {
    chunks.push({ a1: a1.slice(s, s + CHUNK), a2: a2.slice(s, s + CHUNK), ops: ops.slice(s, s + CHUNK), start: s });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>

      {/* Teoria */}
      <Card style={{ padding: "18px 18px", marginBottom: 22, background: C.amberBg, borderColor: C.amberBd }}>
        <div style={{ fontSize: 10, color: C.amberFg, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 14, fontFamily: "'JetBrains Mono', monospace" }}>
          PARALELO: DISTÂNCIA DE EDIÇÃO × ALINHAMENTO GLOBAL
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {[
            {
              titulo: "Levenshtein", sub: "Distância de Edição",
              items: [
                ["Objetivo", "Minimizar custo de transformação"],
                ["Operações", "Insert, Delete, Replace (custo = 1)"],
                ["Saída", "Inteiro — quantidade de edições"],
                ["Uso", "Correção ortográfica, diff, DNA"],
              ],
              color: C.indigoFg,
            },
            {
              titulo: "Needleman-Wunsch", sub: "Alinhamento Global",
              items: [
                ["Objetivo", "Maximizar score de similaridade"],
                ["Operações", "Match, Mismatch, Gap (pesos ajustáveis)"],
                ["Saída", "Score + alinhamento explícito"],
                ["Uso", "Bioinformática — DNA, proteínas"],
              ],
              color: C.emeraldFg,
            },
          ].map(({ titulo, sub, items, color }) => (
            <div key={titulo}>
              <div style={{ color, fontWeight: 700, fontSize: 12, marginBottom: 2, fontFamily: "'Barlow Condensed', sans-serif" }}>{titulo}</div>
              <div style={{ color: C.dim, fontSize: 10, marginBottom: 10 }}>{sub}</div>
              {items.map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 8, marginBottom: 5, fontSize: 11 }}>
                  <span style={{ color: C.dim, minWidth: 70, flexShrink: 0 }}>{k}:</span>
                  <span style={{ color: C.muted, lineHeight: 1.4 }}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.amberBd}`, fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
          Ambos usam <strong style={{ color: C.amberFg }}>Programação Dinâmica O(n·m)</strong> com a mesma estrutura de tabela.{" "}
          Levenshtein: <code style={{ color: C.roseFg }}>dp[i][j] = min(d+custo, u+1, l+1)</code>.{" "}
          N-W: <code style={{ color: C.emeraldFg }}>dp[i][j] = max(d+score, u+gap, l+gap)</code>.
        </div>
      </Card>

      {/* Parâmetros */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "MATCH",    val: matchSc, set: setMatch,    min: 0,  max: 5, color: C.emeraldFg },
          { label: "MISMATCH", val: mmSc,    set: setMismatch, min: -5, max: 0, color: C.roseFg    },
          { label: "GAP",      val: gapSc,   set: setGap,      min: -5, max: 0, color: C.skyFg     },
        ].map(({ label, val, set, min, max, color }) => (
          <Card key={label} style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.16em", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="range" min={min} max={max} step={1} value={val}
                onChange={(e) => set(Number(e.target.value))}
                style={{ flex: 1, accentColor: C.indigo }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 800, color, minWidth: 30, textAlign: "right" }}>
                {val > 0 ? `+${val}` : val}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 22 }}>
        {[
          { l: "SCORE",      v: score,    c: score >= 0 ? C.emeraldFg : C.roseFg },
          { l: "MATCHES",    v: matches,    c: C.amberFg  },
          { l: "MISMATCHES", v: mismatches, c: C.roseFg   },
          { l: "GAPS",       v: gaps,       c: C.skyFg    },
          { l: "IDENTIDADE", v: `${identity}%`, c: C.indigoFg },
        ].map(({ l, v, c }) => (
          <Card key={l} style={{ padding: "11px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.14em", marginBottom: 5, fontFamily: "'JetBrains Mono', monospace" }}>{l}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c, fontFamily: "'Barlow Condensed', sans-serif" }}>{v}</div>
          </Card>
        ))}
      </div>

      {/* Alignment view — chunked rows */}
      <Card style={{ padding: "16px", marginBottom: 22 }}>
        <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.18em", marginBottom: 14, fontFamily: "'JetBrains Mono', monospace" }}>ALINHAMENTO VISUAL (linhas de 60 colunas)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {chunks.map(({ a1: ca1, a2: ca2, ops: cops, start }) => (
            <div key={start}>
              <div style={{ fontSize: 9, color: C.dim, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
                pos {start + 1}–{start + ca1.length}
              </div>
              {/* Seq 1 */}
              <div style={{ display: "flex", gap: 1, overflowX: "auto", paddingBottom: 2 }}>
                {ca1.map((ch, i) => {
                  const op = cops[i];
                  const c = OP[op as keyof typeof OP] ?? OP.REPLACE;
                  return (
                    <div key={i} style={{
                      minWidth: 16, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: ch === "-" ? OP.DELETE.text : op === "MATCH" ? C.muted : c.text,
                      background: op !== "MATCH" ? c.bg : "transparent",
                      borderRadius: 3,
                    }}>{ch}</div>
                  );
                })}
              </div>
              {/* Connector */}
              <div style={{ display: "flex", gap: 1, overflowX: "auto" }}>
                {cops.map((op, i) => (
                  <div key={i} style={{
                    minWidth: 16, height: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, color: op === "MATCH" ? C.amberFg : op === "REPLACE" ? C.roseFg : C.dim,
                  }}>
                    {op === "MATCH" ? "|" : op === "REPLACE" ? "✗" : " "}
                  </div>
                ))}
              </div>
              {/* Seq 2 */}
              <div style={{ display: "flex", gap: 1, overflowX: "auto", paddingTop: 2 }}>
                {ca2.map((ch, i) => {
                  const op = cops[i];
                  const c = OP[op as keyof typeof OP] ?? OP.REPLACE;
                  return (
                    <div key={i} style={{
                      minWidth: 16, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: ch === "-" ? OP.INSERT.text : op === "MATCH" ? C.muted : c.text,
                      background: op !== "MATCH" ? c.bg : "transparent",
                      borderRadius: 3,
                    }}>{ch}</div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Matriz NW */}
      <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.18em", marginBottom: 10, fontFamily: "'JetBrains Mono', monospace" }}>MATRIZ NEEDLEMAN-WUNSCH</div>
      <div style={{ overflowX: "auto" }}>
        <div style={{
          display: "inline-grid",
          gridTemplateColumns: `${cs}px repeat(${m}, ${cs}px)`,
          gap: 2, minWidth: (m + 1) * (cs + 2),
        }}>
          <div style={{ display: "contents" }}>
            <div />
            {lT2.map((ch, j) => (
              <div key={j} style={{ height: cs, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(8, cs * 0.34), fontFamily: "'JetBrains Mono', monospace", color: C.muted, fontWeight: 600 }}>{ch || "ε"}</div>
            ))}
          </div>
          {dp.map((row, i) => (
            <div key={i} style={{ display: "contents" }}>
              <div style={{ height: cs, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(8, cs * 0.34), fontFamily: "'JetBrains Mono', monospace", color: C.muted, fontWeight: 600 }}>{lT1[i] || "ε"}</div>
              {row.map((val, j) => {
                const inPath = pathNW.has(`${i},${j}`);
                const pos = val >= 0;
                const intensity = Math.abs(val) / maxAbs;
                return (
                  <motion.div key={j}
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (i + j) * 0.01, duration: 0.2, ease: "backOut" }}
                    style={{
                      background: inPath
                        ? `rgba(99,102,241,${0.18 + intensity * 0.4})`
                        : pos
                          ? `rgba(52,211,153,${0.03 + intensity * 0.1})`
                          : `rgba(251,113,133,${0.03 + intensity * 0.1})`,
                      border: `1px solid ${inPath ? "rgba(99,102,241,0.55)" : C.border}`,
                      borderRadius: 3,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: Math.max(7, cs * 0.3),
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: inPath ? 700 : 400,
                      color: inPath ? C.indigoFg : pos ? `rgba(167,243,208,${0.4 + intensity * 0.55})` : `rgba(254,205,211,${0.4 + intensity * 0.55})`,
                      aspectRatio: "1", minWidth: 0,
                    }}
                  >{val}</motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SAÍDA 526 — formata conforme o enunciado da questão
// ──────────────────────────────────────────────────────────────────────────────
function formatSaida526(
  texto1: string,
  texto2: string,
  resultado: ResultadoResponse,
): string {
  const lines: string[] = [];
  lines.push(`${texto1} ${texto2}`);
  lines.push(`${resultado.distancia}`);
  resultado.operacoes.forEach((op, i) => {
    const num = i + 1;
    if (op.tipo === "INSERT")  lines.push(`${num} Insert ${op.posicao},${op.valor ?? ""}`);
    if (op.tipo === "DELETE")  lines.push(`${num} Delete ${op.posicao}`);
    if (op.tipo === "REPLACE") lines.push(`${num} Replace ${op.posicao},${op.valor ?? ""}`);
  });
  return lines.join("\n");
}

function SaidaTab({
  texto1, texto2, resultado,
}: {
  texto1: string; texto2: string; resultado: ResultadoResponse;
}) {
  const output = formatSaida526(texto1, texto2, resultado);
  const [copied, setCopied] = useState(false);

  function copyToClipboard() {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function exportTxt() {
    const blob = new Blob([output], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `saida_526_${texto1}_${texto2}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{
        background: C.amberBg, border: `1px solid ${C.amberBd}`,
        borderRadius: 12, padding: "14px 16px", marginBottom: 18,
        fontSize: 12, color: C.amberFg, lineHeight: 1.7,
      }}>
        <strong>Formato da saída</strong> Distância de Edição e Processo de Transformação.<br />
        Prioridade de reconstrução: substituição → inserção → deleção (a partir do final da matriz).
      </div>

      {/* Input info */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>
          <span style={{ color: C.dim }}>texto1: </span>
          <span style={{ color: C.amberFg }}>{texto1}</span>
        </div>
        <div style={{ fontSize: 12, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>
          <span style={{ color: C.dim }}>texto2: </span>
          <span style={{ color: C.emeraldFg }}>{texto2}</span>
        </div>
      </div>

      {/* Console output */}
      <div style={{
        background: "#020208",
        border: `1px solid rgba(99,102,241,0.25)`,
        borderRadius: 12, overflow: "hidden",
        marginBottom: 16,
      }}>
        {/* Terminal header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "9px 14px",
          background: "rgba(99,102,241,0.08)",
          borderBottom: `1px solid rgba(99,102,241,0.15)`,
        }}>
          {["#f87171","#fbbf24","#34d399"].map((c) => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.7 }} />
          ))}
          <span style={{ marginLeft: 6, fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em" }}>
            saida_526.txt
          </span>
        </div>
        <pre style={{
          margin: 0, padding: "18px 20px",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 14, lineHeight: 1.8,
          color: C.text,
          overflowX: "auto",
          whiteSpace: "pre",
        }}>
          {output.split("\n").map((line, i) => {
            const isFirst = i === 0;
            const op = line.includes("Insert") ? "INSERT" : line.includes("Delete") ? "DELETE" : line.includes("Replace") ? "REPLACE" : null;
            const col = op ? OP[op] : null;
            return (
              <div key={i} style={{ color: isFirst ? C.indigoFg : col ? col.text : C.text }}>
                {line}
              </div>
            );
          })}
        </pre>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Btn
          onClick={copyToClipboard}
          style={{
            background: copied ? C.emeraldBg : C.surfaceHi,
            borderColor: copied ? C.emeraldBd : C.border,
            color: copied ? C.emeraldFg : C.muted,
            fontWeight: 600,
          }}
        >
          {copied ? "✓ Copiado!" : "⎘ Copiar"}
        </Btn>
        <Btn
          onClick={exportTxt}
          style={{
            background: C.indigoBg, borderColor: C.indigoBd,
            color: C.indigoFg, fontWeight: 600,
          }}
        >
          ↓ Exportar .txt
        </Btn>
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// OPERAÇÕES TAB
// ──────────────────────────────────────────────────────────────────────────────
function OperacoesTab({ resultado }: { resultado: ResultadoResponse }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {(["INSERT","DELETE","REPLACE"] as const).map((tipo) => {
          const count = resultado.operacoes.filter((o) => o.tipo === tipo).length;
          const c = OP[tipo];
          return (
            <div key={tipo} style={{
              background: c.bg, border: `1px solid ${c.border}`,
              borderRadius: 8, padding: "5px 12px",
              fontSize: 10, color: c.text, fontFamily: "'JetBrains Mono', monospace",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot, display: "inline-block" }} />
              {tipo} · {count}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {resultado.operacoes.map((op, i) => {
          const c = OP[op.tipo];
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.24 }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                background: c.bg, border: `1px solid ${c.border}`,
                borderRadius: 10, padding: "10px 14px",
              }}
            >
              <span style={{
                minWidth: 26, height: 26, borderRadius: 6,
                background: "rgba(255,255,255,0.04)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, color: C.dim,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{i + 1}</span>
              <span style={{
                minWidth: 64, fontSize: 10, fontWeight: 700, color: c.text,
                letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace",
              }}>{op.tipo}</span>
              <span style={{ fontSize: 12, color: C.muted }}>
                pos <strong style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{op.posicao}</strong>
                {op.valor && (
                  <> → <strong style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color: c.text, fontSize: 13,
                    background: "rgba(255,255,255,0.05)",
                    padding: "1px 6px", borderRadius: 4,
                  }}>'{op.valor}'</strong></>
                )}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

//MAIN APP
type Tab = "operacoes" | "animacao" | "matriz" | "alinhamento" | "saida";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "operacoes",   label: "Operações",  icon: "⌥" },
  { id: "animacao",    label: "Animação",    icon: "◈" },
  { id: "matriz",      label: "Matriz DP",   icon: "⊞" },
  { id: "alinhamento", label: "Alinhamento", icon: "⌘" },
  { id: "saida",       label: "Saída 526",   icon: "▤" },
];

export default function App() {
  const [texto1, setTexto1]   = useState("kitten");
  const [texto2, setTexto2]   = useState("sitting");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado]     = useState<ResultadoResponse | null>(null);
  const [animData,  setAnimData]      = useState<PassoAnimacao[] | null>(null);
  const [matrizData, setMatrizData]   = useState<MatrizResponse | null>(null);
  const [activeTab, setActiveTab]     = useState<Tab>("operacoes");
  const [error, setError]             = useState("");
  const [ct1, setCt1]                 = useState("");
  const [ct2, setCt2]                 = useState("");

  async function calcular() {
    if (!texto1.trim() || !texto2.trim()) return;
    setLoading(true); setError("");
    setResultado(null); setAnimData(null); setMatrizData(null);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`${BASE}/calcular`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto1, texto2 }) }),
        fetch(`${BASE}/animacao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto1, texto2 }) }),
        fetch(`${BASE}/matriz`,   { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto1, texto2 }) }),
      ]);
      if (!r1.ok || !r2.ok || !r3.ok) throw new Error("API error");
      const [d1, d2, d3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
      setResultado(d1); setAnimData(d2); setMatrizData(d3);
      setCt1(texto1); setCt2(texto2);
      setActiveTab("operacoes");
    } catch {
      setError("Erro ao conectar com o backend. Verifique a API.");
    } finally {
      setLoading(false);
    }
  }

  const hasResult = !!(resultado && animData && matrizData);

  return (
    <>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: ${C.bg}; color: ${C.text}; font-family: 'DM Sans', sans-serif; }
        input[type=range] { appearance: none; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.1); outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; border-radius: 50%; background: ${C.indigo}; cursor: pointer; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        button:hover { opacity: 0.85; }
      `}</style>

      <div style={{ minHeight: "100vh", background: C.bg, position: "relative", overflowX: "hidden" }}>

        {/* Ambient glows */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-10%", left: "-5%", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%)", filter: "blur(60px)" }} />
          <div style={{ position: "absolute", bottom: "-8%", right: "-5%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(52,211,153,0.06) 0%, transparent 65%)", filter: "blur(60px)" }} />
          <div style={{ position: "absolute", top: "40%", right: "15%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(251,191,36,0.04) 0%, transparent 65%)", filter: "blur(50px)" }} />
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "40px 20px 80px" }}>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            style={{ marginBottom: 36, textAlign: "center" }}
          >
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: C.indigoBg, border: `1px solid ${C.indigoBd}`,
              borderRadius: 100, padding: "4px 14px", marginBottom: 18,
              fontSize: 10, color: C.indigoFg, letterSpacing: "0.18em",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.indigo, boxShadow: `0 0 8px ${C.indigo}`, display: "inline-block" }} />
              BIOLOGIA COMPUTACIONAL · UFRPE
            </div>
            <h1 style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "clamp(36px, 7vw, 72px)",
              fontWeight: 800, lineHeight: 1.0,
              letterSpacing: "0.01em",
              textTransform: "uppercase",
              background: `linear-gradient(160deg, ${C.text} 30%, rgba(232,232,240,0.38))`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              marginBottom: 12,
            }}>
              Distância de Edição Visual
            </h1>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace" }}>
              Levenshtein · Needleman-Wunsch · Programação Dinâmica
            </p>
          </motion.header>

          {/* ── Input Card ─────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            style={{ marginBottom: hasResult ? 20 : 0 }}
          >
            <Card style={{ padding: "22px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                {[
                  { val: texto1, set: setTexto1, label: "TEXTO 1 (origem)", accent: C.amberFg },
                  { val: texto2, set: setTexto2, label: "TEXTO 2 (destino)", accent: C.emeraldFg },
                ].map(({ val, set, label, accent }) => (
                  <div key={label}>
                    <div style={{ fontSize: 9, color: C.dim, marginBottom: 7, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.16em" }}>{label}</div>
                    <input
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && calcular()}
                      spellCheck={false}
                      autoComplete="off"
                      style={{
                        width: "100%", background: C.surfaceHi,
                        border: `1px solid ${C.border}`, borderRadius: 10,
                        padding: "11px 14px", color: accent,
                        fontSize: 15, outline: "none",
                        fontFamily: "'JetBrains Mono', monospace",
                        transition: "border-color 0.2s",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = C.indigoBd; }}
                      onBlur={(e) => { e.target.style.borderColor = C.border; }}
                    />
                  </div>
                ))}
              </div>

              <motion.button
                onClick={calcular}
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.008 }}
                whileTap={{ scale: loading ? 1 : 0.99 }}
                style={{
                  width: "100%", padding: "13px",
                  background: loading ? C.indigoBg : C.indigo,
                  border: `1px solid ${C.indigoBd}`,
                  borderRadius: 10, color: loading ? C.indigoFg : "#fff",
                  fontSize: 13, fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "background 0.3s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {loading ? (
                  <>
                    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} style={{ display: "inline-block", fontSize: 14 }}>⟳</motion.span>
                    Calculando…
                  </>
                ) : "Calcular Distância de Edição"}
              </motion.button>

              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ color: C.roseFg, fontSize: 11, marginTop: 10, textAlign: "center", fontFamily: "'JetBrains Mono', monospace" }}>
                  {error}
                </motion.div>
              )}
            </Card>
          </motion.div>

          {/* ── Results ────────────────────────────────────────────────────── */}
          <AnimatePresence>
            {hasResult && (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.42 }}
              >
                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
                  {[
                    { label: "DISTÂNCIA",  val: resultado!.distancia,         color: C.indigoFg },
                    { label: "OPERAÇÕES",  val: resultado!.operacoes.length,   color: C.emeraldFg },
                    { label: "PASSOS",     val: animData!.length,              color: C.roseFg   },
                  ].map(({ label, val, color }) => (
                    <Card key={label} style={{ padding: "16px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.18em", marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
                      <div style={{ fontSize: 34, lineHeight: 1 }}>
                        <Num value={val} color={color} />
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Tabs */}
                <Card style={{ overflow: "hidden" }}>
                  {/* Tab bar */}
                  <div style={{
                    display: "flex", borderBottom: `1px solid ${C.border}`,
                    padding: "4px 4px 0", gap: 2, overflowX: "auto",
                  }}>
                    {TABS.map((tab) => {
                      const active = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          style={{
                            flex: "0 0 auto",
                            padding: "8px 14px",
                            border: "none", whiteSpace: "nowrap",
                            background: active ? C.indigoBg : "transparent",
                            borderRadius: "9px 9px 0 0",
                            color: active ? C.indigoFg : C.dim,
                            cursor: "pointer", fontSize: 12, fontWeight: 600,
                            fontFamily: "'DM Sans', sans-serif",
                            transition: "all 0.16s",
                            display: "flex", alignItems: "center", gap: 5,
                            position: "relative",
                          }}
                        >
                          <span style={{ fontSize: 12 }}>{tab.icon}</span>
                          {tab.label}
                          {active && (
                            <motion.div
                              layoutId="tabLine"
                              style={{
                                position: "absolute", bottom: 0, left: 6, right: 6,
                                height: 2, background: C.indigo, borderRadius: "2px 2px 0 0",
                              }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tab content */}
                  <div style={{ padding: "22px 20px" }}>
                    <AnimatePresence mode="wait">
                      {activeTab === "operacoes" && resultado && (
                        <motion.div key="op" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.18 }}>
                          <OperacoesTab resultado={resultado} />
                        </motion.div>
                      )}
                      {activeTab === "animacao" && animData && (
                        <motion.div key="an" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.18 }}>
                          <AnimacaoTab passos={animData} textoOrigem={ct1} textoDestino={ct2} />
                        </motion.div>
                      )}
                      {activeTab === "matriz" && matrizData && (
                        <motion.div key="mat" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.18 }}>
                          <MatrizTab texto1={ct1} texto2={ct2} data={matrizData} />
                        </motion.div>
                      )}
                      {activeTab === "alinhamento" && (
                        <motion.div key="al" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.18 }}>
                          <AlinhamentoTab texto1={ct1} texto2={ct2} />
                        </motion.div>
                      )}
                      {activeTab === "saida" && resultado && (
                        <motion.div key="sa" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.18 }}>
                          <SaidaTab texto1={ct1} texto2={ct2} resultado={resultado} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Footer ─────────────────────────────────────────────────────── */}
          <motion.footer
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            style={{
              marginTop: 52, textAlign: "center",
              fontSize: 10, color: C.dim,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.1em", lineHeight: 2,
            }}
          >
            <div>Levenshtein · Needleman-Wunsch · Programação Dinâmica</div>
            <div style={{ color: "rgba(104, 104, 104, 0.59)" }}>
              Daniel Dionísio · UFRPE · Biologia Computacional
            </div>
          </motion.footer>

        </div>
      </div>
    </>
  );
}