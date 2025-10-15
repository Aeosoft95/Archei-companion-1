'use client';
import { useEffect, useRef, useState } from 'react';

type Clock = { id:string; name:string; segments:number; filled:number; visible:boolean; color?:string; icon?:string };
type SceneState = { title?: string; color?: string; image?: string; visible?: boolean };
type CountdownState = { running: boolean; totalMs: number; remainMs: number; label?: string; startedAt?: number };

const ENV_WS = process.env.NEXT_PUBLIC_WS_DEFAULT || '';
const ENV_ROOM = process.env.NEXT_PUBLIC_ROOM_DEFAULT || 'demo';

export default function DisplayOnline() {
  const [wsUrl, setWsUrl] = useState<string>('');
  const [room, setRoom] = useState<string>(ENV_ROOM);
  const wsRef = useRef<WebSocket|null>(null);

  const [clocks, setClocks] = useState<Clock[]>([]);
  const [scene, setScene] = useState<SceneState>({ title:'', color:'#000000', image:'', visible:false });
  const [countdown, setCountdown] = useState<CountdownState>({ running:false, totalMs:0, remainMs:0, label:'' });
  const [banner, setBanner] = useState<string>('');

  // parse query: ws, room
  useEffect(()=>{
    const search = new URLSearchParams(window.location.search);
    const qWs = search.get('ws') || ENV_WS;
    const qRoom = search.get('room') || ENV_ROOM;
    setWsUrl(qWs);
    setRoom(qRoom);
  }, []);

  useEffect(()=>{
    if (!wsUrl || !(wsUrl.startsWith('ws://') || wsUrl.startsWith('wss://'))) return;
    const url = wsUrl + (wsUrl.includes('?')?'&':'?') + 'room=' + encodeURIComponent(room);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = ()=>{};
    ws.onclose = ()=>{};
    ws.onerror = ()=>{};

    ws.onmessage = (ev)=>{
      try {
        const data = JSON.parse(ev.data);
        switch (data.t) {
          case 'DISPLAY_CLOCKS_STATE': {
            const onlyVisible = (data.clocks as Clock[]).filter(c=>c.visible);
            setClocks(onlyVisible);
            break;
          }
          case 'DISPLAY_HIGHLIGHT': {
            // opzionale: splash effettino
            break;
          }
          case 'DISPLAY_SCENE_STATE': {
            setScene(data.scene || {});
            break;
          }
          case 'DISPLAY_BANNER': {
            setBanner(String(data.text||''));
            // auto-hide banner dopo 4s
            setTimeout(()=> setBanner(''), 4000);
            break;
          }
          case 'DISPLAY_COUNTDOWN': {
            setCountdown(data.countdown || { running:false, totalMs:0, remainMs:0, label:'' });
            break;
          }
        }
      } catch {}
    };

    return ()=> { try { ws.close(); } catch {} };
  }, [wsUrl, room]);

  // render progress per clock
  const Arc = ({filled, segments, color='#60a5fa'}:{filled:number; segments:number; color?:string})=>{
    const pct = segments>0 ? filled/segments : 0;
    return (
      <div className="h-24 w-24 rounded-full bg-neutral-800 grid place-items-center relative">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#262626" strokeWidth="5"/>
          <circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="5" strokeDasharray={`${pct*100},100`} />
        </svg>
        <div className="relative text-lg font-bold">{filled}/{segments}</div>
      </div>
    );
  };

  // countdown live (se arriva solo lo stato, mostriamo il numero ricevuto)
  const remainSec = Math.max(0, Math.round((countdown.remainMs || 0)/100)/10);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background scene */}
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{
          background: scene.image ? undefined : (scene.color || '#000000'),
          backgroundImage: scene.image ? `url(${scene.image})` : undefined,
          opacity: scene.visible ? 1 : 0,
          transition: 'opacity .3s ease'
        }}
      />
      <div className="relative z-10 p-6">
        {/* Scene title */}
        {scene.visible && !!scene.title && (
          <div className="text-center text-3xl font-bold drop-shadow-lg mb-4">{scene.title}</div>
        )}

        {/* Clocks grid (solo visibili) */}
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {clocks.map(c=>(
            <div key={c.id} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{c.icon ?? '⏰'}</span>
                <div className="font-semibold">{c.name}</div>
              </div>
              <div className="flex items-center gap-4">
                <Arc filled={c.filled} segments={c.segments} color={c.color || '#60a5fa'} />
                <div className="opacity-80">{c.filled}/{c.segments}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Banner */}
      {banner && (
        <div className="absolute left-1/2 -translate-x-1/2 top-6 z-20">
          <div className="px-6 py-3 rounded-full bg-neutral-100 text-neutral-900 font-bold shadow-xl">{banner}</div>
        </div>
      )}

      {/* Countdown overlay */}
      {countdown.running && (
        <div className="absolute inset-0 bg-black/60 grid place-items-center z-30">
          <div className="text-center">
            <div className="text-4xl font-bold mb-3">{countdown.label || 'Countdown'}</div>
            <div className="text-7xl font-black tabular-nums">{remainSec.toFixed(1)}s</div>
          </div>
        </div>
      )}
    </div>
  );
}
