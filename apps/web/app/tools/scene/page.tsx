'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type SceneState = { title?: string; color?: string; image?: string; visible?: boolean };
type CountdownState = { running: boolean; totalMs: number; remainMs: number; label?: string; startedAt?: number };

const ENV_WS = process.env.NEXT_PUBLIC_WS_DEFAULT || '';
const ENV_ROOM = process.env.NEXT_PUBLIC_ROOM_DEFAULT || 'demo';

export default function SceneToolPage() {
  const [room, setRoom] = useState(ENV_ROOM);
  const [wsUrl, setWsUrl] = useState(ENV_WS);
  const [mirrorWS, setMirrorWS] = useState(true);

  // Scene local state
  const [title, setTitle] = useState('Portale In');
  const [color, setColor] = useState('#1f2937'); // gray-800
  const [image, setImage] = useState('');
  const [visible, setVisible] = useState(true);

  // Countdown editor
  const [cdLabel, setCdLabel] = useState('Countdown');
  const [cdSec, setCdSec] = useState(10);
  const [cdRunning, setCdRunning] = useState(false);
  const [cdRemain, setCdRemain] = useState(0);
  const tickRef = useRef<any>(null);

  // persist preferenze
  useEffect(()=>{
    try {
      const nws = localStorage.getItem('archei:wsurl') || ENV_WS;
      const nroom = localStorage.getItem('archei:room') || ENV_ROOM;
      setWsUrl(nws); setRoom(nroom);
    } catch {}
  }, []);
  useEffect(()=>{
    try { localStorage.setItem('archei:wsurl', wsUrl); localStorage.setItem('archei:room', room); } catch {}
  }, [wsUrl, room]);

  const canWS = useMemo(()=> mirrorWS && (wsUrl.startsWith('ws://') || wsUrl.startsWith('wss://')), [mirrorWS, wsUrl]);

  const sendWS = (payload: any)=>{
    if (!canWS) return;
    try {
      const ws = new WebSocket(wsUrl + (wsUrl.includes('?')?'&':'?') + 'room=' + encodeURIComponent(room));
      ws.onopen = ()=> { try { ws.send(JSON.stringify(payload)); ws.close(); } catch {} };
    } catch {}
  };

  const broadcastScene = ()=>{
    const scene: SceneState = { title, color, image, visible };
    sendWS({ t:'DISPLAY_SCENE_STATE', room, scene });
  };

  const showBanner = (text: string)=>{
    sendWS({ t:'DISPLAY_BANNER', room, text });
  };

  const startCountdown = ()=>{
    const totalMs = Math.max(1, cdSec) * 1000;
    const state: CountdownState = { running: true, totalMs, remainMs: totalMs, label: cdLabel, startedAt: Date.now() };
    setCdRunning(true); setCdRemain(totalMs);
    sendWS({ t:'DISPLAY_COUNTDOWN', room, countdown: state });

    // tick locale “cosmetico” per mostrare l’andamento nel tool
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(()=>{
      setCdRemain(prev=>{
        const n = Math.max(0, prev-200);
        if (n<=0) { clearInterval(tickRef.current); setCdRunning(false); }
        return n;
      });
    }, 200);
  };

  const stopCountdown = ()=>{
    setCdRunning(false); setCdRemain(0);
    const state: CountdownState = { running: false, totalMs: 0, remainMs: 0, label: cdLabel };
    sendWS({ t:'DISPLAY_COUNTDOWN', room, countdown: state });
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current=null; }
  };

  // auto-anteprima color bg
  const previewBg = image ? `url(${image})` : color;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 bg-neutral-950 border-b border-neutral-800 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-bold">ARCHEI Companion</div>
          <nav className="text-sm flex items-center gap-3">
            <Link href="/">Home</Link>
            <Link href="/tools/clock">Clock</Link>
            <Link href="/display">Display</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 grid gap-5 lg:grid-cols-[360px,1fr]">
        {/* Colonna sinistra: editor */}
        <aside className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 h-fit">
          <div className="text-sm uppercase opacity-70 mb-3">Scene</div>

          <label className="grid gap-1 mb-2">
            <span className="text-xs opacity-70">Titolo</span>
            <input className="px-3 py-2 rounded bg-neutral-800" value={title} onChange={e=>setTitle(e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3 mb-2">
            <label className="grid gap-1">
              <span className="text-xs opacity-70">Colore</span>
              <input type="color" className="h-10 w-full rounded bg-neutral-800 p-1" value={color} onChange={e=>setColor(e.target.value)} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs opacity-70">Immagine (URL)</span>
              <input className="px-3 py-2 rounded bg-neutral-800" placeholder="https://…" value={image} onChange={e=>setImage(e.target.value)} />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={visible} onChange={e=>setVisible(e.target.checked)} />
            Visibile sul display
          </label>

          <div className="flex gap-2 mb-6">
            <button onClick={broadcastScene} className="px-3 py-2 rounded bg-neutral-200 text-neutral-900 font-semibold">Invia al Display</button>
            <button onClick={()=>showBanner(title || 'Scena')} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700">Mostra Banner</button>
          </div>

          <div className="text-sm uppercase opacity-70 mb-2">Countdown</div>
          <div className="grid gap-2">
            <label className="grid gap-1">
              <span className="text-xs opacity-70">Testo</span>
              <input className="px-3 py-2 rounded bg-neutral-800" value={cdLabel} onChange={e=>setCdLabel(e.target.value)} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs opacity-70">Secondi</span>
              <input type="number" min={1} className="px-3 py-2 rounded bg-neutral-800" value={cdSec} onChange={e=>setCdSec(parseInt(e.target.value||'1'))} />
            </label>
            <div className="flex gap-2">
              {!cdRunning ? (
                <button onClick={startCountdown} className="px-3 py-2 rounded bg-neutral-200 text-neutral-900 font-semibold">Avvia</button>
              ) : (
                <button onClick={stopCountdown} className="px-3 py-2 rounded bg-rose-200 text-rose-900 font-semibold">Stop</button>
              )}
              <div className="text-sm opacity-80 self-center">
                {cdRunning ? `In corso: ${(cdRemain/1000).toFixed(1)}s` : 'Fermo'}
              </div>
            </div>
          </div>

          <hr className="my-4 border-neutral-800" />
          <div className="text-sm uppercase opacity-70 mb-2">WebSocket</div>
          <div className="grid gap-2">
            <label className="grid gap-1">
              <span className="text-xs opacity-70">WS URL</span>
              <input className="px-3 py-2 rounded bg-neutral-800" value={wsUrl} onChange={e=>setWsUrl(e.target.value)} placeholder="ws://IP:8787" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs opacity-70">Room</span>
              <input className="px-3 py-2 rounded bg-neutral-800" value={room} onChange={e=>setRoom(e.target.value)} />
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mirrorWS} onChange={e=>setMirrorWS(e.target.checked)} />
              Mirror su WebSocket {canWS ? '🟢' : '🔴'}
            </label>
          </div>
        </aside>

        {/* Colonna destra: anteprima */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 min-h-[420px] relative overflow-hidden">
          <div
            className="absolute inset-0 bg-center bg-cover opacity-40"
            style={{ background: image ? undefined : color, backgroundImage: image ? `url(${image})` : undefined }}
          />
          <div className="relative z-10 h-full grid place-items-center text-center p-6">
            <div>
              <div className="text-3xl font-bold mb-2">{title || 'Titolo Scena'}</div>
              <div className="opacity-80 text-sm">Anteprima locale</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
