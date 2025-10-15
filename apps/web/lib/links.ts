export function getWsDefault() {
  return process.env.NEXT_PUBLIC_WS_DEFAULT || 'ws://127.0.0.1:8787';
}

export function getWebBase() {
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}`;
  }
  // fallback build-time: usato raramente
  return 'http://localhost:3000';
}

export function chatAutoConnectURL(params: {
  webBase?: string;
  ws?: string;
  room: string;
  pin?: string;
  role?: 'gm'|'player';
}) {
  const web = params.webBase || getWebBase();
  const ws = params.ws || getWsDefault();
  const role = params.role || 'player';
  const url = new URL(`${web}/tools/chat`);
  url.searchParams.set('ws', ws);
  url.searchParams.set('room', params.room);
  if (params.pin) url.searchParams.set('pin', String(params.pin));
  url.searchParams.set('role', role);
  url.searchParams.set('auto', '1'); // per eventuale auto-join in futuro
  return url.toString();
}

export function displayOnlineURL(params: {
  webBase?: string;
  ws?: string;
  room: string;
  pin?: string;
}) {
  const web = params.webBase || getWebBase();
  const ws = params.ws || getWsDefault();
  const url = new URL(`${web}/display-online`);
  url.searchParams.set('ws', ws);
  url.searchParams.set('room', params.room);
  if (params.pin) url.searchParams.set('pin', String(params.pin));
  return url.toString();
}
