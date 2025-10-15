'use client';
import { useState } from 'react';
import type { WireEvent } from '@archei/shared';

export default function JoinPage(){
  const fallback = process.env.NEXT_PUBLIC_WS_DEFAULT || 'ws://127.0.0.1:8787';

  const [wsUrl, setWsUrl] = useState(fallback);
  const [room, setRoom] = useState('demo');
  const [nick, setNick] = useState('Player');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'gm'|'player'|'display'>('player');
  const [log, setLog] = useState<string[]>([]);

  function push(m: string){ setLog(l=>[m, ...l]); }

  function connect(){
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      if (role === 'gm') ws.send(JSON.stringify({ t:'setup', room, pin: pin || undefined, nick }));
      ws.send(JSON.stringify({ t:'join', room, role, nick, pin: pin || undefined } as WireEvent));
    };
    ws.onmessage = ev => {
      const msg = JSON.parse(String(ev.data));
      if (msg.t === 'joined') push(`✅ Joined ${msg.room} come ${msg.role}`);
      else if (msg.t === 'join-denied') push('❌ PIN errato');
      else if (msg.t === 'room-setup') push(`🔐 Stanza configurata (PIN ${msg.withPin?'attivo':'non impostato'})`);
      else if (msg.t === 'presence') push(`👥 Utenti: ${(msg.nicks||[]).join(', ')}`);
      else if (msg.t === 'error') push(`⚠️ ${msg.error}`);
    };
    ws.onerror = ()=> push('⚠️ errore connessione');
    ws.onclose  = ()=> push('ℹ️ connessione chiusa');
  }

  return (
    <div className="grid gap-6">
      <div className="card">
        <h1 className="text-xl font-bold mb-3">Join stanza</h1>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="flex gap-2 items-center">WS
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={wsUrl} onChange={e=>setWsUrl(e.target.value)} />
          </label>
          <label className="flex gap-2 items-center">Room
            <input className="px-2 py-1 bg-neutral-800 rounded" value={room} onChange={e=>setRoom(e.target.value)} />
          </label>
          <label className="flex gap-2 items-center">Nick
            <input className="px-2 py-1 bg-neutral-800 rounded" value={nick} onChange={e=>setNick(e.target.value)} />
          </label>
          <label className="flex gap-2 items-center">PIN
            <input className="px-2 py-1 bg-neutral-800 rounded" value={pin} onChange={e=>setPin(e.target.value)} placeholder="(opz.)" />
          </label>
          <label className="flex gap-2 items-center">Ruolo
            <select className="px-2 py-1 bg-neutral-800 rounded" value={role} onChange={e=>setRole(e.target.value as any)}>
              <option value="player">player</option>
              <option value="gm">gm</option>
              <option value="display">display</option>
            </select>
          </label>
          <div className="flex items-center">
            <button className="px-3 py-1 rounded bg-neutral-700" onClick={connect}>Connetti</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold mb-3">Log</h2>
        <div className="minh-48 overflow-auto text-sm space-y-1">
          {log.map((l,i)=>(<div key={i}>{l}</div>))}
        </div>
      </div>
    </div>
  );
}
