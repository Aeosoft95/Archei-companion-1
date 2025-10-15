'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, clearSession, type Session } from '@/lib/session';

export default function Topbar() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setSession(getSession());
    // aggiorna la topbar se cambia il tab (es. dopo login in altra pagina)
    const onFocus = () => setSession(getSession());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (!session) {
    return (
      <div className="ml-auto text-sm opacity-80">
        Ospite
      </div>
    );
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="text-sm opacity-80">
        {session.nick} · <strong>{session.role.toUpperCase()}</strong>
      </span>
      <button
        className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm"
        onClick={()=>{
          clearSession();
          router.push('/');
        }}
      >
        Esci
      </button>
    </div>
  );
}
