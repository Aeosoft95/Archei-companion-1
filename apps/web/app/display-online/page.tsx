'use client';
import { useEffect, useMemo, useState } from 'react';
import type { WireEvent } from '@archei/shared';

function useWS(url: string){
  const ws = useMemo(()=> new WebSocket(url),[url]);
  return ws;
}

export default function DisplayOnline({ searchParams } : any){
  const wsUrl = searchParams?.ws || process.env.NEXT_PUBLIC_WS_DEFAULT || 'ws://localhost:8787';
  const room = searchParams?.room || 'demo';
  const ws = useWS(wsUrl);
  const [banner,setBanner] = useState('');
  const [scene,setScene] = useState<any>({});
  const [time,setTime] = useState<number|undefined>();

  useEffect(()=>{
    ws.onopen = ()=> ws.send(JSON.stringify({ t:'join', room, role:'player', nick:'display' } as WireEvent));
    ws.onmessage = (m)=>{
      const evt = JSON.parse(String(m.data)) as WireEvent|any;
      if (evt.t==='banner') setBanner(evt.text);
      if (evt.t==='scene') setScene({title:evt.title, color:evt.color, image:evt.image});
      if (evt.t==='countdown') setTime(evt.seconds);
    };
    return ()=> ws.close();
  },[ws, room]);

  return (
    <div className="grid gap-4">
      <div className="card min-h-32" style={{background: scene.color||'#111'}}>
        <h1 className="text-3xl font-black">{scene.title||'—'}</h1>
        {scene.image && <img src={scene.image} alt="scene" className="mt-2 max-h-72 rounded-xl"/>}
      </div>
      <div className="card min-h-24"><p className="text-2xl">{banner}</p></div>
      <div className="card min-h-24"><p className="text-2xl">{time!==undefined? `${time}s`:'—'}</p></div>
    </div>
  );
}
