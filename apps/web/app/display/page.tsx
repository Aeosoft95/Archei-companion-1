'use client';
/**
 * ARCHEI — DISPLAY LOCALE
 * - Riceve stato clock via BroadcastChannel('archei-clocks')
 * - Mostra solo clock visibili
 * - Highlight su advance/complete
 */

import { useEffect, useRef, useState } from 'react';

type Clock = {
  id: string;
  name: string;
  segments: number;
  filled: number;
  visible: boolean;
  color?: string;
  icon?: string;
};

type DisplayEvent =
  | { t: 'DISPLAY_CLOCKS_STATE'; clocks: Clock[] }
  | { t: 'DISPLAY_HIGHLIGHT'; clockId: string; type: 'advance' | 'complete' };

const clamp = (v:number, lo:number, hi:number)=>Math.max(lo, Math.min(hi, v));
const validate = (c: Clock): Clock => {
  const segments = clamp(Math.floor(c.segments), 2, 48);
  const filled = clamp(Math.floor(c.filled), 0, segments);
  return { ...c, segments, filled };
};

function RingClock({ segments, filled, color, label, highlight }: {
  segments:number; filled:number; color?:string; label?:string; highlight?: 'advance'|'complete'|null;
}) {
  const size = 160, r = 58, stroke = 12;
  const cx = size/2, cy = size/2;
  const full = 360;
  const gap = Math.max(2, 14 / Math.max(segments, 4));
  const per = full / segments;
  const span = Math.max(6, per - gap);

  const arcs: { s:number; e:number; on:boolean }[] = [];
  let start = -90;
  for (let i=0;i<segments;i++){
    const s = start + gap/2;
    const e = s + span;
    arcs.push({ s, e, on: i < filled });
    start += per;
  }
  const polar = (a:number) => {
    const rad = a*Math.PI/180;
    return [cx + r*Math.cos(rad), cy + r*Math.sin(rad)];
  };

  return (
    <svg width={size} height={size} className={`block ${highlight ? (highlight==='complete' ? 'animate-[pulse_1.2s_ease-out]' : 'animate-[ping_0.9s_ease-out]') : ''}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth={stroke} />
      {arcs.map((a,i)=>{
        const [x1,y1] = polar(a.s), [x2,y2] = polar(a.e);
        const largeArc = (a.e-a.s)>180 ? 1 : 0;
        return (
          <path
            key={i}
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            stroke={a.on ? (color||'#7dd3fc') : '#3a3a3a'}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
      <text x={cx} y={cy+7} textAnchor="middle" className="fill-neutral-100" style={{ fontSize: 20, fontWeight: 800 }}>
        {filled}/{segments}
      </text>
      {label && (
        <text x={cx} y={size-8} textAnchor="middle" className="fill-neutral-300" style={{ fontSize: 14, fontWeight: 600 }}>
          {label}
        </text>
      )}
    </svg>
  );
}

export default function DisplayLocal(){
  const [clocks, setClocks] = useState<Clock[]>([]);
  const [highlightId, setHighlightId] = useState<string|null>(null);
  const [highlightType, setHighlightType] = useState<'advance'|'complete'|null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // 1) tentativo di boot con ciò che è già in localStorage (così si vede subito)
  useEffect(()=>{
    try {
      const raw = localStorage.getItem('archei:clocks:v1');
      if (raw) {
        const parsed = JSON.parse(raw) as Clock[];
        setClocks(parsed.filter(c=>c.visible).map(validate));
      }
    } catch {}
  }, []);

  // 2) ascolta BroadcastChannel per stato e highlight
  useEffect(()=>{
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('archei-clocks');
      bc.onmessage = (e: MessageEvent<DisplayEvent>)=>{
        const ev = e.data;
        if (!ev || typeof ev !== 'object') return;
        if (ev.t === 'DISPLAY_CLOCKS_STATE') {
          setClocks((ev.clocks || []).filter(c=>c.visible).map(validate));
        } else if (ev.t === 'DISPLAY_HIGHLIGHT') {
          setHighlightId(ev.clockId);
          setHighlightType(ev.type);
          if (clearTimer.current) clearTimeout(clearTimer.current);
          clearTimer.current = setTimeout(()=>{ setHighlightId(null); setHighlightType(null); }, 1100);
        }
      };
    } catch {}
    return ()=>{ if (bc) bc.close(); if (clearTimer.current) clearTimeout(clearTimer.current); };
  }, []);

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
        <h1 className="text-xl font-bold mb-4">Display (Locale)</h1>

        <section className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {clocks.map(c=>(
            <div key={c.id} className="rounded-2xl border border-neutral-800 p-3 bg-neutral-900/40 flex flex-col items-center">
              <div className="text-lg font-semibold mb-1">{c.icon || '🕒'} {c.name}</div>
              <RingClock
                segments={c.segments}
                filled={c.filled}
                color={c.color}
                label=""
                highlight={highlightId===c.id ? (highlightType||'advance') : null}
              />
            </div>
          ))}
          {clocks.length===0 && (
            <div className="opacity-70 text-sm p-6 border border-neutral-800 rounded-2xl">
              Nessun clock visibile. Attiva la visibilità 👁️ da “Clock (GM)”.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
