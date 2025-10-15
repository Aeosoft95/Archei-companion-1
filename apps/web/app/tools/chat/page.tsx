'use client';
import { useEffect, useRef, useState } from 'react';
import { sendLocal } from '@archei/shared'; // il roll è implementato qui localmente
import type { WireEvent } from '@archei/shared';
import { GuardAuth } from '@/lib/guards';

type Role = 'gm' | 'player' | 'display';

function autoThreshold(pool: number, override?: number) {
  if (override && override >= 2 && override <= 6) return override;
  if (pool >= 20) return 3;
  if (pool >= 10) return 4;
  if (pool >= 6)  return 5;
  return 6; // 1–5
}

type RollResult = {
  threshold: number;
  diceReal: number;           // quanti dadi reali tirati (max 5)
  rolledReal: number[];       // risultati dei dadi reali
  successesReal: number;      // successi dai soli dadi reali
  totalSuccesses: number;     // = successesReal (i teorici non contano)
  level: 'Fallimento' | 'Parziale' | 'Pieno' | 'Critico';
};

function rollCap5(pool: number, threshold: number): RollResult {
  const diceReal = Math.max(1, Math.min(5, Math.floor(pool || 1)));
  const rolledReal: number[] = Array.from({ length: diceReal }, () => 1 + Math.floor(Math.random() * 6));
  const successesReal = rolledReal.filter(v => v >= threshold).length;

  let level: RollResult['level'];
  if (successesReal >= 3) level = 'Critico';
  else if (successesReal === 2) level = 'Pieno';
  else if (successesReal === 1) level = 'Parziale';
  else level = 'Fallimento';

  return { threshold, diceReal, rolledReal, successesReal, totalSuccesses: successesReal, level };
}

// UI helpers
function Die({ v, threshold }: { v: number; threshold: number }) {
  const ok = v >= threshold;
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded border text-sm ${
        ok ? 'border-emerald-500 text-emerald-300' : 'border-neutral-700 text-neutral-300'
      }`}
      title={ok ? 'Successo' : 'Fallimento'}
      aria-label={`D${v} ${ok ? 'successo' : 'fallimento'}`}
    >
      {v}
    </span>
  );
}

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

  // Dice UI state
  const [pool, setPool] = useState(5);                      // pool teorico (solo per soglia)
  const [override, setOverride] = useState<number|undefined>(undefined);
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);

  // Auto-scroll chat
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // WebSocket
  const [ws, setWs] = useState<WebSocket|null>(null);

  // De-dup: ultima riga scritta localmente (per ignorare l’eco identico)
  const lastLocalLineRef = useRef<string | null>(null);

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

          if (role === 'gm') {
            try { sock!.send(JSON.stringify({ t:'setup', room, pin: pin || undefined, nick })); } catch {}
          }
          try { sock!.send(JSON.stringify({ t:'join', room, role, nick, pin: pin || undefined } as WireEvent)); } catch {}

          if (auto) {
            const line = `→ Accesso: ${role.toUpperCase()} @ ${room}${pin ? ` (PIN ${pin})` : ''}`;
            setChat(c => [...c, line]);
            lastLocalLineRef.current = line;
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
              const incoming = `${evt.nick} [${evt.channel}]: ${evt.text}`;
              // evita doppio se è IDENTICO all’ultima riga locale
              if (incoming !== lastLocalLineRef.current) {
                setChat(c => [...c, incoming]);
              } else {
                lastLocalLineRef.current = null;
              }
            } else if (evt.t === 'dice') {
              let incoming: string;
              if (evt.result) {
                const r = evt.result as RollResult;
                incoming =
                  `${evt.nick} tira ${r.diceReal}d6 (pool ${evt.pool}, soglia ${r.threshold}+): ` +
                  `${r.rolledReal.join(', ')} => ${r.totalSuccesses} succ. (${r.level})`;
              } else {
                // fallback se il server non invia result
                incoming = `${evt.nick} ha tirato ${evt.pool}d6.`;
              }
              if (incoming !== lastLocalLineRef.current) {
                setChat(c => [...c, incoming]);
              } else {
                lastLocalLineRef.current = null;
              }
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

  // 🔽 Auto-scroll Chat
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (chatEndRef.current) chatEndRef.current.scrollIntoView({ block: 'end' });
      else if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [chat]);

  // Helper: WS pronto?
  const wsReady = ws && ws.readyState === ws.OPEN;

  // Invio WS (abilitato se mirror attivo)
  function sendWS(evt: WireEvent){
    if (!mirrorWS || !wsReady) return false;
    try { ws!.send(JSON.stringify(evt)); return true; } catch { return false; }
  }

  // Azioni Chat
  function sendChatLine(text: string){
    const line = `${nick} [${channel}]: ${text}`;
    // scrivi SUBITO in locale (UX)
    setChat(c=> [...c, line]);
    lastLocalLineRef.current = line;

    // poi invia sul WS (se fallisce, abbiamo già il log locale)
    const evt: WireEvent = { t:'chat', room, nick, channel, text };
    sendWS(evt);
  }

  // Azioni Display (solo GM)
  function sendBanner(text: string){
    if (role !== 'gm') return;
    sendLocal('banner', text);
    sendWS({ t:'banner', room, text });
  }
  function sendScene(title?: string, color?: string, image?: string){
    if (role !== 'gm') return;
    sendLocal('scene', { title, color, image });
    sendWS({ t:'scene', room, title, color, image });
  }
  function sendCountdown(seconds: number, text?: string){
    if (role !== 'gm') return;
    try { const bc = new BroadcastChannel('archei-countdown'); bc.postMessage(seconds); bc.close(); } catch {}
    sendWS({ t:'countdown', room, seconds, text });
  }

  // Roll: la soglia è calcolata dal pool teorico, ma i successi sono SOLO dei 5 (o meno) dadi reali.
  function roll(){
    const threshold = autoThreshold(pool, override);
    const rr = rollCap5(pool, threshold);
    setLastRoll(rr);

    const line =
      `${nick} tira ${rr.diceReal}d6 (pool ${pool}, soglia ${rr.threshold}+): ` +
      `${rr.rolledReal.join(', ')} => ${rr.totalSuccesses} succ. (${rr.level})`;

    // scrivi SUBITO in locale
    setChat(c=> [...c, line]);
    lastLocalLineRef.current = line;

    // invia WS con il risultato (se l'eco arriva identico, viene ignorato)
    sendWS({ t:'dice', room, nick, pool, override, result: rr } as unknown as WireEvent);

    if (role === 'gm') sendBanner(line);
  }

  // ===== LAYOUT COMPATTO: sinistra (Connessione + Dadi + Scene GM), destra (Chat) =====
  return (
    <div className="grid gap-6 lg:grid-cols-2">
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
                onKeyDown={e=>{ if (e.key === 'Enter' && nick.trim()) setNeedsNickConfirm(false); }}
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

      {/* COLONNA SINISTRA */}
      <div className="grid gap-6 content-start">
        {/* CONNESSIONE */}
        <div className="card">
          <h2 className="text-lg font-bold mb-3">Connessione</h2>
          <div className="grid sm:grid-cols-2 gap-3">
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
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={mirrorWS} onChange={e=>setMirrorWS(e.target.checked)}/>
              <span>Mirror WS (invio via WebSocket)</span>
            </label>
          </div>
        </div>

        {/* DADI */}
        <div className="card">
          <h2 className="text-lg font-bold mb-3">Dadi ARCHEI</h2>
          <div className="grid gap-3">
            <div className="grid sm:grid-cols-2 gap-3 items-center">
              <label className="flex items-center gap-2">
                <span className="w-28">Pool teorico</span>
                <input
                  type="number" min={1} max={99}
                  value={pool}
                  onChange={e=>setPool(parseInt(e.target.value||'1'))}
                  className="w-28 px-2 py-1 bg-neutral-800 rounded"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-40">Override soglia (2-6)</span>
                <input
                  type="number" min={2} max={6}
                  value={override||''}
                  onChange={e=>setOverride(e.target.value?parseInt(e.target.value):undefined)}
                  className="w-28 px-2 py-1 bg-neutral-800 rounded"
                />
              </label>
              <div className="text-sm opacity-80 sm:col-span-2">
                Soglia automatica: <b>{autoThreshold(pool, override)}+</b> · Dadi reali: <b>{Math.min(5, Math.max(1, Math.floor(pool||1)))}</b>
              </div>
              <div>
                <button className="px-3 py-1 rounded bg-neutral-700" onClick={roll}>Tira</button>
              </div>
            </div>

            {/* COUNTER DADI (solo i primi 5 reali) */}
            {lastRoll && (
              <div className="mt-2">
                <div className="text-sm mb-1">Risultati reali (soglia {lastRoll.threshold}+):</div>
                <div className="flex flex-wrap gap-2">
                  {lastRoll.rolledReal.map((v, i)=> (<Die key={i} v={v} threshold={lastRoll.threshold} />))}
                </div>
                <div className="text-sm mt-2">
                  Totale successi: <b>{lastRoll.totalSuccesses}</b> ({lastRoll.level})
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SCENE — solo GM */}
        {role === 'gm' && (
          <div className="card">
            <h2 className="text-lg font-bold mb-3">Scene & Display</h2>
            <div className="grid gap-3">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <input id="title" placeholder="Titolo" className="px-2 py-1 bg-neutral-800 rounded"/>
                <input id="color" placeholder="#334455" className="px-2 py-1 bg-neutral-800 rounded"/>
                <input id="image" placeholder="URL immagine (opz.)" className="px-2 py-1 bg-neutral-800 rounded"/>
                <button className="px-3 py-1 rounded bg-neutral-700" onClick={()=>{
                  const t = (document.getElementById('title') as HTMLInputElement).value;
                  const c = (document.getElementById('color') as HTMLInputElement).value;
                  const i = (document.getElementById('image') as HTMLInputElement).value;
                  sendScene(t,c,i);
                }}>Invia scena</button>
              </div>
              <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                <input id="banner" placeholder="Banner" className="px-2 py-1 bg-neutral-800 rounded"/>
                <button className="px-3 py-1 rounded bg-neutral-700" onClick={()=>{
                  const t = (document.getElementById('banner') as HTMLInputElement).value;
                  sendBanner(t);
                }}>Invia banner</button>
              </div>
              <div className="grid sm:grid-cols-[8rem_1fr_auto] gap-2 items-center">
                <input id="seconds" type="number" defaultValue={10} className="px-2 py-1 bg-neutral-800 rounded"/>
                <input id="cdtext" placeholder="Testo (opzionale)" className="px-2 py-1 bg-neutral-800 rounded"/>
                <button className="px-3 py-1 rounded bg-neutral-700" onClick={()=>{
                  const s = parseInt((document.getElementById('seconds') as HTMLInputElement).value||'10');
                  const t = (document.getElementById('cdtext') as HTMLInputElement).value;
                  sendCountdown(s,t);
                }}>Countdown</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* COLONNA DESTRA — CHAT */}
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
          <div ref={chatBoxRef} className="min-h-[18rem] max-h-[38rem] overflow-auto bg-neutral-950/40 rounded p-2 text-sm">
            {chat.map((l,i)=>(<div key={i}>{l}</div>))}
            <div ref={chatEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page(props: any) {
  // Accesso: autenticato (GM o Player). Strumenti GM solo se role === 'gm'.
  return (
    <GuardAuth>
      <Content {...props} />
    </GuardAuth>
  );
}
