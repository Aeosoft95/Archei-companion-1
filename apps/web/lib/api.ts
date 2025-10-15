import type { Role } from './session';

export async function apiLogin(nick: string, password: string, role: Role) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nick, password, role })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Login fallito');
  }
  return res.json() as Promise<{ ok: true; token: string; nick: string; role: Role }>;
}
