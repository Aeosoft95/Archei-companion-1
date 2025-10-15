import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

type Clock = {
  id: string;
  name: string;
  segments: number;
  filled: number;
  visible: boolean;
  color?: string;
  icon?: string;
};

// Chat
type ChatJoin = { t: 'chat:join'; room: string; nick: string; role?: string };
type ChatMsg  = { t: 'chat:msg'; room: string; nick: string; text: string; ts?: number; channel?: string };
type ChatPres = { t: 'chat:presence'; room: string; nicks: string[] };

// Scene / Display
type SceneState = {
  title?: string;
  color?: string; // es. #222222
  image?: string; // URL (opz.)
  visible?: boolean;
};

type CountdownState = {
  running: boolean;
  totalMs: number;
  remainMs: number;
  label?: string;
  startedAt?: number; // ms epoch (facoltativo)
};

type Incoming =
  | { t: 'join'; room: string; nick?: string; role?: string }
  | { t: 'ping' }
  // CLOCK
  | { t: 'DISPLAY_CLOCKS_STATE'; room?: string; clocks: Clock[] }
  | { t: 'DISPLAY_HIGHLIGHT'; room?: string; clockId: string; type: 'advance'|'complete' }
  // CHAT
  | ChatJoin
  | ChatMsg
  // SCENE / COUNTDOWN / BANNER
  | { t: 'DISPLAY_SCENE_STATE'; room?: string; scene: SceneState }
  | { t: 'DISPLAY_BANNER'; room?: string; text: string }
  | { t: 'DISPLAY_COUNTDOWN'; room?: string; countdown: CountdownState }
  | Record<string, unknown>;

type Outgoing =
  | { t: 'joined'; room: string; nick?: string; role?: string }
  | { t: 'pong' }
  | { t: 'DISPLAY_CLOCKS_STATE'; room?: string; clocks: Clock[] }
  | { t: 'DISPLAY_HIGHLIGHT'; room?: string; clockId: string; type: 'advance'|'complete' }
  | ChatMsg
  | ChatPres
  | { t: 'DISPLAY_SCENE_STATE'; room?: string; scene: SceneState }
  | { t: 'DISPLAY_BANNER'; room?: string; text: string }
  | { t: 'DISPLAY_COUNTDOWN'; room?: string; countdown: CountdownState }
  | Record<string, unknown>;

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;

// room -> clients
const rooms = new Map<string, Set<WebSocket>>();
const clientRoom = new WeakMap<WebSocket, string>();
const clientNick = new WeakMap<WebSocket, string>();

// stato semplice per display (facoltativo: così i nuovi display vedono subito lo stato corrente)
const sceneByRoom = new Map<string, SceneState>();
const countdownByRoom = new Map<string, CountdownState>();

function getRoomSet(room: string) {
  let set = rooms.get(room);
  if (!set) { set = new Set<WebSocket>(); rooms.set(room, set); }
  return set;
}

function currentNicks(room: string): string[] {
  const set = rooms.get(room);
  if (!set) return [];
  const all: string[] = [];
  for (const cli of set) {
    const n = clientNick.get(cli);
    if (n) all.push(n);
  }
  return all;
}

function joinRoom(ws: WebSocket, room: string) {
  const prev = clientRoom.get(ws);
  if (prev && rooms.get(prev)) rooms.get(prev)!.delete(ws);
  clientRoom.set(ws, room);
  getRoomSet(room).add(ws);

  // appena entra un display nuovo, mandagli stato corrente (scene + countdown) se esiste
  const scene = sceneByRoom.get(room);
  if (scene) try { ws.send(JSON.stringify({ t: 'DISPLAY_SCENE_STATE', room, scene })); } catch {}
  const cd = countdownByRoom.get(room);
  if (cd) try { ws.send(JSON.stringify({ t: 'DISPLAY_COUNTDOWN', room, countdown: cd })); } catch {}
}

function broadcast(room: string, msg: Outgoing) {
  const set = rooms.get(room);
  if (!set) return;
  const raw = JSON.stringify(msg);
  for (const cli of set) {
    if (cli.readyState === WebSocket.OPEN) {
      try { cli.send(raw); } catch {}
    }
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('ARCHEI realtime WS OK');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const qRoom = url.searchParams.get('room') || undefined;
    if (qRoom) joinRoom(ws, qRoom);
  } catch {}

  ws.on('message', (buf) => {
    let data: Incoming;
    try { data = JSON.parse(buf.toString()); }
    catch { return; }

    const payloadRoom = (data as any).room as string | undefined;
    const room = payloadRoom || clientRoom.get(ws) || 'demo';

    switch ((data as any).t) {
      case 'join': {
        joinRoom(ws, room);
        try { ws.send(JSON.stringify({ t:'joined', room, nick:(data as any).nick, role:(data as any).role })); } catch {}
        break;
      }
      case 'ping': {
        try { ws.send(JSON.stringify({ t:'pong' })); } catch {}
        break;
      }

      // CLOCK
      case 'DISPLAY_CLOCKS_STATE': {
        const ev: Outgoing = { t: 'DISPLAY_CLOCKS_STATE', room, clocks: (data as any).clocks || [] };
        broadcast(room, ev);
        break;
      }
      case 'DISPLAY_HIGHLIGHT': {
        const ev: Outgoing = { t: 'DISPLAY_HIGHLIGHT', room, clockId: (data as any).clockId, type: (data as any).type };
        broadcast(room, ev);
        break;
      }

      // CHAT
      case 'chat:join': {
        joinRoom(ws, room);
        const nick = (data as any).nick || 'Anon';
        clientNick.set(ws, nick);
        const pres: ChatPres = { t:'chat:presence', room, nicks: currentNicks(room) };
        broadcast(room, pres);
        break;
      }
      case 'chat:msg': {
        const nick = (data as any).nick || clientNick.get(ws) || 'Anon';
        const text = (data as any).text || '';
        const channel = (data as any).channel || 'global';
        const ts = (data as any).ts || Date.now();
        const msg: ChatMsg = { t:'chat:msg', room, nick, text, ts, channel };
        broadcast(room, msg);
        break;
      }

      // SCENE / BANNER / COUNTDOWN
      case 'DISPLAY_SCENE_STATE': {
        const scene = (data as any).scene || {};
        sceneByRoom.set(room, scene);
        broadcast(room, { t: 'DISPLAY_SCENE_STATE', room, scene });
        break;
      }
      case 'DISPLAY_BANNER': {
        const text = (data as any).text || '';
        broadcast(room, { t: 'DISPLAY_BANNER', room, text });
        break;
      }
      case 'DISPLAY_COUNTDOWN': {
        const countdown = (data as any).countdown || {};
        countdownByRoom.set(room, countdown);
        broadcast(room, { t: 'DISPLAY_COUNTDOWN', room, countdown });
        break;
      }

      default: break;
    }
  });

  ws.on('close', () => {
    const r = clientRoom.get(ws);
    if (r && rooms.get(r)) rooms.get(r)!.delete(ws);
    clientNick.delete(ws);
    clientRoom.delete(ws);
    if (r) {
      const pres: ChatPres = { t:'chat:presence', room: r, nicks: currentNicks(r) };
      broadcast(r, pres);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[WS] listening on :${PORT}`);
});
