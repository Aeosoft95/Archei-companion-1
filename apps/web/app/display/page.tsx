'use client';
import { useEffect, useState } from 'react';
import { CHANNEL } from '@archei/shared';

export default function Display(){
  const [banner,setBanner] = useState<string>('');
  const [scene,setScene] = useState<{title?:string;color?:string;image?:string}>({});
  const [time,setTime] = useState<number|undefined>();

  useEffect(()=>{
    const bcBanner = new BroadcastChannel(CHANNEL.banner);
    bcBanner.onmessage = (e)=> setBanner(e.data);
    const bcScene = new BroadcastChannel(CHANNEL.scene);
    bcScene.onmessage = (e)=> setScene(e.data);
    const bcCD = new BroadcastChannel('archei-countdown');
    bcCD.onmessage = (e)=> setTime(e.data);
    return ()=>{ bcBanner.close(); bcScene.close(); bcCD.close(); }
  },[]);

  return (
    <div className="grid gap-6">
      <div className="card minh-32" style={{background: scene.color||'#111'}}>
        <h1 className="text-3xl font-black">{scene.title||'—'}</h1>
        {scene.image && <img src={scene.image} alt="scene" className="mt-2 max-h-72 rounded-xl"/>}
      </div>
      <div className="card minh-24"><p className="text-2xl">{banner}</p></div>
      <div className="card minh-24"><p className="text-2xl">{time!==undefined? `${time}s`:'—'}</p></div>
    </div>
  );
}
