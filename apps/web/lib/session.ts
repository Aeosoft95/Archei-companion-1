export type Role = 'gm' | 'player';

export type Session = {
  nick: string;
  role: Role;
  token: string;      // placeholder: presto verrà dal backend reale
  createdAt: number;
};

const KEY = 'archei.session';

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(sess: Session) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(sess)); } catch {}
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEY); } catch {}
}
