'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSession, setSession as saveSession, clearSession, type Session } from '@/lib/session';
import { apiLogin } from '@/lib/api';

type Role = 'gm' | 'player';

export default function HomeLogin() {
  const router = useRouter();
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('player');
  const [showPwd, setShowPwd] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSessionState] = useState<Session | null>(null);

  // Se già loggato, mostra la vista post-login (ma senza nav in header) e link dashboard
  useEffect(() => { const s = getSession(); if (s) setSessionState(s); }, []);

  function validate(): string | null {
    if (!nick.trim()) return 'Inserisci un Nick.';
    if (!password.trim()) return 'Inserisci una password.';
    if (password.length < 4) return 'La password deve avere almeno 4 caratteri.';
    return null;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const v = validate(); if (v) { setError(v); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await apiLogin(nick.trim(), password, role);
      const sess: Session = { nick: res.nick, role: res.role, token: res.token, createdAt: Date.now() };
      saveSession(sess);
      setSessionState(sess);
      router.push('/dashboard'); // ⬅️ redirect immediato
    } catch {
      const token = btoa(`${nick}:${role}:${Date.now()}`);
      const sess: Session = { nick: nick.trim(), role, token, createdAt: Date.now() };
      saveSession(sess);
      setSessionState(sess);
      router.push('/dashboard'); // ⬅️ redirect anche nel fallback
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearSession();
    setSessionState(null);
    setNick(''); setPassword(''); setRole('player');
  }

  if (session) {
    return (
      <div className="grid gap-6">
        <div className="card">
          <h1 className="text-2xl font-bold">Sei già connesso, {session.nick}</h1>
          <p className="opacity-80">Ruolo: <strong>{session.role.toUpperCase()}</strong></p>
          <div className="mt-4 flex gap-3">
            <Link className="underline" href="/dashboard">Vai alla Dashboard</Link>
            <button className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700" onClick={logout}>Esci</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="card">
        <h1 className="text-2xl font-bold mb-2">Accedi</h1>
        <p className="opacity-80 mb-4">Entra con <strong>Nick</strong> e <strong>Password</strong>. Se sei il GM seleziona il ruolo corrispondente.</p>

        <form className="grid gap-3" onSubmit={handleLogin}>
          <label className="flex items-center gap-3">
            <span className="w-28">Nick</span>
            <input className="flex-1 px-3 py-2 bg-neutral-800 rounded" autoComplete="username"
                   value={nick} onChange={e=>setNick(e.target.value)} />
          </label>

          <label className="flex items-center gap-3">
            <span className="w-28">Password</span>
            <div className="flex-1 flex items-center gap-2">
              <input className="flex-1 px-3 py-2 bg-neutral-800 rounded"
                     type={showPwd ? 'text' : 'password'} autoComplete="current-password"
                     value={password} onChange={e=>setPassword(e.target.value)} />
              <button type="button" onClick={()=>setShowPwd(s=>!s)}
                      className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
                      aria-label={showPwd ? 'Nascondi password' : 'Mostra password'}>
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          <label className="flex items-center gap-3">
            <span className="w-28">Ruolo</span>
            <select className="flex-1 px-3 py-2 bg-neutral-800 rounded"
                    value={role} onChange={e=>setRole(e.target.value as Role)}>
              <option value="player">Player</option>
              <option value="gm">GM</option>
            </select>
          </label>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <div className="mt-2">
            <button type="submit" disabled={busy}
                    className="px-4 py-2 rounded bg-neutral-200 text-neutral-900 font-semibold disabled:opacity-60">
              {busy ? 'Accesso…' : 'Entra'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold mb-2">Dopo l’accesso</h2>
        <ul className="list-disc list-inside opacity-90 space-y-1">
          <li><strong>GM</strong>: strumenti di regia (chat/dadi/display, ecc.).</li>
          <li><strong>Player</strong>: scheda, inventario, chat, dadi, note.</li>
        </ul>
      </div>
    </div>
  );
}
