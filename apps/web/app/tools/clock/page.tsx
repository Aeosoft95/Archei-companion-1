'use client';
/**
 * ARCHEI — CLOCKS (GM) — spec v1.0
 * - Clock circolari a segmenti
 * - Advance/Regress: click +1 / Shift+Click -1; pulsanti +2/+3
 * - Triggers (etichette brevi dei tick)
 * - Concat: after | parallel | gate | mirror
 * - Visibilità, tag, tipo, note markdown brevi
 * - Undo / Redo di sessione
 * - Broadcast locale (solo visibili) + evidenziazioni
 * - WS opzionale (stanza) con payload simili alla pseudo_api_eventi
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
  targets: string[];      // target clock ids
  on: ConcatOn;
  ratio?: number;         // default 1
  minStep?: number;       // default 1 se delta>0
  carryMode?: CarryMode;  // default 'clamp'
  visibility?: VisibilityPropagation; // default 'noChange'
  note?: string;
};

export type Clock = {
  id: string;
  name: string;
  type: ClockType;
  segments: number;       // consigliati 4|6|8|12
  filled: number;         // 0..segments
  visible: boolean;       // default true
  icon?: string;          // emoji / short code
  color?: string;         // hex
  notes?: string;         // breve markdown
  tags?: string[];
  triggers?: string[];    // etichette tick
  onComplete?: string;    // markdown breve
  concat?: ConcatRule[];
};

type DisplayEvent =
  | { t: 'DISPLAY_CLOCKS_STATE'; clocks: Clock[] }
  | { t: 'DISPLAY_HIGHLIGHT'; clockId: string; type: 'advance' | 'complete' };

type ClientEvent =
  | { t: 'CLOCK_CREATE'; clock: Clock }
  | { t: 'CLOCK_UPDATE'; clockId: string; delta?: number; fields?: Partial<Clock> }
  | { t: 'CLOCK_DELETE'; clockId: string }
  | { t: 'CLOCK_TOGGLE_VIS'; clockId: string; visible: boolean }
  | { t: 'CLOCK_ADVANCE_ROUND'; group?: string };

// ----------------- utils -----------------
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (n: number) => Math.round(n);

function validate(clock: Clock): Clock {
  const segments = Math.max(2, Math.floor(clock.segments));
  const filled = clamp(Math.floor(clock.filled), 0, segments);
  return { ...clock, segments, filled };
}

function isComplete(c: Clock) {
  return c.filled >= c.segments;
}

function advanceClock(c: Clock, delta: number): Clock {
  const before = c.filled;
  const after = clamp(before + delta, 0, c.segments);
  return validate({ ...c, filled: after });
}

function percent(c: Clock) {
  return c.segments > 0 ? c.filled / c.segments : 0;
}

function uuid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `ck_${Math.random().toString(36).slice(2, 10)}`;
}

// ----------------- Broadcast helpers -----------------
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
        sock.onerror = () => { try { sock?.close(); } catch { } };
        wsRef.current = sock;
      } catch {
        const delay = Math.min(1000 * (2 ** attempt++), 10000);
        setTimeout(connect, delay);
      }
    };

    connect();
    return () => { try { wsRef.current?.close(); } catch { } };
  }, [wsEnabled, wsUrl]);

  function postLocal(ev: DisplayEvent) {
    try {
      const bc = new BroadcastChannel('archei-clocks');
      bc.postMessage(ev);
      bc.close();
    } catch { }
  }

  function postWS(ev: DisplayEvent | ClientEvent) {
    if (!wsEnabled || !wsRef.current || wsRef.current.readyState !== wsRef.current.OPEN) return false;
    try {
      wsRef.current.send(JSON.stringify(room ? { room, ...ev } : ev));
      return true;
    } catch { return false; }
  }

  return { wsReady, postLocal, postWS };
}

// ----------------- CONCAT ENGINE -----------------
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
    if (delta > 0 && pass < 1 && (rule.minStep ?? 1) >= 1) {
      pass = rule.minStep ?? 1;
    }
    if (pass === 0) continue;

    for (const targetId of rule.targets) {
      const tgt = ctx.getClock(targetId);
      if (!tgt) continue;

      // visibilità al primo trigger
      if (rule.visibility === 'forceVisible' && !tgt.visible) {
        ctx.apply(targetId, 0, { cause: `vis:force(${src.name})` });
      } else if (rule.visibility === 'inherit' && !tgt.visible && src.visible) {
        ctx.apply(targetId, 0, { cause: `vis:inherit(${src.name})` });
      }

      // carryMode
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
        if (n && isComplete(n) && pass > space) {
          ctx.markComplete(targetId);
          // ulteriore propagazione del surplus: fuori scope minimo
        }
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

      let boost = rule.minStep && rule.minStep >= 1
        ? rule.minStep
        : round((tgt.segments) * ratio);

      boost = Math.max(0, boost);
      if (boost > 0) ctx.apply(targetId, boost, { cause: `complete:${src.name}` });
    }
  }
}

function applyConcat_onRegress(src: Clock, delta: number, ctx: ConcatContext) {
  if (!src.concat?.length || delta >= 0) return;
  for (const rule of src.concat) {
    if (rule.on !== 'regress') continue;
    const ratio = rule.ratio ?? 1;
    let pass = round(delta * ratio); // delta negativo
    if (pass === 0) pass = -1; // minimo segnale
    for (const targetId of rule.targets) {
      ctx.apply(targetId, pass, { cause: `regress:${src.name}` });
    }
  }
}

// ----------------- UI: SVG CLOCK -----------------
function RingClock({
  segments, filled, color, onClick, onShiftClick, label,
}: {
  segments: number; filled: number; color?: string;
  onClick?: ()=>void; onShiftClick?: ()=>void; label?: string;
}) {
  const r = 42;
  const stroke = 10;
  const size = 120;
  const cx = size/2, cy = size/2;

  const gap = 4; // gap angolare (deg) tra segmenti
  const full = 360;
  const segSpan = (full / segments) - gap;

  const arcs = [];
  let start = -90; // parte in alto
  for (let i=0;i<segments;i++){
    const s = start + gap/2;
    const e = s + segSpan;
    arcs.push({ s, e, on: i < filled });
    start += full / segments;
  }

  function polar(a:number){
    const rad = (a * Math.PI)/180;
    return [cx + r*Math.cos(rad), cy + r*Math.sin(rad)];
  }

  return (
    <svg
      width={size} height={size}
      className="cursor-pointer"
      role="img"
      aria-label={label||'Clock'}
      onClick={(e)=> e.shiftKey ? onShiftClick?.() : onClick?.()}
    >
      {/* background ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth={stroke} />
      {/* segments */}
      {arcs.map((a, idx)=>{
        const [x1,y1] = polar(a.s);
        const [x2,y2] = polar(a.e);
        const largeArc = (a.e - a.s) > 180 ? 1 : 0;
        return (
          <path
            key={idx}
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            stroke={a.on ? (color || '#7dd3fc') : '#444'}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
      <text x={cx} y={cy+5} textAnchor="middle" className="fill-neutral-200" style={{ fontSize: 18, fontWeight: 700 }}>
        {filled}/{segments}
      </text>
    </svg>
  );
}

// ----------------- PAGE -----------------
export default function Page(){
  return (
    <GuardRole allow="gm">
      <ClockManager />
    </GuardRole>
  );
}

function ClockManager(){
  // WS opzionale
  const [enableWS, setEnableWS] = useState(false);
  const [wsUrl, setWsUrl] = useState<string>(process.env.NEXT_PUBLIC_WS_DEFAULT || 'ws://127.0.0.1:8787');
  const [room, setRoom] = useState<string>('demo');

  const { wsReady, postLocal, postWS } = useBroadcast(enableWS, wsUrl, room);

  // Stato principale
  const [clocks, setClocks] = useState<Clock[]>([
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
        {
          relation: 'after',
          targets: ['ck_ombre'],
          on: 'complete',
          ratio: 1,
          minStep: 6,
          carryMode: 'clamp',
          visibility: 'forceVisible',
          note: 'A completamento del Portale, le Ombre si attivano subito a 6/8.'
        }
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
      onComplete: 'Campo travolto; i PG devono ritirarsi o cambiare obiettivo.'
    })
  ]);

  // Storico undo/redo — **nessun hook chiamato qui dentro**
  const undoStack = useRef<Clock[][]>([]);
  const redoStack = useRef<Clock[][]>([]);

  function deepCloneState(list: Clock[]): Clock[] {
    return list.map(c => ({
      ...c,
      tags: c.tags ? [...c.tags] : undefined,
      triggers: c.triggers ? [...c.triggers] : undefined,
      concat: c.concat ? c.concat.map(r => ({ ...r, targets: [...r.targets] })) : undefined,
    }));
  }

  function pushHistory(prev: Clock[]) {
    undoStack.current.push(deepCloneState(prev));
    // azzera redo quando fai una nuova azione
    redoStack.current = [];
  }

  function doUndo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    // salva lo stato attuale in redo
    redoStack.current.push(deepCloneState(clocks));
    setClocks(prev.map(validate));
    broadcastState(prev);
  }

  function doRedo() {
    const next = redoStack.current.pop();
    if (!next) return;
    // metti lo stato corrente nello stack undo
    undoStack.current.push(deepCloneState(clocks));
    setClocks(next.map(validate));
    broadcastState(next);
  }

  // Helpers
  const byId = (id: string) => clocks.find(c => c.id === id);

  function broadcastState(state?: Clock[]) {
    const visibleOnly = (state ?? clocks).filter(c => c.visible).map(validate);
    const ev: DisplayEvent = { t: 'DISPLAY_CLOCKS_STATE', clocks: visibleOnly };
    postLocal(ev);
    postWS(ev);
  }
  function highlight(clockId: string, type: 'advance' | 'complete') {
    const ev: DisplayEvent = { t: 'DISPLAY_HIGHLIGHT', clockId, type };
    postLocal(ev);
    postWS(ev);
  }

  // Mutazioni di base con concat
  function applyDelta(id: string, delta: number, label?: string) {
    setClocks(prev => {
      pushHistory(prev);
      const map = new Map(prev.map(c => [c.id, c]));
      const ctx: ConcatContext = {
        getClock: (cid) => map.get(cid),
        apply: (cid, d, meta) => {
          const curr = map.get(cid);
          if (!curr) return;
          const next = advanceClock(curr, d);
          if (meta?.cause?.startsWith('vis:')) {
            if (meta.cause.includes('force')) map.set(cid, { ...next, visible: true });
            else if (meta.cause.includes('inherit') && curr.visible === false) map.set(cid, { ...next, visible: true });
            else map.set(cid, next);
          } else {
            map.set(cid, next);
          }
        },
        markComplete: (cid) => {
          const curr = map.get(cid);
          if (!curr) return;
          const next = validate({ ...curr, filled: curr.segments });
          map.set(cid, next);
        }
      };

      // etichetta tick
      if (label && label.trim()) {
        const src = map.get(id);
        if (src) map.set(id, { ...src, triggers: [...(src.triggers ?? []), label.trim()] });
      }

      const srcBefore = map.get(id)!;
      const srcAfter = advanceClock(srcBefore, delta);
      map.set(id, srcAfter);

      // CONCAT
      if ((srcAfter.filled !== srcBefore.filled) && srcBefore.concat?.length) {
        if (delta > 0) applyConcat_onAdvance(srcBefore, delta, ctx);
        if (delta < 0) applyConcat_onRegress(srcBefore, delta, ctx);
      }

      // COMPLETE
      if (!isComplete(srcBefore) && isComplete(srcAfter)) {
        highlight(id, 'complete');
        applyConcat_onComplete(srcBefore, ctx);
      } else if (delta > 0) {
        highlight(id, 'advance');
      }

      const nextState = Array.from(map.values()).map(validate);
      // broadcast solo visibili
      setTimeout(()=>broadcastState(nextState), 0);
      // evento client (opzionale)
      postWS({ t: 'CLOCK_UPDATE', clockId: id, delta });

      return nextState;
    });
  }

  function upsertClock(fields: Partial<Clock> & { id?: string }) {
    setClocks(prev => {
      pushHistory(prev);
      let out = [...prev];
      if (fields.id) {
        const idx = out.findIndex(c => c.id === fields.id);
        if (idx >= 0) {
          out[idx] = validate({ ...out[idx], ...fields });
          postWS({ t: 'CLOCK_UPDATE', clockId: out[idx].id, fields });
        } else {
          const c = validate({
            id: fields.id,
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
          out.push(c);
          postWS({ t: 'CLOCK_CREATE', clock: c });
        }
      } else {
        const c = validate({
          id: uuid(),
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
        out.push(c);
        postWS({ t: 'CLOCK_CREATE', clock: c });
      }
      setTimeout(()=>broadcastState(out), 0);
      return out;
    });
  }

  function deleteClock(id: string) {
    setClocks(prev => {
      pushHistory(prev);
      const out = prev.filter(c => c.id !== id);
      postWS({ t: 'CLOCK_DELETE', clockId: id });
      setTimeout(()=>broadcastState(out), 0);
      return out;
    });
  }

  function toggleVisible(id: string) {
    setClocks(prev => {
      pushHistory(prev);
      const out = prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c);
      const target = out.find(c => c.id === id)!;
      postWS({ t: 'CLOCK_TOGGLE_VIS', clockId: id, visible: target.visible });
      setTimeout(()=>broadcastState(out), 0);
      return out;
    });
  }

  // Filtri UI
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ClockType | 'Tutti'>('Tutti');
  const [tagFilter, setTagFilter] = useState<string>(''); // singolo tag semplice

  const filtered = useMemo(()=>{
    return clocks.filter(c => {
      if (typeFilter !== 'Tutti' && c.type !== typeFilter) return false;
      if (search && !(`${c.name} ${c.tags?.join(' ')||''}`.toLowerCase().includes(search.toLowerCase()))) return false;
      if (tagFilter && !(c.tags||[]).includes(tagFilter)) return false;
      return true;
    });
  }, [clocks, search, typeFilter, tagFilter]);

  // All'avvio: broadcast stato corrente
  useEffect(()=>{ broadcastState(); /* eslint-disable-next-line */ }, []);

  // ---- UI ----
  const typeOptions: ClockType[] = ['Evento','Missione','Campagna','Corruzione','Legame','Personalizzato'];

  return (
    <div className="grid gap-6">
      {/* HEADER */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Clock (GM)</h1>
            <p className="text-sm opacity-80">Click: <b>+1</b> • Shift+Click: <b>-1</b> • Pulsanti rapidi: <b>+2</b>/<b>+3</b> • Undo/Redo.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={enableWS} onChange={e=>setEnableWS(e.target.checked)} />
              <span className="text-sm">Invia anche via WS</span>
            </label>
            <span className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700">
              WS: {enableWS ? (wsReady ? '🟢 Online' : '🔴 Offline') : '—'}
            </span>
          </div>
        </div>

        {enableWS && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            <label className="flex items-center gap-2">
              <span className="w-24">WS URL</span>
              <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={wsUrl} onChange={e=>setWsUrl(e.target.value)} />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-24">Room</span>
              <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={room} onChange={e=>setRoom(e.target.value)} />
            </label>
          </div>
        )}
      </div>

      {/* NEW CLOCK */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">Nuovo Clock</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input id="nc-name" placeholder="Nome" className="px-2 py-1 bg-neutral-800 rounded" />
          <select id="nc-type" className="px-2 py-1 bg-neutral-800 rounded" defaultValue="Personalizzato">
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input id="nc-seg" type="number" min={2} defaultValue={6} className="px-2 py-1 bg-neutral-800 rounded" />
          <input id="nc-color" type="color" defaultValue="#94a3b8" className="px-2 py-1 bg-neutral-800 rounded h-9" />
          <input id="nc-icon" placeholder="Icona (emoji)" className="px-2 py-1 bg-neutral-800 rounded" />
          <input id="nc-tags" placeholder="tag separati da spazio" className="px-2 py-1 bg-neutral-800 rounded" />
          <input id="nc-notes" placeholder="Note (breve)" className="px-2 py-1 bg-neutral-800 rounded sm:col-span-2 lg:col-span-2" />
          <button
            className="px-3 py-1 rounded bg-neutral-700"
            onClick={()=>{
              const name = (document.getElementById('nc-name') as HTMLInputElement).value || 'Nuovo Clock';
              const type = (document.getElementById('nc-type') as HTMLSelectElement).value as ClockType;
              const segments = parseInt((document.getElementById('nc-seg') as HTMLInputElement).value||'6');
              const color = (document.getElementById('nc-color') as HTMLInputElement).value || '#94a3b8';
              const icon = (document.getElementById('nc-icon') as HTMLInputElement).value || '🕒';
              const tags = ((document.getElementById('nc-tags') as HTMLInputElement).value || '').split(' ').filter(Boolean);
              const notes = (document.getElementById('nc-notes') as HTMLInputElement).value || '';
              upsertClock({ name, type, segments, color, icon, tags, notes });
              (document.getElementById('nc-name') as HTMLInputElement).value = '';
              (document.getElementById('nc-tags') as HTMLInputElement).value = '';
              (document.getElementById('nc-notes') as HTMLInputElement).value = '';
            }}
          >Crea</button>
        </div>
      </div>

      {/* FILTRI */}
      <div className="card">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input placeholder="Cerca per nome o tag…" value={search} onChange={e=>setSearch(e.target.value)} className="px-2 py-1 bg-neutral-800 rounded" />
          <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value as any)} className="px-2 py-1 bg-neutral-800 rounded">
            <option value="Tutti">Tutti i tipi</option>
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input placeholder="Filtro per un tag esatto" value={tagFilter} onChange={e=>setTagFilter(e.target.value)} className="px-2 py-1 bg-neutral-800 rounded" />
          <div className="flex gap-2">
            <button className="px-3 py-1 rounded bg-neutral-700" onClick={doUndo}>↶ Undo</button>
            <button className="px-3 py-1 rounded bg-neutral-700" onClick={doRedo}>↷ Redo</button>
          </div>
        </div>
      </div>

      {/* LISTA CLOCKS */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map(c => (
          <div key={c.id} className="rounded-2xl border border-neutral-800 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{c.icon || '🕒'}</span>
              <input
                className="flex-1 bg-transparent font-semibold px-2 py-1 rounded hover:bg-neutral-800/50"
                value={c.name}
                onChange={e=> upsertClock({ id: c.id, name: e.target.value })}
              />
              <button onClick={()=>toggleVisible(c.id)} className="px-2 py-1 rounded hover:bg-neutral-800" title="Visibile sul display">
                {c.visible ? '👁️' : '🙈'}
              </button>
              <button onClick={()=>deleteClock(c.id)} className="px-2 py-1 rounded hover:bg-neutral-800" title="Elimina">✕</button>
            </div>

            <div className="flex items-center gap-3">
              <RingClock
                segments={c.segments}
                filled={c.filled}
                color={c.color}
                label={c.name}
                onClick={()=>applyDelta(c.id, +1)}
                onShiftClick={()=>applyDelta(c.id, -1)}
              />
              <div className="flex-1 grid gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2">
                    <span className="w-16">Tipo</span>
                    <select
                      className="flex-1 px-2 py-1 bg-neutral-800 rounded"
                      value={c.type}
                      onChange={e=> upsertClock({ id: c.id, type: e.target.value as ClockType })}
                    >
                      {['Evento','Missione','Campagna','Corruzione','Legame','Personalizzato'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-16">Segmenti</span>
                    <input
                      type="number" min={2} value={c.segments}
                      onChange={e=>{
                        const seg = clamp(parseInt(e.target.value||'2'), 2, 48);
                        upsertClock({ id: c.id, segments: seg, filled: Math.min(c.filled, seg) });
                      }}
                      className="w-24 px-2 py-1 bg-neutral-800 rounded"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-16">Colore</span>
                    <input
                      type="color" value={c.color || '#94a3b8'}
                      onChange={e=> upsertClock({ id: c.id, color: e.target.value })}
                      className="h-9 w-12 bg-neutral-800 rounded"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-16">Icona</span>
                    <input
                      value={c.icon || ''} placeholder="emoji"
                      onChange={e=> upsertClock({ id: c.id, icon: e.target.value })}
                      className="flex-1 px-2 py-1 bg-neutral-800 rounded"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                  <input
                    placeholder="Etichetta tick (es: 'fallimento furtività')"
                    className="px-2 py-1 bg-neutral-800 rounded"
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

            {/* TAGS & NOTES */}
            <div className="grid gap-2">
              <label className="flex items-center gap-2">
                <span className="w-16">Tag</span>
                <input
                  value={(c.tags||[]).join(' ')}
                  onChange={e=> upsertClock({ id: c.id, tags: e.target.value.split(' ').filter(Boolean) })}
                  placeholder="separati da spazio"
                  className="flex-1 px-2 py-1 bg-neutral-800 rounded"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-16">Note</span>
                <input
                  value={c.notes || ''}
                  onChange={e=> upsertClock({ id: c.id, notes: e.target.value })}
                  placeholder="markdown breve"
                  className="flex-1 px-2 py-1 bg-neutral-800 rounded"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-16">onComplete</span>
                <input
                  value={c.onComplete || ''}
                  onChange={e=> upsertClock({ id: c.id, onComplete: e.target.value })}
                  placeholder="conseguenza al completamento"
                  className="flex-1 px-2 py-1 bg-neutral-800 rounded"
                />
              </label>
            </div>

            {/* CONCAT (editor semplice) */}
            <ConcatEditor
              clock={c}
              allClocks={clocks}
              onChange={(newRules)=> upsertClock({ id: c.id, concat: newRules })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ConcatEditor({
  clock, allClocks, onChange
}: { clock: Clock; allClocks: Clock[]; onChange: (rules: ConcatRule[]) => void }) {
  const rules = clock.concat ?? [];

  function updateRule(i: number, patch: Partial<ConcatRule>){
    const next = rules.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function addRule(){
    onChange([...(rules||[]), { relation: 'after', targets: [], on: 'advance', ratio: 1, minStep: 1, carryMode: 'clamp', visibility: 'noChange', note: '' }]);
  }
  function removeRule(i: number){
    const next = rules.slice(); next.splice(i,1); onChange(next);
  }

  const options = allClocks.filter(c => c.id !== clock.id);

  return (
    <div className="rounded-xl border border-neutral-800 p-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Concatenazioni</div>
        <button className="px-2 py-1 rounded bg-neutral-800" onClick={addRule}>+ Regola</button>
      </div>
      {rules.length === 0 && <div className="text-sm opacity-70 mt-2">Nessuna regola. Aggiungi una relazione per collegare clock.</div>}
      <div className="mt-2 grid gap-3">
        {rules.map((r, i)=>(
          <div key={i} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 items-start p-2 rounded bg-neutral-900/60">
            <label className="flex items-center gap-2">
              <span className="w-20">Relation</span>
              <select value={r.relation} onChange={e=>updateRule(i, { relation: e.target.value as ConcatRelation })} className="flex-1 px-2 py-1 bg-neutral-800 rounded">
                <option value="after">after</option>
                <option value="parallel">parallel</option>
                <option value="gate">gate</option>
                <option value="mirror">mirror</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-20">On</span>
              <select value={r.on} onChange={e=>updateRule(i, { on: e.target.value as ConcatOn })} className="flex-1 px-2 py-1 bg-neutral-800 rounded">
                <option value="advance">advance</option>
                <option value="complete">complete</option>
                <option value="regress">regress</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-20">Ratio</span>
              <input type="number" step="0.25" value={r.ratio ?? 1} onChange={e=>updateRule(i, { ratio: parseFloat(e.target.value||'1') })} className="w-24 px-2 py-1 bg-neutral-800 rounded" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-24">minStep</span>
              <input type="number" min={0} value={r.minStep ?? 1} onChange={e=>updateRule(i, { minStep: parseInt(e.target.value||'0') })} className="w-24 px-2 py-1 bg-neutral-800 rounded" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-24">Carry</span>
              <select value={r.carryMode ?? 'clamp'} onChange={e=>updateRule(i, { carryMode: e.target.value as CarryMode })} className="flex-1 px-2 py-1 bg-neutral-800 rounded">
                <option value="clamp">clamp</option>
                <option value="none">none</option>
                <option value="overflow">overflow</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-24">Visibilità</span>
              <select value={r.visibility ?? 'noChange'} onChange={e=>updateRule(i, { visibility: e.target.value as VisibilityPropagation })} className="flex-1 px-2 py-1 bg-neutral-800 rounded">
                <option value="noChange">noChange</option>
                <option value="inherit">inherit</option>
                <option value="forceVisible">forceVisible</option>
              </select>
            </label>

            {/* Targets multi-select semplice via checkbox */}
            <div className="sm:col-span-2 lg:col-span-4">
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

            <div className="sm:col-span-2 lg:col-span-4 grid sm:grid-cols-[1fr_auto] gap-2">
              <input
                placeholder="Nota/spiegazione della relazione"
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
