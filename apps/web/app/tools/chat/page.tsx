'use client';
import { useEffect, useRef, useState } from 'react';
import { sendLocal, rollArchei } from '@archei/shared';
import type { WireEvent } from '@archei/shared';
import { GuardAuth } from '@/lib/guards';

type Role = 'gm' | 'player' | 'display';

function Content({ searchParams }: any){
  const fallback = process.env.NEXT_PUBLIC_WS_DEFAULT || 'ws://127.0.0.1:8787';
  const wsFromQP = (searchParams?.ws || fallback) as string;

  // 🔁 Parametri query
  const auto = String(searchParams?.auto || '') === '1';
  const roleQP = (searchParams?.role as Role) || 'gm';
  const roomQP = (searchParams?.room as string) || 'demo';
  const pinQP  = (searchParams?.pin as string)  || '';

  // Stato connessione / utente
  const [wsUrl, setWsUrl] = useState<string>(wsFromQP);
  const [room, setRoom]   = useState<string>(roomQP);
  const [pin, setPin]     = useState<string>(pinQP);
  const [role, setRole]   = useState<Role>(roleQP);
  const [nick, setNick]   = useState<string>(roleQP === 'gm' ? 'GM' : roleQP === 'player' ? 'Player' : 'Display');

  // Prima di connettersi da link auto=1 → chiedi Nick
  const [needsNickConfirm, setNeedsNickConfirm] = useState<boolean>(auto);
  const [mirrorWS, setMirrorWS] = useState<boolean>(auto ? true : false);

  // Chat/UI
  const [channel, setChannel] = useState<'global'|'party'|'ooc'|'pm-gm'>('global');
  const [chat, setChat] = useState<string[]>([]);
  const [pool, setPool] = useState(5);
  const [override, setOverride] = useState<number|undefined>(undefined);

  // Auto-scroll
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // WebSocket
  const [ws, setWs] = useState<WebSocket|null>(null);

  // Abilitazione connessione: se auto serve conferma nick; altrimenti subito.
  const canConnect = !auto || (auto && !needsNickConfirm);

  // 🔌 Connessione resiliente + setup/join quando consentito
  useEffect(()=>{
    if (!canConnect) return;

    let active = true, attempt = 0;
    let sock: WebSocket | null = null;

    const connect = () => {
      try {
        sock = new WebSocket(wsUrl);
        sock.onopen = () => {
          attempt = 0;

          // Se GM: può configurare PIN.
          if (role === 'gm') {
            try { sock!.send(JSON.stringify({ t:'setup', room, pin: pin || undefined, nick })); } catch {}
          }
          // Join con ruolo effettivo
          try { sock!.send(JSON.stringify({ t:'join', room, role, nick, pin: pin || undefined } as WireEvent)); } catch {}

          if (auto) {
            setChat(c => [...c, `→ Accesso: ${role.toUpperCase()} @ ${room}${pin ? ` (PIN ${pin})` : ''}`]);
          }
        };
        sock.onerror = () => { try{ sock?.close(); }catch{} };
        sock.onclose = () => {
          if (!active) return;
          const delay = Math.min(1000*(2**attempt++), 10000);
          setTimeout(connect, delay);
        };
        sock.onmessage = (m)=>{
          try {
            const evt = JSON.parse(String(m.data)) as WireEvent & any;
            if (evt.t === 'chat') {
              setChat(c => [...c, `${evt.nick} [${evt.channel}]: ${evt.text}`]);
            } else if (evt.t === 'dice' && evt.result) {
              const r = evt.result;
              const line = `${evt.nick} tira ${evt.pool}d6 (soglia ${r.threshold}+): ${r.rolled.join(', ')} => ${r.successes} succ. (${r.level})`;
              setChat(c => [...c, line]);
            }
          } catch {}
        };
        setWs(sock);
      } catch {
        const delay = Math.min(1000*(2**attempt++), 10000);
        setTimeout(connect, delay);
      }
    };

    connect();
    return ()=>{ active = false; try{ sock?.close(); }catch{} };
  }, [canConnect, wsUrl, room, nick, pin, role, auto]);

  // 🔽 Auto-scroll
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (chatEndRef.current) chatEndRef.current.scrollIntoView({ block: 'end' });
      else if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [chat]);

  // Invio WS (abilitato se mirror attivo)
  function sendWS(evt: WireEvent){
    if (!mirrorWS || !ws || ws.readyState !== ws.OPEN) return;
    try { ws.send(JSON.stringify(evt)); } catch {}
  }

  // Azioni
  function sendBanner(text: string){
    if (role === 'gm') sendLocal('banner', text);
    if (role === 'gm') sendWS({ t:'banner', room, text });
  }
  function sendScene(title?: string, color?: string, image?: string){
    if (role === 'gm') sendLocal('scene', { title, color, image });
    if (role === 'gm') sendWS({ t:'scene', room, title, color, image });
  }
  function sendCountdown(seconds: number, text?: string){
    if (role === 'gm') { try { const bc = new BroadcastChannel('archei-countdown'); bc.postMessage(seconds); bc.close(); } catch {} }
    if (role === 'gm') sendWS({ t:'countdown', room, seconds, text });
  }
  function sendChatLine(text: string){
    const evt: WireEvent = { t:'chat', room, nick, channel, text };
    sendWS(evt);
    setChat(c=> [...c, `${nick} [${channel}]: ${text}`]);
  }
  function roll(){
    const rr = rollArchei(pool, override);
    const line = `${nick} tira ${pool}d6 (soglia ${rr.threshold}+): ${rr.rolled.join(', ')} => ${rr.successes} succ. (${rr.level})`;
    setChat(c=> [...c, line]);
    sendWS({ t:'dice', room, nick, pool, override });
    if (role === 'gm') sendBanner(line);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* Modal Nick (solo per auto-join) */}
      {auto && needsNickConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-10 w-[92%] sm:w-[28rem] rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-2xl">
            <h3 className="text-lg font-bold mb-2">Inserisci il tuo Nick</h3>
            <p className="text-sm opacity-80 mb-3">Stai per entrare nella stanza <b>{room}</b> come <b>{role.toUpperCase()}</b>.</p>
            <div className="flex items-center gap-2 mb-3">
              <input
                className="flex-1 px-3 py-2 bg-neutral-800 rounded"
                placeholder="Il tuo nick"
                value={nick}
                autoFocus
                onChange={e=>setNick(e.target.value)}
                onKeyDown={e=>{
                  if (e.key === 'Enter' && nick.trim()) setNeedsNickConfirm(false);
                }}
              />
              <button
                className="px-3 py-2 rounded bg-neutral-200 text-neutral-900 font-semibold disabled:opacity-60"
                disabled={!nick.trim()}
                onClick={()=> setNeedsNickConfirm(false)}
              >
                Entra
              </button>
            </div>
            <div className="text-xs opacity-70">
              PIN: {pin ? <b>{pin}</b> : '—'} · WS: <span className="break-all">{wsUrl}</span>
            </div>
          </div>
        </div>
      )}

      {/* CONNESSIONE */}
      <div className="card">
        <h2 className="text-lg font-bold mb-3">Connessione</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="flex items-center gap-2">
            <span className="w-20">WS</span>
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={wsUrl} onChange={e=>setWsUrl(e.target.value)}/>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20">Role</span>
            <select className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={role} onChange={e=>setRole(e.target.value as Role)}>
              <option value="gm">gm</option>
              <option value="player">player</option>
              <option value="display">display</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20">Nick</span>
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={nick} onChange={e=>setNick(e.target.value)}/>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20">Room</span>
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={room} onChange={e=>setRoom(e.target.value)}/>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20">PIN</span>
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={pin} onChange={e=>setPin(e.target.value)} placeholder="(opz.)"/>
          </label>
          <label className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
            <input type="checkbox" checked={mirrorWS} onChange={e=>setMirrorWS(e.target.checked)}/>
            <span>Mirror WS (invia chat/dadi/banner/scene via WebSocket)</span>
          </label>
          {auto && !needsNickConfirm && (
            <div className="sm:col-span-2 lg:col-span-3 text-xs text-emerald-400">
              Accesso da invito: connesso come <b>{role.toUpperCase()}</b> alla room <b>{room}</b>{pin ? ` (PIN ${pin})` : ''}.
            </div>
          )}
        </div>
      </div>

      {/* CHAT */}
      <div className="card">
        <h2 className="text-lg font-bold mb-3">Chat</h2>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <select value={channel} onChange={e=>setChannel(e.target.value as any)} className="px-2 py-1 bg-neutral-800 rounded">
              <option value="global">global</option>
              <option value="party">party</option>
              <option value="ooc">ooc</option>
              <option value="pm-gm">pm-gm</option>
            </select>
            <input
              id="msg"
              placeholder="Scrivi..."
              className="flex-1 px-2 py-1 bg-neutral-800 rounded"
              onKeyDown={(e)=>{
                if (e.key==='Enter') {
                  const v=(e.target as HTMLInputElement).value;
                  if (v){ sendChatLine(v); (e.target as HTMLInputElement).value=''; }
                }
              }}
            />
          </div>
          <div ref={chatBoxRef} className="min-h-[12rem] max-h-[28rem] overflow-auto bg-neutral-950/40 rounded p-2 text-sm">
            {chat.map((l,i)=>(<div key={i}>{l}</div>))}
            <div ref={chatEndRef} />
          </div>
        </div>
      </div>

      {/* DADI */}
      <div className="card">
        <h2 className="text-lg font-bold mb-3">Dadi ARCHEI</h2>
        <div className="grid sm:grid-cols-2 gap-3 items-center">
          <label className="flex items-center gap-2">
            <span className="w-28">Pool teorico</span>
            <input type="number" min={1} max={30} value={pool} onChange={e=>setPool(parseInt(e.target.value||'1'))} className="w-28 px-2 py-1 bg-neutral-800 rounded"/>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-40">Override soglia (2-6)</span>
            <input type="number" min={2} max={6} value={override||''} onChange={e=>setOverride(e.target.value?parseInt(e.target.value):undefined)} className="w-28 px-2 py-1 bg-neutral-800 rounded"/>
          </label>
          <div>
            <button className="px-3 py-1 rounded bg-neutral-700" onClick={roll}>Tira</button>
          </div>
        </div>
      </div>

      {/* SCENE — visibili solo al GM */}
      <div className={`card ${role !== 'gm' ? 'opacity-50 pointer-events-none' : ''}`}>
        <h2 className="text-lg font-bold mb-3">Scene & Display {role !== 'gm' && <span className="text-xs opacity-70">(solo GM)</span>}</h2>
        <div className="grid gap-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <input id="title" placeholder="Titolo" className="px-2 py-1 bg-neutral-800 rounded" disabled={role!=='gm'}/>
            <input id="color" placeholder="#334455" className="px-2 py-1 bg-neutral-800 rounded" disabled={role!=='gm'}/>
            <input id="image" placeholder="URL immagine (opz.)" className="px-2 py-1 bg-neutral-800 rounded" disabled={role!=='gm'}/>
            <button className="px-3 py-1 rounded bg-neutral-700" disabled={role!=='gm'} onClick={()=>{
              const t = (document.getElementById('title') as HTMLInputElement)?.value;
              const c = (document.getElementById('color') as HTMLInputElement)?.value;
              const i = (document.getElementById('image') as HTMLInputElement)?.value;
              sendScene(t,c,i);
            }}>Invia scena</button>
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-2">
            <input id="banner" placeholder="Banner" className="px-2 py-1 bg-neutral-800 rounded" disabled={role!=='gm'}/>
            <button className="px-3 py-1 rounded bg-neutral-700" disabled={role!=='gm'} onClick={()=>{
              const t = (document.getElementById('banner') as HTMLInputElement)?.value;
              sendBanner(t);
            }}>Invia banner</button>
          </div>
          <div className="grid sm:grid-cols-[8rem_1fr_auto] gap-2 items-center">
            <input id="seconds" type="number" defaultValue={10} className="px-2 py-1 bg-neutral-800 rounded" disabled={role!=='gm'}/>
            <input id="cdtext" placeholder="Testo (opzionale)" className="px-2 py-1 bg-neutral-800 rounded" disabled={role!=='gm'}/>
            <button className="px-3 py-1 rounded bg-neutral-700" disabled={role!=='gm'} onClick={()=>{
              const s = parseInt((document.getElementById('seconds') as HTMLInputElement)?.value||'10');
              const t = (document.getElementById('cdtext') as HTMLInputElement)?.value;
              sendCountdown(s,t);
            }}>Countdown</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page(props: any) {
  // Accesso alla pagina solo per utenti autenticati (GM o Player),
  // gli strumenti "solo GM" sono disattivati quando role !== 'gm'.
  return (
    <GuardAuth>
      <Content {...props} />
    </GuardAuth>
  );
}
