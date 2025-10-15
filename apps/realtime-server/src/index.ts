import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

// Tipi base (allineati al web)
type Clock = {
  id: string;
  name: string;
  segments: number;
  filled: number;
  visible: boolean;
  color?: string;
  icon?: string;
};

// Messaggi accettati/diffusi
type Incoming =
  | { t: 'join'; room: string; nick?: string; role?: string }
  | { t: 'ping' }
  | { t: 'DISPLAY_CLOCKS_STATE'; room?: string; clocks: Clock[] }
  | { t: 'DISPLAY_HIGHLIGHT'; room?: string; clockId: string; type: 'advance'|'complete' }
  // altri eventi chat che già usi possono restare qui
  | Record<string, unknown>;

type Outgoing =
  | { t: 'joined'; room: string; nick?: string; role?: string }
  | { t: 'pong' }
  | { t: 'DISPLAY_CLOCKS_STATE'; room?: string; clocks: Clock[] }
  | { t: 'DISPLAY_HIGHLIGHT'; room?: string; clockId: string; type: 'advance'|'complete' }
  | Record<string, unknown>;

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;

// room -> set di client
const rooms = new Map<string, Set<WebSocket>>();

// client -> room corrente
const clientRoom = new WeakMap<WebSocket, string>();

function getRoomSet(room: string) {
  let set = rooms.get(room);
  if (!set) { set = new Set<WebSocket>(); rooms.set(room, set); }
  return set;
}

function joinRoom(ws: WebSocket, room: string) {
  const current = clientRoom.get(ws);
  if (current && rooms.get(current)) {
    rooms.get(current)!.delete(ws);
  }
  clientRoom.set(ws, room);
  getRoomSet(room).add(ws);
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
  // opzionale: estrai ?room= dalla query di connessione
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const roomFromQuery = url.searchParams.get('room') || undefined;
    if (roomFromQuery) joinRoom(ws, roomFromQuery);
  } catch {}

  ws.on('message', (buf) => {
    let data: Incoming;
    try { data = JSON.parse(buf.toString()); }
    catch { return; }

    // “room effettiva”: preferisci quella nel payload, altrimenti quella salvata
    const payloadRoom = (data as any).room as string | undefined;
    const currentRoom = payloadRoom || clientRoom.get(ws) || 'demo';

    switch ((data as any).t) {
      case 'join': {
        const room = (data as any).room || 'demo';
        joinRoom(ws, room);
        const out: Outgoing = { t: 'joined', room, nick: (data as any).nick, role: (data as any).role };
        try { ws.send(JSON.stringify(out)); } catch {}
        break;
      }
      case 'ping': {
        try { ws.send(JSON.stringify({ t: 'pong' })); } catch {}
        break;
      }
      case 'DISPLAY_CLOCKS_STATE': {
        const ev: Outgoing = { t: 'DISPLAY_CLOCKS_STATE', room: currentRoom, clocks: (data as any).clocks || [] };
        broadcast(currentRoom, ev);
        break;
      }
      case 'DISPLAY_HIGHLIGHT': {
        const ev: Outgoing = {
          t: 'DISPLAY_HIGHLIGHT',
          room: currentRoom,
          clockId: (data as any).clockId,
          type: (data as any).type,
        };
        broadcast(currentRoom, ev);
        break;
      }
      default: {
        // Se hai già eventi chat, rilanciali qui per room
        // broadcast(currentRoom, data as Outgoing);
        break;
      }
    }
  });

  ws.on('close', () => {
    const r = clientRoom.get(ws);
    if (r && rooms.get(r)) rooms.get(r)!.delete(ws);
    clientRoom.delete(ws);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[WS] listening on :${PORT}`);
});
