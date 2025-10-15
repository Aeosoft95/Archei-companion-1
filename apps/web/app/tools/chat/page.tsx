'use client';
import { useEffect, useState } from 'react';
import { sendLocal, rollArchei } from '@archei/shared';
import type { WireEvent } from '@archei/shared';

export default function Tools({ searchParams }: any){
  const fallback = process.env.NEXT_PUBLIC_WS_DEFAULT || 'ws://127.0.0.1:8787';
  const wsUrl = (searchParams?.ws || fallback) as string;

  // Connessione / stanza
  const [room, setRoom] = useState<string>(searchParams?.room || 'demo');
  const [pin, setPin] = useState<string>(searchParams?.pin || '');
  const [nick, setNick] = useState('GM');

  // Stato UI
  const [mirrorWS, setMirrorWS] = useState(false);
  const [channel, setChannel] = useState<'global'|'party'|'ooc'|'pm-gm'>('global');
  const [chat, setChat] = useState<string[]>([]);
  const [pool, setPool] = useState(5);
  const [override, setOverride] = useState<number|undefined>(undefined);

  // WebSocket resiliente
  const [ws, setWs] = useState<WebSocket|null>(null);
  useEffect(()=>{
    let active = true, attempt = 0;
    let sock: WebSocket | null = null;

    const connect = () => {
      try {
        sock = new WebSocket(wsUrl);
        sock.onopen = () => {
          attempt = 0;
          // setup stanza (imposta PIN se presente) e join come GM
          try { sock!.send(JSON.stringify({ t:'setup', room, pin: pin || undefined, nick })); } catch {}
          try { sock!.send(JSON.stringify({ t:'join', room, role:'gm', nick, pin: pin || undefined } as WireEvent)); } catch {}
        };
        sock.onerror = () => { try{ sock?.close(); }catch{} };
        sock.onclose = () => {
          if (!active) return;
          const delay = Math.min(1000*(2**attempt++), 10000);
          setTimeout(connect, delay);
        };
        // 🔎 Gestione messaggi in ingresso: SOLO eventi chat/dice formattati,
        // ignora protocolli (joined, presence, room-setup, ecc.)
        sock.onmessage = (m)=>{
          try {
            const evt = JSON.parse(String(m.data)) as WireEvent & any;
            if (evt.t === 'chat') {
              setChat(c => [...c, `${evt.nick} [${evt.channel}]: ${evt.text}`]);
            } else if (evt.t === 'dice' && evt.result) {
              const r = evt.result;
              const line = `${evt.nick} tira ${evt.pool}d6 (soglia ${r.threshold}+): ${r.rolled.join(', ')} => ${r.successes} succ. (${r.level})`;
              setChat(c => [...c, line]);
            } else {
              // altri eventi WS (scene/banner/countdown/join/presence...) non “sporcano” la chat
            }
          } catch {
            // messaggio non JSON: ignora
          }
        };
        setWs(sock);
      } catch {
        const delay = Math.min(1000*(2**attempt++), 10000);
        setTimeout(connect, delay);
      }
    };

    connect();
    return ()=>{ active = false; try{ sock?.close(); }catch{} };
  }, [wsUrl, room, nick, pin]);

  // Invio su WS solo se mirrorWS attivo e socket aperto
  function sendWS(evt: WireEvent){
    if (!mirrorWS || !ws || ws.readyState !== ws.OPEN) return;
    try { ws.send(JSON.stringify(evt)); } catch {}
  }

  // Funzioni azione
  function sendBanner(text: string){
    sendLocal('banner', text);                   // display locale
    sendWS({ t:'banner', room, text });         // display online (se mirrorWS)
  }

  function sendScene(title?: string, color?: string, image?: string){
    sendLocal('scene', { title, color, image });
    sendWS({ t:'scene', room, title, color, image });
  }

  function sendCountdown(seconds: number, text?: string){
    try {
      const bc = new BroadcastChannel('archei-countdown');
      bc.postMessage(seconds);
      bc.close();
    } catch {}
    sendWS({ t:'countdown', room, seconds, text });
  }

  function sendChatLine(text: string){
    const evt: WireEvent = { t:'chat', room, nick, channel, text };
    sendWS(evt);
    // Mostra subito in locale la riga chat
    setChat(c=> [...c, `${nick} [${channel}]: ${text}`]);
  }

  function roll(){
    const rr = rollArchei(pool, override);
    const line = `${nick} tira ${pool}d6 (soglia ${rr.threshold}+): ${rr.rolled.join(', ')} => ${rr.successes} succ. (${rr.level})`;
    setChat(c=> [...c, line]);                          // mostra subito in locale
    sendWS({ t:'dice', room, nick, pool, override });   // il server ricalcola e broadcasta ai client
    sendBanner(line);                                   // banner automatico
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h2 className="text-lg font-bold mb-2">Connessione</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <label>Nick</label>
          <input className="px-2 py-1 bg-neutral-800 rounded" value={nick} onChange={e=>setNick(e.target.value)}/>
          <label>Room</label>
          <input className="px-2 py-1 bg-neutral-800 rounded" value={room} onChange={e=>setRoom(e.target.value)}/>
          <label>PIN</label>
          <input className="px-2 py-1 bg-neutral-800 rounded w-28" value={pin} onChange={e=>setPin(e.target.value)} placeholder="(opz.)"/>
          <label className="ml-4 flex items-center gap-2">
            <input type="checkbox" checked={mirrorWS} onChange={e=>setMirrorWS(e.target.checked)}/>
            Mirror WS
          </label>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold mb-2">Chat</h2>
        <div className="flex gap-2 mb-2 items-center">
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
        <div className="h-64 overflow-auto bg-neutral-950/40 rounded p-2 text-sm">
          {chat.map((l,i)=>(<div key={i}>{l}</div>))}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold mb-2">Dadi ARCHEI</h2>
        <div className="flex gap-2 items-center">
          <label>Pool teorico</label>
          <input
            type="number" min={1} max={30}
            value={pool}
            onChange={e=>setPool(parseInt(e.target.value||'1'))}
            className="w-24 px-2 py-1 bg-neutral-800 rounded"
          />
          <label>Override soglia (2-6)</label>
          <input
            type="number" min={2} max={6}
            value={override||''}
            onChange={e=>setOverride(e.target.value?parseInt(e.target.value):undefined)}
            className="w-24 px-2 py-1 bg-neutral-800 rounded"
          />
          <button className="px-3 py-1 rounded bg-neutral-700" onClick={roll}>Tira</button>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold mb-2">Scene & Display</h2>
        <div className="grid gap-2">
          <div className="flex gap-2 items-center">
            <input id="title" placeholder="Titolo" className="flex-1 px-2 py-1 bg-neutral-800 rounded"/>
            <input id="color" placeholder="#334455" className="w-40 px-2 py-1 bg-neutral-800 rounded"/>
            <input id="image" placeholder="URL immagine (opz.)" className="flex-1 px-2 py-1 bg-neutral-800 rounded"/>
            <button
              className="px-3 py-1 rounded bg-neutral-700"
              onClick={()=>{
                const t = (document.getElementById('title') as HTMLInputElement).value;
                const c = (document.getElementById('color') as HTMLInputElement).value;
                const i = (document.getElementById('image') as HTMLInputElement).value;
                sendScene(t,c,i);
              }}
            >
              Invia scena
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <input id="banner" placeholder="Banner" className="flex-1 px-2 py-1 bg-neutral-800 rounded"/>
            <button
              className="px-3 py-1 rounded bg-neutral-700"
              onClick={()=>{
                const t = (document.getElementById('banner') as HTMLInputElement).value;
                sendBanner(t);
              }}
            >
              Invia banner
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <input id="seconds" type="number" defaultValue={10} className="w-24 px-2 py-1 bg-neutral-800 rounded"/>
            <input id="cdtext" placeholder="Testo (opzionale)" className="flex-1 px-2 py-1 bg-neutral-800 rounded"/>
            <button
              className="px-3 py-1 rounded bg-neutral-700"
              onClick={()=>{
                const s = parseInt((document.getElementById('seconds') as HTMLInputElement).value||'10');
                const t = (document.getElementById('cdtext') as HTMLInputElement).value;
                sendCountdown(s,t);
              }}
            >
              Countdown
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
