'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@/lib/session';
import { getSession, clearSession } from '@/lib/session';
import Link from 'next/link';
import { GuardAuth } from '@/lib/guards';

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/'); return; }
    setSession(s);
  }, [router]);

  if (!session) return <div className="card">Caricamento…</div>;

  const isGM = session.role === 'gm';

  return (
    <GuardAuth>
      <div className="grid gap-6">
        <div className="card">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Ciao, {session.nick}</h1>
              <p className="opacity-80">Ruolo: <strong>{session.role.toUpperCase()}</strong></p>
            </div>
            <button
              className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700"
              onClick={() => { clearSession(); router.replace('/'); }}>
              Esci
            </button>
          </div>
        </div>

        {isGM ? <GmMenu/> : <PlayerMenu/>}
      </div>
    </GuardAuth>
  );
}

function CardLink({ href, children, disabled=false }: { href: string; children: React.ReactNode; disabled?: boolean }) {
  if (disabled) {
    return (
      <div className="card opacity-60 select-none pointer-events-none">
        <div className="font-semibold mb-1">{children}</div>
        <div className="text-sm opacity-70">In arrivo…</div>
      </div>
    );
  }
  return (
    <Link href={href} className="card block hover:bg-neutral-900/80 transition-colors">
      <div className="font-semibold">{children}</div>
    </Link>
  );
}

function GmMenu() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <CardLink href="/tools/chat">Chat & Dadi (GM)</CardLink>
      <CardLink href="/display">Display Locale</CardLink>
      <CardLink href="/display-online">Display Online</CardLink>
      <CardLink href="/join">Gestione Join</CardLink>
      <CardLink href="#" disabled>Clock</CardLink>
      <CardLink href="#" disabled>Scene</CardLink>
      <CardLink href="#" disabled>Generatore Mostri</CardLink>
      <CardLink href="#" disabled>Generatore NPC</CardLink>
      <CardLink href="#" disabled>Note</CardLink>
      <CardLink href="#" disabled>Tracker Combattimenti</CardLink>
      <CardLink href="#" disabled>Accesso PG Player</CardLink>
    </div>
  );
}

function PlayerMenu() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <CardLink href="/join">Entra in Stanza</CardLink>
      <CardLink href="/display-online">Display</CardLink>
      <CardLink href="#" disabled>Scheda</CardLink>
      <CardLink href="#" disabled>Inventario</CardLink>
      <CardLink href="#" disabled>Chat</CardLink>
      <CardLink href="#" disabled>Tiradadi</CardLink>
      <CardLink href="#" disabled>Note</CardLink>
    </div>
  );
}
