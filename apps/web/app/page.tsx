'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSession, setSession, clearSession } from '@/lib/session';
import type { Session } from '@/lib/session';

type Role = 'gm' | 'player';

export default function HomeLogin() {
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('player');
  const [showPwd, setShowPwd] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [session, setSessionState] = useState<Session | null>(null);

  // Se esiste già una sessione, la carico e mostro subito la vista post-login
  useEffect(() => {
    const s = getSession();
    if (s) setSessionState(s);
  }, []);

  function validate(): string | null {
    if (!nick.trim()) return 'Inserisci un Nick.';
    if (!password.trim()) return 'Inserisci una password.';
    if (password.length < 4) return 'La password deve avere almeno 4 caratteri.';
    return null;
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);

    const token = btoa(`${nick}:${role}:${Date.now()}`);
    const sess: Session = { nick: nick.trim(), role, token, createdAt: Date.now() };
    setSession(sess);
    setSessionState(sess);
  }

  function logout() {
    clearSession();
    setSessionState(null);
    setNick('');
    setPassword('');
    setRole('player');
  }

  // Vista post-login (provvisoria) con link rapidi e link alla dashboard
  if (session) {
    return (
      <div className="grid gap-6">
        <div className="card">
          <h1 className="text-2xl font-bold">Benvenuto, {session.nick}</h1>
          <p className="opacity-80">Accesso come <strong>{session.role.toUpperCase()}</strong>.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="underline" href="/dashboard">Vai alla Dashboard</Link>
            {session.role === 'gm' ? (
              <>
                <Link className="underline" href="/tools/chat">Tool GM (Chat & Dadi)</Link>
                <Link className="underline" href="/display">Display Locale</Link>
                <Link className="underline" href="/display-online">Display Online</Link>
                <Link className="underline" href="/join">Gestione Join</Link>
              </>
            ) : (
              <>
                <Link className="underline" href="/join">Entra in Stanza (Player)</Link>
                <Link className="underline" href="/display-online">Apri Display Online</Link>
              </>
            )}
          </div>
          <div className="mt-6">
            <button className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700" onClick={logout}>
              Esci
            </button>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-2">Dettagli sessione (temporanei)</h2>
          <pre className="text-xs opacity-80 overflow-auto p-2 bg-neutral-950/40 rounded">{JSON.stringify(session, null, 2)}</pre>
          <p className="text-xs opacity-60 mt-2">
            Nota: in questo step la password non viene inviata a nessun server. Nei prossimi step la valideremo lato backend.
          </p>
        </div>
      </div>
    );
  }

  // Vista pre-login
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="card">
        <h1 className="text-2xl font-bold mb-2">Accedi</h1>
        <p className="opacity-80 mb-4">Entra con il tuo <strong>Nick</strong> e una <strong>Password</strong>. Se sei il GM seleziona il ruolo corrispondente.</p>

        <form className="grid gap-3" onSubmit={handleLogin}>
          <label className="flex items-center gap-3">
            <span className="w-28">Nick</span>
            <input
              className="flex-1 px-3 py-2 bg-neutral-800 rounded"
              autoComplete="username"
              value={nick}
              onChange={e=>setNick(e.target.value)}
            />
          </label>

          <label className="flex items-center gap-3">
            <span className="w-28">Password</span>
            <div className="flex-1 flex items-center gap-2">
              <input
                className="flex-1 px-3 py-2 bg-neutral-800 rounded"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e=>setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={()=>setShowPwd(s=>!s)}
                className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
                aria-label={showPwd ? 'Nascondi password' : 'Mostra password'}
                title={showPwd ? 'Nascondi password' : 'Mostra password'}
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          <label className="flex items-center gap-3">
            <span className="w-28">Ruolo</span>
            <select
              className="flex-1 px-3 py-2 bg-neutral-800 rounded"
              value={role}
              onChange={e=>setRole(e.target.value as Role)}
            >
              <option value="player">Player</option>
              <option value="gm">GM</option>
            </select>
          </label>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <div className="mt-2">
            <button
              type="submit"
              className="px-4 py-2 rounded bg-neutral-200 text-neutral-900 font-semibold"
            >
              Entra
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold mb-2">Cosa vedrai dopo il login</h2>
        <ul className="list-disc list-inside opacity-90 space-y-1">
          <li><strong>GM</strong>: Clock, Scene, Display, Generatore Mostri & NPC, Chat, Note, Tracker combattimenti, Tiradadi, Accesso PG.</li>
          <li><strong>Player</strong>: Scheda, Inventario, Chat, Tiradadi, Display, Note.</li>
        </ul>
        <p className="text-sm opacity-70 mt-3">
          Ora è solo UI locale; al prossimo step aggiungiamo la verifica reale lato server e la dashboard completa.
        </p>
      </div>
    </div>
  );
}
