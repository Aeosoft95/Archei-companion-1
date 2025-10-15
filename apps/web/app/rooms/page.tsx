'use client';
import { useEffect, useMemo, useState } from 'react';
import { GuardRole } from '@/lib/guards';
import { chatAutoConnectURL, displayOnlineURL, getWsDefault, getWebBase } from '@/lib/links';

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm"
      onClick={async ()=>{
        try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(()=>setOk(false), 1200); } catch {}
      }}
      title="Copia negli appunti"
    >
      {ok ? '✓ Copiato' : label}
    </button>
  );
}

function RoomsInner() {
  const [ws, setWs] = useState(getWsDefault());
  const [web, setWeb] = useState(getWebBase());
  const [room, setRoom] = useState('demo');
  const [pin, setPin] = useState<string>('');

  useEffect(()=> {
    // aggiorna default se cambiano host/porta (dev hot reload)
    setWeb(getWebBase());
  }, []);

  const gmLink = useMemo(()=> chatAutoConnectURL({ webBase: web, ws, room, pin, role: 'gm' }), [web, ws, room, pin]);
  const playerLink = useMemo(()=> chatAutoConnectURL({ webBase: web, ws, room, pin, role: 'player' }), [web, ws, room, pin]);
  const dispLink = useMemo(()=> displayOnlineURL({ webBase: web, ws, room, pin }), [web, ws, room, pin]);

  return (
    <div className="grid gap-6">
      <div className="card">
        <h1 className="text-2xl font-bold mb-2">Stanza & Inviti</h1>
        <p className="opacity-80 mb-3">Crea/usa una stanza con PIN e condividi i link d’accesso.</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="flex items-center gap-2">
            <span className="w-24">WS</span>
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={ws} onChange={e=>setWs(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24">Web</span>
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={web} onChange={e=>setWeb(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24">Room</span>
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={room} onChange={e=>setRoom(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24">PIN</span>
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={pin} onChange={e=>setPin(e.target.value)} placeholder="(opz.)" />
          </label>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold mb-3">Inviti rapidi</h2>

        <div className="grid gap-4">
          <div className="grid md:grid-cols-[1fr_auto] gap-2 items-start">
            <div>
              <div className="text-sm opacity-80 mb-1">Link GM (Chat & Dadi con parametri)</div>
              <div className="p-2 bg-neutral-950/50 rounded text-xs break-all">{gmLink}</div>
            </div>
            <CopyBtn text={gmLink} label="Copia link GM" />
          </div>

          <div className="grid md:grid-cols-[1fr_auto] gap-2 items-start">
            <div>
              <div className="text-sm opacity-80 mb-1">Link Player (Chat & Dadi con parametri)</div>
              <div className="p-2 bg-neutral-950/50 rounded text-xs break-all">{playerLink}</div>
            </div>
            <CopyBtn text={playerLink} label="Copia link Player" />
          </div>

          <div className="grid md:grid-cols-[1fr_auto] gap-2 items-start">
            <div>
              <div className="text-sm opacity-80 mb-1">Link Display Online (read-only)</div>
              <div className="p-2 bg-neutral-950/50 rounded text-xs break-all">{dispLink}</div>
            </div>
            <CopyBtn text={dispLink} label="Copia link Display" />
          </div>
        </div>

        <p className="text-xs opacity-70 mt-3">
          Nota: questi link passano <code>ws</code>, <code>room</code> e (se impostato) <code>pin</code> via query string.  
          La pagina <code>/tools/chat</code> userà quei parametri; per l’auto-join completo aggiungeremo tra poco un “auto connect”.
        </p>
      </div>
    </div>
  );
}

export default function RoomsPage() {
  return (
    <GuardRole allow="gm">
      <RoomsInner />
    </GuardRole>
  );
}
