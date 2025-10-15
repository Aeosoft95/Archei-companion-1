'use client';
/**
 * ARCHEI — CLOCKS (GM) — persistence + layout refined
 * - Salvataggio localStorage ("archei:clocks:v1")
 * - Layout centrato, due colonne stabili, card responsive
 * - Nessuna sovrapposizione: min-w-0, flex-wrap, overflow-visible
 * - Funzioni: advance/regress, labels, concat, visibilità, undo/redo, broadcast
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { GuardRole } from '@/lib/guards';

type ClockType = 'Evento' | 'Missione' | 'Campagna' | 'Corruzione' | 'Legame' | 'Personalizzato';
type ConcatRelation = 'after' | 'parallel' | 'gate' | 'mirror';
type ConcatOn = 'advance' | 'complete' | 'regress';
type CarryMode = 'none' | 'overflow' | 'clamp';
type VisibilityPropagation = 'inherit' | 'forceVisible' | 'noChange';

export type ConcatRule = {
  relation: ConcatRelation;
  targets: string[];
  on: ConcatOn;
  ratio?: number;
  minStep?: number;
  carryMode?: CarryMode;
  visibility?: VisibilityPropagation;
  note?: string;
};

export type Clock = {
  id: string;
  name: string;
  type: ClockType;
  segments: number;
  filled: number;
  visible: boolean;
  icon?: string;
  color?: string;
  notes?: string;
  tags?: string[];
  triggers?: string[];
  onComplete?: string;
  concat?: ConcatRule[];
};

type DisplayEvent =
  | { t: 'DISPLAY_CLOCKS_STATE'; clocks: Clock[] }
  | { t: 'DISPLAY_HIGHLIGHT'; clockId: string; type: 'advance' | 'complete' };

type ClientEvent =
  | { t: 'CLOCK_CREATE'; clock: Clock }
  | { t: 'CLOCK_UPDATE'; clockId: string; delta?: number; fields?: Partial<Clock> }
  | { t: 'CLOCK_DELETE'; clockId: string }
  | { t: 'CLOCK_TOGGLE_VIS'; clockId: string; visible: boolean };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (n: number) => Math.round(n);

function validate(clock: Clock): Clock {
  const segments = Math.max(2, Math.floor(clock.segments));
  const filled = clamp(Math.floor(clock.filled), 0, segments);
  return { ...clock, segments, filled };
}
function isComplete(c: Clock) { return c.filled >= c.segments; }
function advanceClock(c: Clock, delta: number): Clock {
  return validate({ ...c, filled: clamp(c.filled + delta, 0, c.segments) });
}
function uuid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `ck_${Math.random().toString(36).slice(2, 10)}`;
}

/* ----------------- Persistence ----------------- */
const LS_KEY = 'archei:clocks:v1';

function deepClone(list: Clock[]): Clock[] {
  return list.map(c => ({
    ...c,
    tags: c.tags ? [...c.tags] : undefined,
    triggers: c.triggers ? [...c.triggers] : undefined,
    concat: c.concat ? c.concat.map(r => ({ ...r, targets: [...r.targets] })) : undefined,
  }));
}
function loadFromStorage(): Clock[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Clock[];
    if (!Array.isArray(parsed)) return null;
    return parsed.map(validate);
  } catch { return null; }
}
function saveToStorage(list: Clock[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
}

/* ----------------- Broadcast (BC + WS) ----------------- */
function useBroadcast(wsEnabled: boolean, wsUrl: string | null, room: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [wsReady, setWsReady] = useState(false);

  useEffect(() => {
    if (!wsEnabled || !wsUrl) return;
    let active = true, attempt = 0;
    let sock: WebSocket | null = null;

    const connect = () => {
      try {
        sock = new WebSocket(wsUrl);
        sock.onopen = () => { setWsReady(true); attempt = 0; };
        sock.onclose = () => {
          setWsReady(false);
          if (!active) return;
          const delay = Math.min(1000 * (2 ** attempt++), 10000);
          setTimeout(connect, delay);
        };
        sock.onerror = () => { try { sock?.close(); } catch {} };
        wsRef.current = sock;
      } catch {
        const delay = Math.min(1000 * (2 ** attempt++), 10000);
        setTimeout(connect, delay);
      }
    };

    connect();
    return () => { active = false; try { wsRef.current?.close(); } catch {} };
  }, [wsEnabled, wsUrl]);

  function postLocal(ev: DisplayEvent) {
    try { const bc = new BroadcastChannel('archei-clocks'); bc.postMessage(ev); bc.close(); } catch {}
  }
  function postWS(ev: DisplayEvent | ClientEvent) {
    if (!wsEnabled || !wsRef.current || wsRef.current.readyState !== wsRef.current.OPEN) return false;
    try { wsRef.current.send(JSON.stringify(room ? { room, ...ev } : ev)); return true; } catch { return false; }
  }
  return { wsReady, postLocal, postWS };
}

/* ----------------- CONCAT ENGINE ----------------- */
type ConcatContext = {
  getClock: (id: string) => Clock | undefined;
  apply: (id: string, delta: number, meta?: { cause?: string }) => void;
  markComplete: (id: string) => void;
};

function applyConcat_onAdvance(src: Clock, delta: number, ctx: ConcatContext) {
  if (!src.concat?.length || delta === 0) return;
  for (const rule of src.concat) {
    if (rule.on !== 'advance') continue;
    const ratio = rule.ratio ?? 1;
    let pass = round(delta * ratio);
    if (delta > 0 && pass < 1 && (rule.minStep ?? 1) >= 1) pass = rule.minStep ?? 1;
    if (pass === 0) continue;

    for (const targetId of rule.targets) {
      const tgt = ctx.getClock(targetId);
      if (!tgt) continue;

      if (rule.visibility === 'forceVisible' && !tgt.visible) {
        ctx.apply(targetId, 0, { cause: `vis:force(${src.name})` });
      } else if (rule.visibility === 'inherit' && !tgt.visible && src.visible) {
        ctx.apply(targetId, 0, { cause: `vis:inherit(${src.name})` });
      }

      const carry: CarryMode = rule.carryMode ?? 'clamp';
      if (carry === 'clamp') {
        ctx.apply(targetId, pass, { cause: `concat:${src.name}` });
      } else if (carry === 'none') {
        const space = (tgt.segments - tgt.filled);
        const eff = pass > 0 ? Math.min(pass, space) : pass;
        if (eff !== 0) ctx.apply(targetId, eff, { cause: `concat:${src.name}` });
      } else if (carry === 'overflow') {
        const space = (tgt.segments - tgt.filled);
        ctx.apply(targetId, pass, { cause: `concat:${src.name}` });
        const n = ctx.getClock(targetId);
        if (n && isComplete(n) && pass > space) ctx.markComplete(targetId);
      }
    }
  }
}
function applyConcat_onComplete(src: Clock, ctx: ConcatContext) {
  if (!src.concat?.length) return;
  for (const rule of src.concat) {
    if (rule.on !== 'complete') continue;
    const ratio = rule.ratio ?? 1;
    for (const targetId of rule.targets) {
      const tgt = ctx.getClock(targetId);
      if (!tgt) continue;

      if (rule.visibility === 'forceVisible' && !tgt.visible) {
        ctx.apply(targetId, 0, { cause: `vis:force(${src.name})` });
      } else if (rule.visibility === 'inherit' && !tgt.visible && src.visible) {
        ctx.apply(targetId, 0, { cause: `vis:inherit(${src.name})` });
      }

      let boost = rule.minStep && rule.minStep >= 1 ? rule.minStep : round(tgt.segments * ratio);
      if (boost > 0) ctx.apply(targetId, boost, { cause: `complete:${src.name}` });
    }
  }
}
function applyConcat_onRegress(src: Clock, delta: number, ctx: ConcatContext) {
  if (!src.concat?.length || delta >= 0) return;
  for (const rule of src.concat) {
    if (rule.on !== 'regress') continue;
    const ratio = rule.ratio ?? 1;
    let pass = round(delta * ratio);
    if (pass === 0) pass = -1;
    for (const targetId of rule.targets) ctx.apply(targetId, pass, { cause: `regress:${src.name}` });
  }
}

/* ----------------- Ring Clock (SVG) ----------------- */
function RingClock({
  segments, filled, color, onClick, onShiftClick, label,
}: {
  segments: number; filled: number; color?: string;
  onClick?: ()=>void; onShiftClick?: ()=>void; label?: string;
}) {
  const size = 136;
  const r = 50;
  const stroke = 10;
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

  function polar(a:number){
    const rad = (a * Math.PI)/180;
    return [cx + r*Math.cos(rad), cy + r*Math.sin(rad)];
  }

  return (
    <svg
      width={size} height={size}
      className="cursor-pointer shrink-0 overflow-visible"
      role="img"
      aria-label={label||'Clock'}
      onClick={(e)=> e.shiftKey ? onShiftClick?.() : onClick?.()}
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth={stroke} />
      {arcs.map((a, idx)=>{
        const [x1,y1] = polar(a.s);
        const [x2,y2] = polar(a.e);
        const largeArc = (a.e - a.s) > 180 ? 1 : 0;
        return (
          <path
            key={idx}
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            stroke={a.on ? (color || '#7dd3fc') : '#3a3a3a'}
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

/* ----------------- PAGE ----------------- */
export default function Page(){
  return (
    <GuardRole allow="gm">
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <ClockManager />
        </div>
      </div>
    </GuardRole>
  );
}

function ClockManager(){
  // WS opzionale
  const [enableWS, setEnableWS] = useState(false);
  const [wsUrl, setWsUrl] = useState<string>(process.env.NEXT_PUBLIC_WS_DEFAULT || 'ws://127.0.0.1:8787');
  const [room, setRoom] = useState<string>('demo');
  const { wsReady, postLocal, postWS } = useBroadcast(enableWS, wsUrl, room);

  // Stato + init da storage
  const [clocks, setClocks] = useState<Clock[]>([]);
  const initializedRef = useRef(false);

  // Undo/Redo
  const undoStack = useRef<Clock[][]>([]);
  const redoStack = useRef<Clock[][]>([]);
  const pushHistory = (prev: Clock[]) => { undoStack.current.push(deepClone(prev)); redoStack.current = []; };
  const doUndo = () => { const prev = undoStack.current.pop(); if (!prev) return; redoStack.current.push(deepClone(clocks)); setClocks(prev.map(validate)); broadcastState(prev); };
  const doRedo = () => { const next = redoStack.current.pop(); if (!next) return; undoStack.current.push(deepClone(clocks)); setClocks(next.map(validate)); broadcastState(next); };

  // Inizializza (una volta) dal localStorage, altrimenti esempi
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const saved = loadFromStorage();
    if (saved && saved.length) {
      setClocks(saved.map(validate));
    } else {
      setClocks([
        validate({
          id: uuid(),
          name: 'Portale Instabile',
          type: 'Missione',
          segments: 6,
          filled: 2,
          visible: true,
          icon: '⏰',
          color: '#7dd3fc',
          triggers: ['+1/round', 'fallimenti'],
          onComplete: 'Il varco si apre definitivamente; ondata di Ombre invade il campo.',
          concat: [
            { relation: 'after', targets: ['ck_ombre'], on: 'complete', ratio: 1, minStep: 6, carryMode: 'clamp', visibility: 'forceVisible', note: 'Completa A → B a 6/8' }
          ]
        }),
        validate({
          id: 'ck_ombre',
          name: 'Ondata di Ombre',
          type: 'Evento',
          segments: 8,
          filled: 0,
          visible: false,
          color: '#fca5a5',
          onComplete: 'Campo travolto.'
        })
      ]);
    }
  }, []);

  // Salvataggio debounced su ogni cambio di clocks
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!initializedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const snapshot = deepClone(clocks).map(validate);
    saveTimer.current = setTimeout(() => {
      saveToStorage(snapshot);
      broadcastState(snapshot);
    }, 200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clocks]);

  // Helpers broadcast
  function broadcastState(state?: Clock[]) {
    const visibleOnly = (state ?? clocks).filter(c => c.visible).map(validate);
    const ev: DisplayEvent = { t: 'DISPLAY_CLOCKS_STATE', clocks: visibleOnly };
    postLocal(ev); postWS(ev);
  }
  function highlight(clockId: string, type: 'advance' | 'complete') {
    const ev: DisplayEvent = { t: 'DISPLAY_HIGHLIGHT', clockId, type };
    postLocal(ev); postWS(ev);
  }

  // Mutazioni
  function applyDelta(id: string, delta: number, label?: string) {
    setClocks(prev => {
      pushHistory(prev);
      const map = new Map(prev.map(c => [c.id, c]));
      const ctx: ConcatContext = {
        getClock: (cid) => map.get(cid),
        apply: (cid, d, meta) => {
          const curr = map.get(cid); if (!curr) return;
          const next = advanceClock(curr, d);
          if (meta?.cause?.startsWith('vis:')) {
            if (meta.cause.includes('force')) map.set(cid, { ...next, visible: true });
            else if (meta.cause.includes('inherit') && curr.visible === false) map.set(cid, { ...next, visible: true });
            else map.set(cid, next);
          } else map.set(cid, next);
        },
        markComplete: (cid) => {
          const curr = map.get(cid); if (!curr) return;
          map.set(cid, validate({ ...curr, filled: curr.segments }));
        }
      };

      if (label?.trim()) {
        const src = map.get(id);
        if (src) map.set(id, { ...src, triggers: [...(src.triggers ?? []), label.trim()] });
      }

      const srcBefore = map.get(id)!;
      const srcAfter = advanceClock(srcBefore, delta);
      map.set(id, srcAfter);

      if ((srcAfter.filled !== srcBefore.filled) && srcBefore.concat?.length) {
        if (delta > 0) applyConcat_onAdvance(srcBefore, delta, ctx);
        if (delta < 0) applyConcat_onRegress(srcBefore, delta, ctx);
      }
      if (!isComplete(srcBefore) && isComplete(srcAfter)) {
        highlight(id, 'complete');
        applyConcat_onComplete(srcBefore, ctx);
      } else if (delta > 0) {
        highlight(id, 'advance');
      }

      return Array.from(map.values()).map(validate);
    });
  }

  function newClockFromFields(fields: Partial<Clock>) {
    return validate({
      id: fields.id ?? uuid(),
      name: fields.name ?? 'Nuovo Clock',
      type: (fields.type as ClockType) ?? 'Personalizzato',
      segments: fields.segments ?? 6,
      filled: fields.filled ?? 0,
      visible: fields.visible ?? true,
      icon: fields.icon ?? '🕒',
      color: fields.color ?? '#94a3b8',
      notes: fields.notes ?? '',
      tags: fields.tags ?? [],
      triggers: fields.triggers ?? [],
      onComplete: fields.onComplete ?? '',
      concat: fields.concat ?? []
    });
  }

  function upsertClock(fields: Partial<Clock> & { id?: string }) {
    setClocks(prev => {
      pushHistory(prev);
      const out = [...prev];
      if (fields.id) {
        const idx = out.findIndex(c => c.id === fields.id);
        if (idx >= 0) { out[idx] = validate({ ...out[idx], ...fields }); postWS({ t: 'CLOCK_UPDATE', clockId: out[idx].id, fields }); }
        else { const c = newClockFromFields(fields); out.push(c); postWS({ t: 'CLOCK_CREATE', clock: c }); }
      } else {
        const c = newClockFromFields(fields);
        out.push(c); postWS({ t: 'CLOCK_CREATE', clock: c });
      }
      return out;
    });
  }

  function deleteClock(id: string) {
    setClocks(prev => {
      pushHistory(prev);
      const out = prev.filter(c => c.id !== id);
      postWS({ t: 'CLOCK_DELETE', clockId: id });
      return out;
    });
  }

  function toggleVisible(id: string) {
    setClocks(prev => {
      pushHistory(prev);
      const out = prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c);
      const target = out.find(c => c.id === id)!;
      postWS({ t: 'CLOCK_TOGGLE_VIS', clockId: id, visible: target.visible });
      return out;
    });
  }

  /* ---------- UI state: filtri & form ---------- */
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ClockType | 'Tutti'>('Tutti');
  const [tagFilter, setTagFilter] = useState<string>('');
  const typeOptions: ClockType[] = ['Evento','Missione','Campagna','Corruzione','Legame','Personalizzato'];

  const filtered = useMemo(()=>{
    return clocks.filter(c => {
      if (typeFilter !== 'Tutti' && c.type !== typeFilter) return false;
      if (search && !(`${c.name} ${c.tags?.join(' ')||''}`.toLowerCase().includes(search.toLowerCase()))) return false;
      if (tagFilter && !(c.tags||[]).includes(tagFilter)) return false;
      return true;
    });
  }, [clocks, search, typeFilter, tagFilter]);

  /* ---------- LAYOUT ---------- */
  return (
    <div className="py-6">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-neutral-900/80 bg-neutral-900/95 border-b border-neutral-800">
        <div className="py-3">
          <div className="max-w-7xl mx-auto px-4 lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight">Clock (GM)</h1>
                <p className="text-xs opacity-70">Click: <b>+1</b> • Shift+Click: <b>-1</b> • Bottoni: <b>+2/+3/−1</b> • Undo/Redo</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={enableWS} onChange={e=>setEnableWS(e.target.checked)} />
                  <span>WS</span>
                </label>
                <span className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700">
                  {enableWS ? (wsReady ? '🟢 Online' : '🔴 Offline') : 'WS disattivo'}
                </span>
              </div>
            </div>

            {enableWS && (
              <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <label className="flex items-center gap-2 min-w-0">
                  <span className="w-20 text-sm shrink-0">WS URL</span>
                  <input className="flex-1 px-2 py-1 bg-neutral-800 rounded min-w-0" value={wsUrl} onChange={e=>setWsUrl(e.target.value)} />
                </label>
                <label className="flex items-center gap-2 min-w-0">
                  <span className="w-20 text-sm shrink-0">Room</span>
                  <input className="flex-1 px-2 py-1 bg-neutral-800 rounded min-w-0" value={room} onChange={e=>setRoom(e.target.value)} />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body 2 colonne */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 mt-6">
        <div className="grid lg:grid-cols-[340px,minmax(0,1fr)] gap-6 items-start">
          {/* Colonna sinistra */}
          <div className="grid gap-6">
            {/* Nuovo Clock */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-2">Nuovo Clock</h2>
              <div className="grid gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <input id="nc-name" placeholder="Nome" className="px-2 py-1 bg-neutral-800 rounded col-span-2 min-w-0" />
                  <select id="nc-type" className="px-2 py-1 bg-neutral-800 rounded min-w-0">
                    {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input id="nc-seg" type="number" min={2} defaultValue={6} className="px-2 py-1 bg-neutral-800 rounded min-w-0" />
                  <input id="nc-color" type="color" defaultValue="#94a3b8" className="px-2 py-1 bg-neutral-800 rounded h-9 min-w-0" />
                  <input id="nc-icon" placeholder="Icona (emoji)" className="px-2 py-1 bg-neutral-800 rounded col-span-2 min-w-0" />
                  <input id="nc-tags" placeholder="tag separati da spazio" className="px-2 py-1 bg-neutral-800 rounded col-span-2 min-w-0" />
                  <input id="nc-notes" placeholder="Note (breve)" className="px-2 py-1 bg-neutral-800 rounded col-span-2 min-w-0" />
                </div>
                <button
                  className="mt-1 px-3 py-2 rounded bg-neutral-200 text-neutral-900 font-semibold"
                  onClick={()=>{
                    const name = (document.getElementById('nc-name') as HTMLInputElement).value || 'Nuovo Clock';
                    const type = (document.getElementById('nc-type') as HTMLSelectElement).value as ClockType;
                    const segments = parseInt((document.getElementById('nc-seg') as HTMLInputElement).value||'6');
                    const color = (document.getElementById('nc-color') as HTMLInputElement).value || '#94a3b8';
                    const icon = (document.getElementById('nc-icon') as HTMLInputElement).value || '🕒';
                    const tags = ((document.getElementById('nc-tags') as HTMLInputElement).value || '').split(' ').filter(Boolean);
                    const notes = (document.getElementById('nc-notes') as HTMLInputElement).value || '';
                    upsertClock({ name, type, segments, color, icon, tags, notes });
                    ['nc-name','nc-tags','nc-notes'].forEach(id => { const el = document.getElementById(id) as HTMLInputElement; if (el) el.value=''; });
                  }}
                >
                  Crea
                </button>
              </div>
            </div>

            {/* Filtri */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-2">Filtri</h2>
              <div className="grid gap-2">
                <input placeholder="Cerca per nome o tag…" value={search} onChange={e=>setSearch(e.target.value)} className="px-2 py-1 bg-neutral-800 rounded min-w-0" />
                <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value as any)} className="px-2 py-1 bg-neutral-800 rounded min-w-0">
                  <option value="Tutti">Tutti i tipi</option>
                  {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="Filtro su un tag esatto" value={tagFilter} onChange={e=>setTagFilter(e.target.value)} className="px-2 py-1 bg-neutral-800 rounded min-w-0" />
                <div className="flex gap-2 flex-wrap">
                  <button className="flex-1 px-3 py-1 rounded bg-neutral-700 min-w-[120px]" onClick={doUndo}>↶ Undo</button>
                  <button className="flex-1 px-3 py-1 rounded bg-neutral-700 min-w-[120px]" onClick={doRedo}>↷ Redo</button>
                </div>
              </div>
            </div>
          </div>

          {/* Colonna destra: lista */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(c => (
              <div key={c.id} className="rounded-2xl border border-neutral-800 p-3 space-y-3 bg-neutral-900/40 overflow-visible">
                {/* Header card */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl select-none">{c.icon || '🕒'}</span>
                  <input
                    className="flex-1 min-w-0 bg-transparent font-semibold px-2 py-1 rounded hover:bg-neutral-800/50"
                    value={c.name}
                    onChange={e=> upsertClock({ id: c.id, name: e.target.value })}
                  />
                  <button onClick={()=>toggleVisible(c.id)} className="px-2 py-1 rounded hover:bg-neutral-800" title="Visibile sul display">
                    {c.visible ? '👁️' : '🙈'}
                  </button>
                  <button onClick={()=>deleteClock(c.id)} className="px-2 py-1 rounded hover:bg-neutral-800" title="Elimina">✕</button>
                </div>

                {/* Core: mobile a colonna, da md affiancati */}
                <div className="grid gap-3 items-start md:grid-cols-[auto,1fr]">
                  <div className="justify-self-center md:justify-self-start">
                    <RingClock
                      segments={c.segments}
                      filled={c.filled}
                      color={c.color}
                      label={c.name}
                      onClick={()=>applyDelta(c.id, +1)}
                      onShiftClick={()=>applyDelta(c.id, -1)}
                    />
                  </div>
                  <div className="grid gap-2 min-w-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 min-w-0">
                        <span className="w-16 text-sm shrink-0">Tipo</span>
                        <select
                          className="flex-1 px-2 py-1 bg-neutral-800 rounded min-w-0"
                          value={c.type}
                          onChange={e=> upsertClock({ id: c.id, type: e.target.value as ClockType })}
                        >
                          {['Evento','Missione','Campagna','Corruzione','Legame','Personalizzato'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 min-w-0">
                        <span className="w-20 text-sm shrink-0">Segmenti</span>
                        <input
                          type="number" min={2} value={c.segments}
                          onChange={e=>{
                            const seg = clamp(parseInt(e.target.value||'2'), 2, 48);
                            upsertClock({ id: c.id, segments: seg, filled: Math.min(c.filled, seg) });
                          }}
                          className="w-[120px] px-2 py-1 bg-neutral-800 rounded"
                        />
                      </label>
                      <label className="flex items-center gap-2 min-w-0">
                        <span className="w-16 text-sm shrink-0">Colore</span>
                        <input
                          type="color" value={c.color || '#94a3b8'}
                          onChange={e=> upsertClock({ id: c.id, color: e.target.value })}
                          className="h-9 w-12 bg-neutral-800 rounded"
                        />
                      </label>
                      <label className="flex items-center gap-2 min-w-0">
                        <span className="w-16 text-sm shrink-0">Icona</span>
                        <input
                          value={c.icon || ''} placeholder="emoji"
                          onChange={e=> upsertClock({ id: c.id, icon: e.target.value })}
                          className="flex-1 px-2 py-1 bg-neutral-800 rounded min-w-0"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                      <input
                        placeholder="Etichetta tick (Invio = +1)"
                        className="px-2 py-1 bg-neutral-800 rounded min-w-0"
                        onKeyDown={(e)=>{
                          if (e.key==='Enter'){
                            const v=(e.target as HTMLInputElement).value.trim();
                            if (v) { applyDelta(c.id, +1, v); (e.target as HTMLInputElement).value=''; }
                          }
                        }}
                      />
                      <button className="px-2 py-1 rounded bg-neutral-700" onClick={()=>applyDelta(c.id, +2)}>+2</button>
                      <button className="px-2 py-1 rounded bg-neutral-700" onClick={()=>applyDelta(c.id, +3)}>+3</button>
                      <button className="px-2 py-1 rounded bg-neutral-700" onClick={()=>applyDelta(c.id, -1)}>−1</button>
                    </div>
                  </div>
                </div>

                {/* Metadati */}
                <div className="grid gap-2">
                  <label className="flex items-center gap-2 min-w-0">
                    <span className="w-16 text-sm shrink-0">Tag</span>
                    <input
                      value={(c.tags||[]).join(' ')}
                      onChange={e=> upsertClock({ id: c.id, tags: e.target.value.split(' ').filter(Boolean) })}
                      placeholder="separati da spazio"
                      className="flex-1 px-2 py-1 bg-neutral-800 rounded min-w-0"
                    />
                  </label>
                  <label className="flex items-center gap-2 min-w-0">
                    <span className="w-16 text-sm shrink-0">Note</span>
                    <input
                      value={c.notes || ''}
                      onChange={e=> upsertClock({ id: c.id, notes: e.target.value })}
                      placeholder="markdown breve"
                      className="flex-1 px-2 py-1 bg-neutral-800 rounded min-w-0"
                    />
                  </label>
                  <label className="flex items-center gap-2 min-w-0">
                    <span className="w-24 text-sm shrink-0">onComplete</span>
                    <input
                      value={c.onComplete || ''}
                      onChange={e=> upsertClock({ id: c.id, onComplete: e.target.value })}
                      placeholder="conseguenza al completamento"
                      className="flex-1 px-2 py-1 bg-neutral-800 rounded min-w-0"
                    />
                  </label>
                </div>

                {/* Concat editor */}
                <ConcatEditor clock={c} allClocks={clocks} onChange={(r)=> upsertClock({ id: c.id, concat: r })} />
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="text-sm opacity-70 p-6 border border-neutral-800 rounded-2xl">
                Nessun clock corrisponde ai filtri. Crea un nuovo clock o azzera i filtri.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------- Concat Editor ----------------- */
function ConcatEditor({
  clock, allClocks, onChange
}: { clock: Clock; allClocks: Clock[]; onChange: (rules: ConcatRule[]) => void }) {
  const rules = clock.concat ?? [];
  const options = allClocks.filter(c => c.id !== clock.id);

  function updateRule(i: number, patch: Partial<ConcatRule>){
    const next = rules.slice(); next[i] = { ...next[i], ...patch }; onChange(next);
  }
  function addRule(){ onChange([...(rules||[]), { relation:'after', targets:[], on:'advance', ratio:1, minStep:1, carryMode:'clamp', visibility:'noChange', note:'' }]); }
  function removeRule(i: number){ const next = rules.slice(); next.splice(i,1); onChange(next); }

  return (
    <div className="rounded-xl border border-neutral-800 p-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-semibold">Concatenazioni</div>
        <button className="px-2 py-1 rounded bg-neutral-800" onClick={addRule}>+ Regola</button>
      </div>
      {rules.length === 0 && <div className="text-sm opacity-70 mt-2">Nessuna regola.</div>}
      <div className="mt-2 grid gap-3">
        {rules.map((r, i)=>(
          <div key={i} className="grid md:grid-cols-2 xl:grid-cols-4 gap-2 items-start p-2 rounded bg-neutral-900/60 overflow-visible">
            <label className="flex items-center gap-2 min-w-0">
              <span className="w-20 text-sm shrink-0">Relation</span>
              <select value={r.relation} onChange={e=>updateRule(i, { relation: e.target.value as ConcatRelation })} className="flex-1 px-2 py-1 bg-neutral-800 rounded min-w-0">
                <option value="after">after</option>
                <option value="parallel">parallel</option>
                <option value="gate">gate</option>
                <option value="mirror">mirror</option>
              </select>
            </label>
            <label className="flex items-center gap-2 min-w-0">
              <span className="w-20 text-sm shrink-0">On</span>
              <select value={r.on} onChange={e=>updateRule(i, { on: e.target.value as ConcatOn })} className="flex-1 px-2 py-1 bg-neutral-800 rounded min-w-0">
                <option value="advance">advance</option>
                <option value="complete">complete</option>
                <option value="regress">regress</option>
              </select>
            </label>
            <label className="flex items-center gap-2 min-w-0">
              <span className="w-20 text-sm shrink-0">Ratio</span>
              <input type="number" step="0.25" value={r.ratio ?? 1} onChange={e=>updateRule(i, { ratio: parseFloat(e.target.value||'1') })} className="w-24 px-2 py-1 bg-neutral-800 rounded" />
            </label>
            <label className="flex items-center gap-2 min-w-0">
              <span className="w-24 text-sm shrink-0">minStep</span>
              <input type="number" min={0} value={r.minStep ?? 1} onChange={e=>updateRule(i, { minStep: parseInt(e.target.value||'0') })} className="w-24 px-2 py-1 bg-neutral-800 rounded" />
            </label>
            <label className="flex items-center gap-2 min-w-0">
              <span className="w-24 text-sm shrink-0">Carry</span>
              <select value={r.carryMode ?? 'clamp'} onChange={e=>updateRule(i, { carryMode: e.target.value as CarryMode })} className="flex-1 px-2 py-1 bg-neutral-800 rounded min-w-0">
                <option value="clamp">clamp</option>
                <option value="none">none</option>
                <option value="overflow">overflow</option>
              </select>
            </label>
            <label className="flex items-center gap-2 min-w-0">
              <span className="w-24 text-sm shrink-0">Visibilità</span>
              <select value={r.visibility ?? 'noChange'} onChange={e=>updateRule(i, { visibility: e.target.value as VisibilityPropagation })} className="flex-1 px-2 py-1 bg-neutral-800 rounded min-w-0">
                <option value="noChange">noChange</option>
                <option value="inherit">inherit</option>
                <option value="forceVisible">forceVisible</option>
              </select>
            </label>

            <div className="md:col-span-2 xl:col-span-4">
              <div className="text-xs opacity-80 mb-1">Targets</div>
              <div className="flex flex-wrap gap-2">
                {options.map(o=>{
                  const on = (r.targets||[]).includes(o.id);
                  return (
                    <label key={o.id} className={`px-2 py-1 rounded border cursor-pointer ${on ? 'border-emerald-500' : 'border-neutral-700'}`}>
                      <input
                        type="checkbox" className="mr-1"
                        checked={on}
                        onChange={(e)=>{
                          const set = new Set(r.targets||[]);
                          if (e.target.checked) set.add(o.id); else set.delete(o.id);
                          updateRule(i, { targets: Array.from(set) });
                        }}
                      />
                      {o.icon || '🕒'} {o.name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-2 xl:col-span-4 grid md:grid-cols-[1fr_auto] gap-2">
              <input
                placeholder="Nota/spiegazione"
                value={r.note || ''}
                onChange={e=>updateRule(i, { note: e.target.value })}
                className="px-2 py-1 bg-neutral-800 rounded"
              />
              <button className="px-2 py-1 rounded bg-neutral-800" onClick={()=>removeRule(i)}>Rimuovi</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
