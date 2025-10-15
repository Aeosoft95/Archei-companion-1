'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, type Session } from '@/lib/session';

export function useSession(): Session | null {
  const [s, setS] = useState<Session | null>(null);
  useEffect(() => { setS(getSession()); }, []);
  return s;
}

/** Blocca l'accesso se non loggato → redirect alla Home */
export function GuardAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) router.replace('/');
    else setOk(true);
  }, [router]);

  if (!ok) return null;
  return <>{children}</>;
}

/** Consente solo il ruolo richiesto (gm|player). Se diverso → /dashboard */
export function GuardRole({ allow, children }: { allow: 'gm' | 'player', children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/'); return; }
    if (s.role !== allow) { router.replace('/dashboard'); return; }
    setOk(true);
  }, [router, allow]);

  if (!ok) return null;
  return <>{children}</>;
}
