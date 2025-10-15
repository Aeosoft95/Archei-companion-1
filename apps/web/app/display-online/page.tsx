'use client';
/**
 * ARCHEI — DISPLAY ONLINE (WS)
 * - Legge da WebSocket: ?ws=wss://...&room=PIN
 * - Eventi accettati:
 *   - DISPLAY_CLOCKS_STATE { clocks }
 *   - DISPLAY_HIGHLIGHT { clockId, type }
 *   (con o senza { room } nel payload: se presente, filtra per room)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Clock = {
  id: string;
  name: string;
  segments: number;
  filled: number;
  visible: boolean;
  color?: string;
  icon?: string;
};

type WsEv =
  | ({ room?: string } & { t: 'DISPLAY_CLOCKS_STATE'; clocks: Clock[] })
  | ({ room?: string } & { t: 'DISPLAY_HIGHLIGHT'; clockId: string; type: 'advance' | 'complete' })
  | Record<string, unknown>;

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

export default function DisplayOnline(){
  const search = useSearchParams();
  const wsParam = search.get('ws') || process.env.NEXT_PUBLIC_WS_DEFAULT || '';
  const room = search.get('room') || 'demo';

  const [clocks, setClocks] = useState<Clock[]>([]);
  const [highlightId, setHighlightId] = useState<string|null>(null);
  const [highlightType, setHighlightType] = useState<'advance'|'complete'|null>(null);
  const [status, setStatus] = useState<'idle'|'connecting'|'open'|'closed'|'error'>('idle');
  const clearTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const wsRef = useRef<WebSocket|null>(null);
  const urlValid = useMemo(()=> wsParam.startsWith('ws://') || wsParam.startsWith('wss://'), [wsParam]);

  useEffect(()=>{
    if (!urlValid) { setStatus('error'); return; }
    setStatus('connecting');
    let active = true;
    let attempt = 0;

    const connect = ()=>{
      try {
        const ws = new WebSocket(wsParam);
        wsRef.current = ws;

        ws.onopen = ()=>{ if (!active) return; setStatus('open'); attempt = 0; };

        ws.onmessage = (me)=>{
          try {
            const data = JSON.parse(me.data as string) as WsEv;
            // filtra per room se presente
            // (accetta payload senza room per retro-compat)
            if (typeof data !== 'object' || data === null) return;
            const hasRoom = 'room' in (data as any);
            if (hasRoom && (data as any).room !== room) return;

            if ((data as any).t === 'DISPLAY_CLOCKS_STATE') {
              const list = (data as any).clocks as Clock[] | undefined;
              if (Array.isArray(list)) setClocks(list.filter(c=>c.visible).map(validate));
            } else if ((data as any).t === 'DISPLAY_HIGHLIGHT') {
              const cid = (data as any).clockId as string;
              const type = (data as any).type as 'advance'|'complete';
              setHighlightId(cid); setHighlightType(type);
              if (clearTimer.current) clearTimeout(clearTimer.current);
              clearTimer.current = setTimeout(()=>{ setHighlightId(null); setHighlightType(null); }, 1100);
            }
          } catch {}
        };

        ws.onclose = ()=>{
          if (!active) return;
          setStatus('closed');
          const delay = Math.min(1000 * (2 ** attempt++), 10000);
          setTimeout(connect, delay);
        };

        ws.onerror = ()=>{
          setStatus('error');
          try { ws.close(); } catch {}
        };
      } catch {
        const delay = Math.min(1000 * (2 ** attempt++), 10000);
        setTimeout(connect, delay);
      }
    };

    connect();
    return ()=>{
      active = false;
      if (clearTimer.current) clearTimeout(clearTimer.current);
      try { wsRef.current?.close(); } catch {}
    };
  }, [wsParam, room, urlValid]);

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-xl font-bold">Display Online</h1>
          <div className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700">
            {urlValid ? (status==='open' ? '🟢 Connesso' : status==='connecting' ? '🟡 Connessione…' : '🔴 Disconnesso') : '⚠️ URL WS non valido'}
          </div>
        </div>

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
              Nessun clock visibile. Assicurati che il GM stia inviando lo stato sul WS (mirror) e che i clock siano 👁️ visibili.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
