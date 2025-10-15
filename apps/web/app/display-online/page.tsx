'use client';
import { useEffect, useState } from 'react';
import type { WireEvent } from '@archei/shared';

function useWS(url: string){
  const [ws, setWs] = useState<WebSocket | null>(null);
  useEffect(()=>{
    let active = true;
    let attempt = 0;
    let sock: WebSocket | null = null;

    const connect = () => {
      try {
        sock = new WebSocket(url);
        sock.onopen = () => { attempt = 0; };
        sock.onerror = () => { try{ sock?.close(); }catch{} };
        sock.onclose = () => {
          if (!active) return;
          const delay = Math.min(1000 * (2 ** attempt++), 10000);
          setTimeout(connect, delay);
        };
        setWs(sock);
      } catch {
        const delay = Math.min(1000 * (2 ** attempt++), 10000);
        setTimeout(connect, delay);
      }
    };

    connect();
    return () => { active = false; try{ sock?.close(); }catch{} };
  }, [url]);

  return ws;
}

export default function DisplayOnline({ searchParams } : any){
  const fallback = process.env.NEXT_PUBLIC_WS_DEFAULT || 'ws://127.0.0.1:8787';
  const wsUrl = searchParams?.ws || fallback;
  const room = searchParams?.room || 'demo';
  const pin = searchParams?.pin || undefined;

  const ws = useWS(wsUrl);

  const [banner,setBanner] = useState('');
  const [scene,setScene] = useState<any>({});
  const [time,setTime] = useState<number|undefined>();
  const [status,setStatus] = useState<'offline'|'online'|'connecting'>('connecting');

  useEffect(()=>{
    if (!ws) return;

    ws.onopen = () => {
      setStatus('online');
      try {
        ws.send(JSON.stringify({ t:'join', room, role:'display', nick:'display', pin } as WireEvent));
      } catch {}
    };
    ws.onclose = () => setStatus('offline');
    ws.onerror = () => setStatus('offline');

    ws.onmessage = (m)=>{
      const evt = JSON.parse(String(m.data)) as WireEvent|any;
      if (evt.t==='banner') setBanner(evt.text);
      if (evt.t==='scene') setScene({title:evt.title, color:evt.color, image:evt.image});
      if (evt.t==='countdown') setTime(evt.seconds);
      if (evt.t==='joined') setStatus('online');
    };
  },[ws, room, pin]);

  return (
    <div className="grid gap-4">
      <div className="card min-h-8 text-sm opacity-80">
        WS: {status} → {wsUrl} (room: {room})
      </div>
      <div className="card min-h-32" style={{background: scene.color||'#111'}}>
        <h1 className="text-3xl font-black">{scene.title||'—'}</h1>
        {scene.image && <img src={scene.image} alt="scene" className="mt-2 max-h-72 rounded-xl"/>}
      </div>
      <div className="card min-h-24"><p className="text-2xl">{banner}</p></div>
      <div className="card min-h-24"><p className="text-2xl">{time!==undefined? `${time}s`:'—'}</p></div>
    </div>
  );
}
