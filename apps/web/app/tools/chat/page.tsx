'use client';
import { useEffect, useRef, useState } from 'react';
import { sendLocal, rollArchei } from '@archei/shared';
import type { WireEvent } from '@archei/shared';
import { GuardRole } from '@/lib/guards';

function Content({ searchParams }: any){
  const fallback = process.env.NEXT_PUBLIC_WS_DEFAULT || 'ws://127.0.0.1:8787';
  const wsUrl = (searchParams?.ws || fallback) as string;

  const [room, setRoom] = useState<string>(searchParams?.room || 'demo');
  const [pin, setPin] = useState<string>(searchParams?.pin || '');
  const [nick, setNick] = useState('GM');

  const [mirrorWS, setMirrorWS] = useState(false);
  const [channel, setChannel] = useState<'global'|'party'|'ooc'|'pm-gm'>('global');
  const [chat, setChat] = useState<string[]>([]);
  const [pool, setPool] = useState(5);
  const [override, setOverride] = useState<number|undefined>(undefined);

  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [ws, setWs] = useState<WebSocket|null>(null);
  useEffect(()=>{
    let active = true, attempt = 0;
    let sock: WebSocket | null = null;

    const connect = () => {
      try {
        sock = new WebSocket(wsUrl);
        sock.onopen = () => {
          attempt = 0;
          try { sock!.send(JSON.stringify({ t:'setup', room, pin: pin || undefined, nick })); } catch {}
          try { sock!.send(JSON.stringify({ t:'join', room, role:'gm', nick, pin: pin || undefined } as WireEvent)); } catch {}
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
  }, [wsUrl, room, nick, pin]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (chatEndRef.current) chatEndRef.current.scrollIntoView({ block: 'end' });
      else if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [chat]);

  function sendWS(evt: WireEvent){
    if (!mirrorWS || !ws || ws.readyState !== ws.OPEN) return;
    try { ws.send(JSON.stringify(evt)); } catch {}
  }

  function sendBanner(text: string){
    sendLocal('banner', text);
    sendWS({ t:'banner', room, text });
  }
  function sendScene(title?: string, color?: string, image?: string){
    sendLocal('scene', { title, color, image });
    sendWS({ t:'scene', room, title, color, image });
  }
  function sendCountdown(seconds: number, text?: string){
    try { const bc = new BroadcastChannel('archei-countdown'); bc.postMessage(seconds); bc.close(); } catch {}
    sendWS({ t:'countdown', room, seconds, text });
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
    sendBanner(line);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="card">
        <h2 className="text-lg font-bold mb-3">Connessione</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="flex items-center gap-2">
            <span className="w-16">Nick</span>
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={nick} onChange={e=>setNick(e.target.value)}/>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-16">Room</span>
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={room} onChange={e=>setRoom(e.target.value)}/>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-16">PIN</span>
            <input className="flex-1 px-2 py-1 bg-neutral-800 rounded" value={pin} onChange={e=>setPin(e.target.value)} placeholder="(opz.)"/>
          </label>
          <label className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
            <input type="checkbox" checked={mirrorWS} onChange={e=>setMirrorWS(e.target.checked)}/>
            <span>Mirror WS (invia anche online)</span>
          </label>
        </div>
      </div>

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
    </div>
  );
}

export default function Page(props: any) {
  return (
    <GuardRole allow="gm">
      <Content {...props} />
    </GuardRole>
  );
}
