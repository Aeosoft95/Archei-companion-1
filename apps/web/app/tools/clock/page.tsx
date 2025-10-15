'use client';
/**
 * ARCHEI — CLOCKS (GM) — WS mirror + concat semplificate
 * - Sidebar: crea clock + filtro + toggle "Mirror su WS" (URL, room, stato)
 * - Griglia fluida: repeat(auto-fill, minmax(320px, 1fr)) + card full-height
 * - Persistenza localStorage + BroadcastChannel (display locale)
 * - WS mirror (opzionale): DISPLAY_CLOCKS_STATE / DISPLAY_HIGHLIGHT (+ room)
 * - Concat semplificate: relation=after|parallel|gate, ratio, minStep, reveal
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { GuardRole } from '@/lib/guards';

/* ---------- Tipi ---------- */
type ClockType = 'Evento' | 'Missione' | 'Campagna' | 'Corruzione' | 'Legame' | 'Personalizzato';

type SimpleRelation = 'after' | 'parallel' | 'gate';
type SimpleRule = {
  relation: SimpleRelation;
  targets: string[];
  ratio?: number;   // default 1
  minStep?: number; // default 0
  reveal?: boolean; // default false
};

type Clock = {
  id: string;
  name: string;
  type: ClockType;
  segments: number;   // 2..48
  filled: number;     // 0..segments
  visible: boolean;   // sul display
  color?: string;
  icon?: string;
  tags?: string[];
  notes?: string;
  onComplete?: string;
  drop?: string;
  concat?: SimpleRule[]; // <— semplificato
};

/* ---------- Utils ---------- */
const LS_KEY = 'archei:clocks:v1';
const clamp = (v:number, lo:number, hi:number)=>Math.max(lo, Math.min(hi, v));
const validate = (c: Clock): Clock => {
  const segments = clamp(Math.floor(c.segments), 2, 48);
  const filled = clamp(Math.floor(c.filled), 0, segments);
  return { ...c, segments, filled };
};
const uuid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `ck_${Math.random().toString(36).slice(2,10)}`;

function load(): Clock[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Clock[];
    return Array.isArray(parsed) ? parsed.map(validate) : [];
  } catch { return []; }
}
function save(list: Clock[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
}

/* ---------- BroadcastChannel ---------- */
type DisplayEvent =
  | { t: 'DISPLAY_CLOCKS_STATE'; clocks: Clock[] }
  | { t: 'DISPLAY_HIGHLIGHT'; clockId: string; type: 'advance' | 'complete' };

function broadcastLocal(list: Clock[]) {
  try {
    const bc = new BroadcastChannel('archei-clocks');
    bc.postMessage({ t: 'DISPLAY_CLOCKS_STATE', clocks: list.filter(c=>c.visible).map(validate) } as DisplayEvent);
    bc.close();
  } catch {}
}
function highlightLocal(clockId: string, type: 'advance'|'complete') {
  try {
    const bc = new BroadcastChannel('archei-clocks');
    bc.postMessage({ t: 'DISPLAY_HIGHLIGHT', clockId, type } as DisplayEvent);
    bc.close();
  } catch {}
}

/* ---------- WS Mirror (opzionale) ---------- */
function useWsMirror() {
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState<string>(process.env.NEXT_PUBLIC_WS_DEFAULT || '');
  const [room, setRoom] = useState<string>('demo');
  const [status, setStatus] = useState<'idle'|'connecting'|'open'|'closed'|'error'>('idle');
  const wsRef = useRef<WebSocket|null>(null);

  useEffect(()=>{
    if (!enabled) { try { wsRef.current?.close(); } catch {} setStatus('idle'); return; }
    if (!url || !(url.startsWith('ws://') || url.startsWith('wss://'))) { setStatus('error'); return; }

    let active = true, attempt = 0;
    const connect = ()=>{
      try {
        setStatus('connecting');
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = ()=>{ if (!active) return; setStatus('open'); attempt = 0; };
        ws.onclose = ()=>{
          if (!active) return;
          setStatus('closed');
          const delay = Math.min(1000 * (2 ** attempt++), 10000);
          setTimeout(connect, delay);
        };
        ws.onerror = ()=>{ setStatus('error'); try { ws.close(); } catch {} };
        ws.onmessage = ()=>{}; // display-only: non riceviamo qui
      } catch {
        const delay = Math.min(1000 * (2 ** attempt++), 10000);
        setTimeout(connect, delay);
      }
    };

    connect();
    return ()=>{ active = false; try { wsRef.current?.close(); } catch {} };
  }, [enabled, url]);

  function send(ev: any) {
    const ws = wsRef.current;
    if (!enabled || !ws || ws.readyState !== ws.OPEN) return false;
    try { ws.send(JSON.stringify(room ? { room, ...ev } : ev)); return true; } catch { return false; }
  }

  return { enabled, setEnabled, url, setUrl, room, setRoom, status, send };
}

/* ---------- Emoji Picker ---------- */
const COMMON_EMOJI = ['🕒','⏰','🔥','💀','🩸','🛡️','⚔️','🌙','⭐','🌀','👁️','🧿','📜','⚙️','🔮','🧪','🏴','🧭','🗝️','🕯️','🌩️','🌫️','💥','🪙','🎯','🗡️','🏺','🐍','🪄','👑'];

function EmojiPicker({
  value, onPick, align = 'left'
}: { value?: string; onPick: (e: string)=>void; align?: 'left'|'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement|null>(null);

  useEffect(()=>{
    const onDoc = (e: MouseEvent)=>{
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return ()=> document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
        onClick={()=>setOpen(o=>!o)}
        title="Scegli emoji"
      >
        {value || '😀'}
      </button>
      {open && (
        <div className={`absolute z-20 mt-2 w-64 rounded-xl border border-neutral-700 bg-neutral-900 p-2 shadow-lg ${align==='right' ? 'right-0' : 'left-0'}`}>
          <div className="grid grid-cols-8 gap-1 text-xl">
            {COMMON_EMOJI.map(em => (
              <button
                key={em}
                className="px-1 py-1 rounded hover:bg-neutral-800"
                onClick={()=>{ onPick(em); setOpen(false); }}
                title={em}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Ring (SVG) ---------- */
function RingClock({ segments, filled, color, onClick, onShiftClick, label }:{
  segments:number; filled:number; color?:string;
  onClick?:()=>void; onShiftClick?:()=>void; label?:string;
}) {
  const size = 132, r = 50, stroke = 10;
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
    <svg
      width={size} height={size}
      className="cursor-pointer block"
      aria-label={label||'Clock'}
      onClick={(e)=> e.shiftKey ? onShiftClick?.() : onClick?.()}
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth={stroke} />
      {arcs.map((a, i)=>{
        const [x1,y1] = polar(a.s);
        const [x2,y2] = polar(a.e);
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
      <text x={cx} y={cy+6} textAnchor="middle" className="fill-neutral-200" style={{ fontSize: 18, fontWeight: 700 }}>
        {filled}/{segments}
      </text>
    </svg>
  );
}

/* ---------- Page ---------- */
export default function Page(){
  return (
    <GuardRole allow="gm">
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6">
          <h1 className="text-xl font-bold mb-4">Clock (GM)</h1>
          <ClockWithSidebar />
        </div>
      </div>
    </GuardRole>
  );
}

/* ---------- Concat Editor (SEMPLICE) ---------- */
function ConcatEditor({
  clock, allClocks, onChange
}: { clock: Clock; allClocks: Clock[]; onChange: (rules: SimpleRule[]) => void }) {
  const rules = clock.concat ?? [];
  const options = allClocks.filter(c => c.id !== clock.id);

  function updateRule(i: number, patch: Partial<SimpleRule>){
    const next = rules.slice(); next[i] = { ...next[i], ...patch }; onChange(next);
  }
  function addRule(){ onChange([...(rules||[]), { relation:'parallel', targets:[], ratio:1, minStep:0, reveal:false }]); }
  function removeRule(i: number){ const next = rules.slice(); next.splice(i,1); onChange(next); }

  return (
    <div className="rounded-xl border border-neutral-800 p-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-semibold">Concatenazioni (semplici)</div>
        <button className="px-2 py-1 rounded bg-neutral-800" onClick={addRule}>+ Regola</button>
      </div>

      {rules.length === 0 && <div className="text-sm opacity-70 mt-2">Nessuna regola.</div>}

      <div className="mt-3 grid gap-4">
        {rules.map((r, i)=>(
          <div key={i} className="rounded-lg bg-neutral-900/60 p-3 grid gap-3">
            {/* Riga 1 */}
            <div className="grid md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 min-w-0">
                <span className="w-28 text-sm shrink-0">Relation</span>
                <select value={r.relation} onChange={e=>updateRule(i, { relation: e.target.value as SimpleRelation })} className="flex-1 px-2 py-2 bg-neutral-800 rounded min-w-0">
                  <option value="parallel">parallel (su advance)</option>
                  <option value="after">after (alla complete)</option>
                  <option value="gate">gate (sblocca+boost)</option>
                </select>
              </label>
              <label className="flex items-center gap-2 min-w-0">
                <span className="w-28 text-sm shrink-0">Reveal target</span>
                <input type="checkbox" checked={!!r.reveal} onChange={e=>updateRule(i, { reveal: e.target.checked })}/>
              </label>
            </div>

            {/* Riga 2 */}
            <div className="grid md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 min-w-0">
                <span className="w-28 text-sm shrink-0">Ratio</span>
                <input type="number" step="0.25" value={r.ratio ?? 1} onChange={e=>updateRule(i, { ratio: parseFloat(e.target.value||'1') })} className="flex-1 px-2 py-2 bg-neutral-800 rounded min-w-0" />
              </label>
              <label className="flex items-center gap-2 min-w-0">
                <span className="w-28 text-sm shrink-0">minStep</span>
                <input type="number" min={0} value={r.minStep ?? 0} onChange={e=>updateRule(i, { minStep: parseInt(e.target.value||'0') })} className="flex-1 px-2 py-2 bg-neutral-800 rounded min-w-0" />
              </label>
            </div>

            {/* Targets */}
            <div>
              <div className="text-xs opacity-80 mb-2">Targets</div>
              <div className="flex flex-wrap gap-2">
                {options.map(o=>{
                  const on = (r.targets||[]).includes(o.id);
                  return (
                    <label key={o.id} className={`px-2 py-1 rounded border cursor-pointer break-words ${on ? 'border-emerald-500' : 'border-neutral-700'}`}>
                      <input
                        type="checkbox" className="mr-1"
                        checked={on}
                        onChange={(e)=>{
                          const set = new Set(r.targets||[]);
                          if (e.target.checked) set.add(o.id); else set.delete(o.id);
                          updateRule(i, { targets: Array.from(set) });
                        }}
                      />
                      <span className="whitespace-pre-wrap break-words">{o.icon || '🕒'} {o.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="text-xs opacity-70">
              <b>parallel</b>: su <i>advance</i> trasferisce <code>round(delta*ratio)</code> (se &lt;1 ma &gt;0 usa <code>minStep</code>).<br/>
              <b>after</b>: su <i>complete</i> applica boost = <code>round(segmentsTarget*ratio)</code> (o <code>minStep</code> se &gt;0).<br/>
              <b>gate</b>: come <i>after</i> ma prima sblocca/mostra il target (se <code>reveal</code>).
            </div>

            <div className="text-right">
              <button className="px-2 py-1 rounded bg-neutral-800" onClick={()=>removeRule(i)}>Rimuovi</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Component principale ---------- */
function ClockWithSidebar(){
  const [clocks, setClocks] = useState<Clock[]>([]);
  const [search, setSearch] = useState('');
  const typeOptions: ClockType[] = ['Evento','Missione','Campagna','Corruzione','Legame','Personalizzato'];

  // WS mirror hook
  const ws = useWsMirror();

  const inited = useRef(false);
  useEffect(()=>{
    if (inited.current) return;
    inited.current = true;
    const data = load();
    if (data.length) setClocks(data);
    else {
      setClocks([
        validate({ id: uuid(), name: 'Portale Instabile', type:'Missione', segments: 6, filled: 2, visible: true, color: '#7dd3fc', icon:'⏰' }),
        validate({ id: uuid(), name: 'Ondata di Ombre', type:'Evento', segments: 8, filled: 0, visible: false, color: '#fca5a5', icon:'💀' }),
      ]);
    }
    // broadcast iniziale
    setTimeout(()=>{
      const snapshot = load();
      broadcastLocal(snapshot);
      if (ws.enabled) ws.send({ t:'DISPLAY_CLOCKS_STATE', clocks: snapshot.filter(c=>c.visible) });
    }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist + broadcast su ogni modifica
  useEffect(()=>{
    const next = clocks.map(validate);
    save(next);
    broadcastLocal(next);
    if (ws.enabled) ws.send({ t:'DISPLAY_CLOCKS_STATE', clocks: next.filter(c=>c.visible) });
  }, [clocks, ws.enabled]); // se abiliti WS dopo, invia stato corrente

  /* --- helpers --- */
  const applyDelta = (id: string, delta: number) => {
    setClocks(prev => {
      const map = new Map(prev.map(c => [c.id, { ...c }]));
      const src = map.get(id); if (!src) return prev;
      const before = src.filled;
      src.filled = clamp(src.filled + delta, 0, src.segments);
      map.set(id, validate(src));

      // Concat semplificate
      const rules = (src.concat||[]).slice();
      const addTo = (tid: string, d: number, reveal?: boolean)=>{
        const tgt = map.get(tid); if (!tgt || d===0) return;
        const visible = reveal ? true : tgt.visible;
        const filled = clamp(tgt.filled + d, 0, tgt.segments);
        map.set(tid, validate({ ...tgt, filled, visible }));
      };

      // parallel: su advance
      if (delta > 0) {
        for (const r of rules.filter(r=>r.relation==='parallel')) {
          const ratio = r.ratio ?? 1;
          let pass = Math.round(delta * ratio);
          if (pass < 1 && delta > 0 && (r.minStep ?? 0) > 0) pass = r.minStep!;
          for (const t of r.targets||[]) addTo(t, pass, r.reveal);
        }
      }

      // complete: after/gate
      const wasComplete = before >= src.segments;
      const nowComplete = src.filled >= src.segments;
      if (!wasComplete && nowComplete) {
        for (const r of rules.filter(r=>r.relation==='after' || r.relation==='gate')) {
          for (const t of r.targets||[]) {
            const tgt = map.get(t); if (!tgt) continue;
            const ratio = r.ratio ?? 1;
            let boost = Math.round((tgt.segments) * ratio);
            if ((r.minStep ?? 0) > 0) boost = Math.max(boost, r.minStep!);
            addTo(t, boost, r.reveal || r.relation==='gate');
          }
        }
      }

      const out = Array.from(map.values()).map(validate);

      // highlight sorgente
      if (src.filled > before) {
        const type = src.filled >= src.segments ? 'complete' : 'advance';
        highlightLocal(src.id, type);
        if (ws.enabled) ws.send({ t:'DISPLAY_HIGHLIGHT', clockId: src.id, type });
      }

      return out;
    });
  };

  const upsert = (patch: Partial<Clock> & { id?: string }) => {
    setClocks(prev=>{
      if (patch.id){
        return prev.map(c => c.id===patch.id ? validate({ ...c, ...patch }) : c);
      } else {
        const c: Clock = validate({
          id: uuid(),
          name: patch.name || 'Nuovo Clock',
          type: (patch.type as ClockType) ?? 'Personalizzato',
          segments: patch.segments ?? 6,
          filled: patch.filled ?? 0,
          visible: patch.visible ?? true,
          color: patch.color || '#94a3b8',
          icon: patch.icon || '🕒',
          tags: patch.tags ?? [],
          notes: patch.notes ?? '',
          onComplete: patch.onComplete ?? '',
          drop: patch.drop ?? '',
          concat: patch.concat ?? []
        });
        return [...prev, c];
      }
    });
  };
  const toggleVis = (id:string) => setClocks(prev=> prev.map(c=> c.id===id ? { ...c, visible: !c.visible } : c));
  const remove = (id:string) => setClocks(prev=> prev.filter(c=> c.id!==id));

  /* --- creazione (sidebar) --- */
  const [nName, setNName] = useState('');
  const [nType, setNType] = useState<ClockType>('Personalizzato');
  const [nSeg, setNSeg] = useState(6);
  const [nCol, setNCol] = useState('#94a3b8');
  const [nIcon, setNIcon] = useState<string>('🕒');

  const create = () => {
    upsert({ name: nName.trim() || 'Nuovo Clock', type:nType, segments: clamp(nSeg, 2, 48), color: nCol, icon: nIcon, visible: true });
    setNName(''); setNSeg(6); setNCol('#94a3b8'); setNIcon('🕒'); setNType('Personalizzato');
  };

  /* --- filtro semplice --- */
  const filtered = useMemo(()=>{
    if (!search.trim()) return clocks;
    const k = search.toLowerCase();
    return clocks.filter(c => `${c.name} ${(c.tags||[]).join(' ')}`.toLowerCase().includes(k));
  }, [clocks, search]);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px,minmax(0,1fr)] items-start">
      {/* Sidebar sinistra — Nuovo Clock + filtro + WS */}
      <aside className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3 sticky top-20 h-fit">
        <div className="text-sm uppercase tracking-wide opacity-70 mb-2">Nuovo Clock</div>
        <div className="grid gap-2">
          <input
            value={nName} onChange={e=>setNName(e.target.value)}
            placeholder="Nome"
            className="px-2 py-2 bg-neutral-800 rounded"
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={nType} onChange={e=>setNType(e.target.value as ClockType)} className="px-2 py-2 bg-neutral-800 rounded">
              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="number" min={2} max={48}
              value={nSeg} onChange={e=>setNSeg(parseInt(e.target.value||'6'))}
              className="px-2 py-2 bg-neutral-800 rounded"
              aria-label="Segmenti"
              title="Segmenti"
            />
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={nCol} onChange={e=>setNCol(e.target.value)} className="h-9 w-12 bg-neutral-800 rounded" />
            <EmojiPicker value={nIcon} onPick={setNIcon} />
            <span className="text-xs opacity-70">Colore & Emoji</span>
          </div>
          <button onClick={create} className="mt-1 px-3 py-2 rounded bg-neutral-200 text-neutral-900 font-semibold">
            Crea
          </button>
        </div>

        <hr className="my-4 border-neutral-800" />

        <div className="grid gap-2">
          <input
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Cerca nome/tag…"
            className="px-2 py-2 bg-neutral-800 rounded"
          />
          <button
            className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
            onClick={()=>setSearch('')}
          >
            Azzera filtro
          </button>
        </div>

        <hr className="my-4 border-neutral-800" />

        {/* Mirror WS */}
        <div className="grid gap-2">
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm">Mirror su WebSocket</span>
            <input type="checkbox" checked={ws.enabled} onChange={e=>ws.setEnabled(e.target.checked)} />
          </label>

          {ws.enabled && (
            <>
              <label className="grid gap-1">
                <span className="text-xs opacity-70">WS URL</span>
                <input
                  value={ws.url}
                  onChange={e=>ws.setUrl(e.target.value)}
                  placeholder="wss://... o ws://localhost:8787"
                  className="px-2 py-2 bg-neutral-800 rounded"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs opacity-70">Room</span>
                <input
                  value={ws.room}
                  onChange={e=>ws.setRoom(e.target.value)}
                  placeholder="demo"
                  className="px-2 py-2 bg-neutral-800 rounded"
                />
              </label>
              <div className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700 w-fit">
                {ws.status==='open' ? '🟢 Connesso'
                  : ws.status==='connecting' ? '🟡 Connessione…'
                  : ws.status==='error' ? '🔴 Errore URL'
                  : '⚫ Inattivo'}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Colonna destra — Lista */}
      <section className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {filtered.map(c=>(
          <div key={c.id} className="h-full">
            <ClockCard
              clock={c}
              allClocks={clocks}
              onDelta={(d)=>applyDelta(c.id, d)}
              onUpdate={(patch)=>upsert({ id: c.id, ...patch })}
              onToggleVis={()=>toggleVis(c.id)}
              onRemove={()=>remove(c.id)}
            />
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-sm opacity-70 p-6 border border-neutral-800 rounded-2xl">
            Nessun clock. Crea il primo dalla colonna a sinistra.
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- Card del Clock + Dettagli ---------- */
function ClockCard({
  clock, allClocks, onDelta, onUpdate, onToggleVis, onRemove
}: {
  clock: Clock;
  allClocks: Clock[];
  onDelta: (d:number)=>void;
  onUpdate: (p: Partial<Clock>)=>void;
  onToggleVis: ()=>void;
  onRemove: ()=>void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-neutral-800 p-3 bg-neutral-900/40 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <EmojiPicker value={clock.icon || '🕒'} onPick={(em)=>onUpdate({ icon: em })} />
        <input
          className="flex-1 min-w-0 bg-transparent font-semibold px-2 py-1 rounded hover:bg-neutral-800/50"
          value={clock.name}
          onChange={e=> onUpdate({ name: e.target.value })}
        />
        <button onClick={onToggleVis} className="px-2 py-1 rounded hover:bg-neutral-800" title="Visibile sul display">
          {clock.visible ? '👁️' : '🙈'}
        </button>
        <button onClick={onRemove} className="px-2 py-1 rounded hover:bg-neutral-800" title="Elimina">✕</button>
      </div>

      {/* Body */}
      <div className="mt-3 grid gap-3 items-start md:grid-cols-[auto,1fr]">
        <div className="justify-self-center md:justify-self-start">
          <RingClock
            segments={clock.segments}
            filled={clock.filled}
            color={clock.color}
            label={clock.name}
            onClick={()=>onDelta(+1)}
            onShiftClick={()=>onDelta(-1)}
          />
        </div>
        <div className="grid gap-2 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex items-center gap-2 min-w-0">
              <span className="w-20 text-sm shrink-0">Segmenti</span>
              <input
                type="number" min={2} max={48}
                value={clock.segments}
                onChange={e=>{
                  const seg = clamp(parseInt(e.target.value||'6'), 2, 48);
                  onUpdate({ segments: seg, filled: Math.min(clock.filled, seg) });
                }}
                className="w-[120px] px-2 py-1 bg-neutral-800 rounded"
              />
            </label>
            <label className="flex items-center gap-2 min-w-0">
              <span className="w-16 text-sm shrink-0">Colore</span>
              <input
                type="color" value={clock.color || '#94a3b8'}
                onChange={e=> onUpdate({ color: e.target.value })}
                className="h-9 w-12 bg-neutral-800 rounded"
              />
            </label>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button className="px-2 py-1 rounded bg-neutral-700" onClick={()=>onDelta(+1)}>+1</button>
            <button className="px-2 py-1 rounded bg-neutral-700" onClick={()=>onDelta(+2)}>+2</button>
            <button className="px-2 py-1 rounded bg-neutral-700" onClick={()=>onDelta(+3)}>+3</button>
            <button className="px-2 py-1 rounded bg-neutral-700" onClick={()=>onDelta(-1)}>−1</button>
          </div>
        </div>
      </div>

      {/* Dettagli */}
      <div className="mt-3 pt-2 border-t border-neutral-800">
        <button
          className="text-sm opacity-80 hover:opacity-100 px-2 py-1 rounded hover:bg-neutral-800"
          onClick={()=>setOpen(o=>!o)}
        >
          {open ? 'Nascondi dettagli ▲' : 'Dettagli ▼'}
        </button>

        {open && (
          <div className="mt-3 grid gap-3">
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="flex items-center gap-2 min-w-0">
                <span className="w-20 text-sm shrink-0">Tipo</span>
                <select
                  value={clock.type}
                  onChange={e=> onUpdate({ type: e.target.value as ClockType })}
                  className="flex-1 px-2 py-2 bg-neutral-800 rounded min-w-0"
                >
                  {['Evento','Missione','Campagna','Corruzione','Legame','Personalizzato'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 min-w-0">
                <span className="w-20 text-sm shrink-0">Tag</span>
                <input
                  value={(clock.tags||[]).join(' ')}
                  onChange={e=> onUpdate({ tags: e.target.value.split(' ').filter(Boolean) })}
                  placeholder="separati da spazio"
                  className="flex-1 px-2 py-2 bg-neutral-800 rounded min-w-0"
                />
              </label>
            </div>

            <label className="flex items-start gap-2 min-w-0">
              <span className="w-28 text-sm shrink-0 mt-1">Note</span>
              <textarea
                rows={2}
                value={clock.notes || ''}
                onChange={e=> onUpdate({ notes: e.target.value })}
                placeholder="markdown breve"
                className="flex-1 px-2 py-2 bg-neutral-800 rounded whitespace-pre-wrap break-words"
              />
            </label>

            <label className="flex items-start gap-2 min-w-0">
              <span className="w-28 text-sm shrink-0 mt-1">onComplete</span>
              <textarea
                rows={2}
                value={clock.onComplete || ''}
                onChange={e=> onUpdate({ onComplete: e.target.value })}
                placeholder="conseguenza al completamento"
                className="flex-1 px-2 py-2 bg-neutral-800 rounded whitespace-pre-wrap break-words"
              />
            </label>

            <label className="flex items-start gap-2 min-w-0">
              <span className="w-28 text-sm shrink-0 mt-1">Drop</span>
              <textarea
                rows={2}
                value={clock.drop || ''}
                onChange={e=> onUpdate({ drop: e.target.value })}
                placeholder="loot/effect libero"
                className="flex-1 px-2 py-2 bg-neutral-800 rounded whitespace-pre-wrap break-words"
              />
            </label>

            <ConcatEditor
              clock={clock}
              allClocks={allClocks}
              onChange={(r)=> onUpdate({ concat: r })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
