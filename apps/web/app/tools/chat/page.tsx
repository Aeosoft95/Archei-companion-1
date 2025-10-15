'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ChatMsg = { t:'chat:msg'; room:string; nick:string; text:string; ts:number; channel:string };
type ChatPres = { t:'chat:presence'; room:string; nicks:string[] };

const WS_DEFAULT = process.env.NEXT_PUBLIC_WS_DEFAULT || '';
const ROOM_DEFAULT = process.env.NEXT_PUBLIC_ROOM_DEFAULT || 'demo';

// ---- DICE HELPERS ----
function computeThreshold(total: number): number {
  if (total >= 20) return 3;
  if (total >= 10) return 4;
  if (total >= 6) return 5;
  return 6; // 1-5
}
function levelLabel(successes: number): string {
  if (successes >= 3) return 'Critico';
  if (successes >= 2) return 'Pieno';
  if (successes >= 1) return 'Parziale';
  return 'Fallimento';
}

export default function ChatPage() {
  const [nick, setNick] = useState('');
  const [room, setRoom] = useState(ROOM_DEFAULT);
  const [wsUrl, setWsUrl] = useState(WS_DEFAULT);
  const [connected, setConnected] = useState<'idle'|'connecting'|'open'|'closed'|'error'>('idle');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [who, setWho] = useState<string[]>([]);
  const [text, setText] = useState('');
  const wsRef = useRef<WebSocket|null>(null);
  const listRef = useRef<HTMLDivElement|null>(null);

  // DICE state
  const [totalDice, setTotalDice] = useState<number>(5);
  const realDice = useMemo(()=> Math.max(0, Math.min(5, totalDice || 0)), [totalDice]);
  const threshold = useMemo(()=> computeThreshold(totalDice || 0), [totalDice]);

  // load prefs
  useEffect(()=>{
    try {
      const n = localStorage.getItem('archei:nick') || '';
      const u = localStorage.getItem('archei:wsurl') || WS_DEFAULT;
      const r = localStorage.getItem('archei:room')  || ROOM_DEFAULT;
      setNick(n); setWsUrl(u); setRoom(r);
    } catch {}
  }, []);
  // save prefs
  useEffect(()=>{ try {
    localStorage.setItem('archei:nick', nick);
    localStorage.setItem('archei:wsurl', wsUrl);
    localStorage.setItem('archei:room', room);
  } catch {} }, [nick, wsUrl, room]);

  // autoscroll
  useEffect(()=>{ listRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }); }, [messages.length]);

  // WS connect
  useEffect(()=>{
    if (!nick || !wsUrl.startsWith('ws')) { setConnected('idle'); return; }
    setConnected('connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = ()=>{ setConnected('open'); ws.send(JSON.stringify({ t:'chat:join', room, nick })); };
    ws.onclose = ()=> setConnected('closed');
    ws.onerror = ()=> setConnected('error');
    ws.onmessage = (ev)=>{
      try {
        const data = JSON.parse(ev.data);
        if (data.t === 'chat:msg') setMessages(prev => [...prev, data as ChatMsg]);
        else if (data.t === 'chat:presence') setWho((data as ChatPres).nicks || []);
      } catch {}
    };
    return ()=> { try { ws.close(); } catch {} };
  }, [nick, wsUrl, room]);

  const canSend = useMemo(()=> connected==='open' && nick.trim().length>0 && text.trim().length>0, [connected, nick, text]);

  const send = ()=>{
    if (!canSend || !wsRef.current) return;
    const msg: ChatMsg = { t:'chat:msg', room, nick, text: text.trim(), ts: Date.now(), channel:'global' };
    try { wsRef.current.send(JSON.stringify(msg)); } catch {}
    setText('');
  };

  // ---- Dice Roll action: tira solo i "reali" (max 5), i teorici abbassano soglia ----
  const rollDice = ()=>{
    if (!wsRef.current || connected!=='open') return;
    const rolls: number[] = [];
    for (let i=0;i<realDice;i++) {
      rolls.push(1 + Math.floor(Math.random()*6));
    }
    const successes = rolls.filter(v => v >= threshold).length;

    // critico speciale se 5/5 successi
    const crit5 = (realDice === 5 && successes === 5);
    const level = crit5 ? 'Critico' : levelLabel(successes);

    const txt =
      `🎲 ${nick || 'Anon'} lancia ${totalDice}d (reali ${realDice}). ` +
      `Soglia ${threshold}+. Risultati: [${rolls.join(', ')}] → ` +
      `Successi: ${successes} → Esito: ${level}${crit5 ? ' (5 su 5!)' : ''}`;

    const msg: ChatMsg = { t:'chat:msg', room, nick: nick || 'Anon', text: txt, ts: Date.now(), channel:'global' };
    try { wsRef.current.send(JSON.stringify(msg)); } catch {}
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
      {/* SINISTRA: Connessione + Tiradadi */}
      <aside className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3 h-fit">
        <div className="text-sm uppercase tracking-wide opacity-70 mb-2">Connessione</div>
        <div className="grid gap-2 mb-4">
          <label className="grid gap-1">
            <span className="text-xs opacity-70">Nickname</span>
            <input value={nick} onChange={e=>setNick(e.target.value)} className="px-2 py-2 bg-neutral-800 rounded" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs opacity-70">WS URL</span>
            <input value={wsUrl} onChange={e=>setWsUrl(e.target.value)} placeholder="ws://IP:8787" className="px-2 py-2 bg-neutral-800 rounded" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs opacity-70">Room</span>
            <input value={room} onChange={e=>setRoom(e.target.value)} className="px-2 py-2 bg-neutral-800 rounded" />
          </label>
          <div className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700 w-fit">
            {connected==='open' ? '🟢 Connesso'
              : connected==='connecting' ? '🟡 Connessione…'
              : connected==='error' ? '🔴 Errore'
              : connected==='closed' ? '⚫ Chiuso'
              : '⚫ Inattivo'}
          </div>

          <div className="mt-2">
            <div className="text-xs opacity-70 mb-1">Presenti</div>
            <div className="flex flex-wrap gap-2">
              {who.length === 0 ? <span className="opacity-60 text-xs">Nessuno</span>
                : who.map(n => <span key={n} className="px-2 py-1 bg-neutral-800 rounded text-xs">{n}</span>)}
            </div>
          </div>
        </div>

        <hr className="border-neutral-800 my-3" />

        <div className="text-sm uppercase tracking-wide opacity-70 mb-2">Tiradadi (ARCHEI)</div>
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-xs opacity-70">Dadi totali (teorici+reali)</span>
            <div className="flex items-center gap-2">
              <button className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
                      onClick={()=>setTotalDice(v=>Math.max(1,(v||1)-1))}>−</button>
              <input type="number" min={1} className="w-24 px-2 py-2 bg-neutral-800 rounded text-center"
                     value={totalDice} onChange={e=>setTotalDice(Math.max(1, parseInt(e.target.value||'1')))} />
              <button className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
                      onClick={()=>setTotalDice(v=>Math.min(999,(v||1)+1))}>+</button>
            </div>
          </label>

          <div className="text-xs opacity-80">
            Soglia: <b>{threshold}+</b> · Dadi reali: <b>{realDice}</b> (max 5) · Teorici: <b>{Math.max(0,(totalDice||0)-realDice)}</b>
          </div>

          <button
            onClick={rollDice}
            disabled={connected!=='open' || realDice<=0}
            className="mt-1 px-3 py-2 rounded bg-neutral-200 text-neutral-900 font-semibold disabled:opacity-50"
          >
            Lancia
          </button>
        </div>
      </aside>

      {/* DESTRA: Chat */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3 min-h-[60vh] flex flex-col">
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
          {messages.map((m, i)=>(
            <div key={i} className="px-3 py-2 rounded-xl bg-neutral-800">
              <div className="text-xs opacity-70">
                <b>{m.nick}</b> · {new Date(m.ts).toLocaleTimeString()}
              </div>
              <div className="whitespace-pre-wrap break-words">{m.text}</div>
            </div>
          ))}
          {messages.length === 0 && (<div className="opacity-60 text-sm">Nessun messaggio.</div>)}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={e=>setText(e.target.value)}
            onKeyDown={e=>{ if (e.key==='Enter') send(); }}
            placeholder={connected==='open' ? 'Scrivi un messaggio e premi Invio…' : 'Connettiti per inviare…'}
            className="flex-1 px-3 py-2 bg-neutral-800 rounded"
          />
          <button onClick={send} disabled={!canSend}
                  className="px-3 py-2 rounded bg-neutral-200 text-neutral-900 font-semibold disabled:opacity-50">
            Invia
          </button>
        </div>
      </section>
    </div>
  );
}
