'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Role = 'gm' | 'player';

type Session = {
  nick: string;
  role: Role;
  // placeholder token temporaneo lato client, in futuro lo emetterà il server
  token: string;
  createdAt: number;
};

export default function HomeLogin() {
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('player');
  const [showPwd, setShowPwd] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  // Carica eventuale sessione salvata
  useEffect(() => {
    try {
      const raw = localStorage.getItem('archei.session');
      if (raw) setSession(JSON.parse(raw));
    } catch {}
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
    if (v) {
      setError(v);
      return;
    }
    setError(null);

    // NOTE: per ora generiamo un token lato client (placeholder)
    // In uno step successivo lo otterremo dal server (WS/HTTP) con verifica reale.
    const token = btoa(`${nick}:${role}:${Date.now()}`);
    const sess: Session = {
      nick: nick.trim(),
      role,
      token,
      createdAt: Date.now(),
    };
    try {
      localStorage.setItem('archei.session', JSON.stringify(sess));
    } catch {}
    setSession(sess);
  }

  function logout() {
    try { localStorage.removeItem('archei.session'); } catch {}
    setSession(null);
    setNick('');
    setPassword('');
    setRole('player');
  }

  // UI post-login (provvisorio): mostra link rapidi in base al ruolo
  if (session) {
    return (
      <div className="grid gap-6">
        <div className="card">
          <h1 className="text-2xl font-bold">Benvenuto, {session.nick}</h1>
          <p className="opacity-80">Accesso come <strong>{session.role.toUpperCase()}</strong>.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {session.role === 'gm' ? (
              <>
                <Link className="underline" href="/tools/chat">Apri Tool GM (Chat & Dadi)</Link>
                <Link className="underline" href="/display">Display Locale</Link>
                <Link className="underline" href="/display-online">Display Online</Link>
                <Link className="underline" href="/join">Gestione Join</Link>
                {/* Questi li implementeremo nei prossimi step */}
                {/* <Link className="underline opacity-60 pointer-events-none" href="#">Clock</Link> */}
                {/* <Link className="underline opacity-60 pointer-events-none" href="#">Scene</Link> */}
                {/* <Link className="underline opacity-60 pointer-events-none" href="#">Generatore Mostri</Link> */}
                {/* <Link className="underline opacity-60 pointer-events-none" href="#">Generatore NPC</Link> */}
                {/* <Link className="underline opacity-60 pointer-events-none" href="#">Note</Link> */}
                {/* <Link className="underline opacity-60 pointer-events-none" href="#">Tracker Combattimenti</Link> */}
              </>
            ) : (
              <>
                <Link className="underline" href="/join">Entra in Stanza (Player)</Link>
                <Link className="underline" href="/display-online">Apri Display Online</Link>
                {/* Placeholder in attesa della dashboard Player */}
                {/* <Link className="underline opacity-60 pointer-events-none" href="#">Scheda</Link> */}
                {/* <Link className="underline opacity-60 pointer-events-none" href="#">Inventario</Link> */}
                {/* <Link className="underline opacity-60 pointer-events-none" href="#">Chat</Link> */}
                {/* <Link className="underline opacity-60 pointer-events-none" href="#">Tiradadi</Link> */}
                {/* <Link className="underline opacity-60 pointer-events-none" href="#">Note</Link> */}
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
            Nota: in questo step la password non viene inviata a nessun server. Verrà validata sul backend nei prossimi step.
          </p>
        </div>
      </div>
    );
  }

  // UI pre-login: form Nick/Password/Ruolo
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
          In questo step configuriamo solo il login locale (UI e stato). Nei prossimi passi collegheremo il backend per una
          <em>autenticazione reale</em> e una <em>dashboard</em> differenziata.
        </p>
      </div>
    </div>
  );
}
