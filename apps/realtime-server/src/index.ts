import { WebSocketServer, WebSocket } from 'ws';
import type { WireEvent, Role } from '@archei/shared';
import { rollArchei } from '@archei/shared';

const PORT = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port: PORT });

type Client = { ws: WebSocket, room?: string, nick?: string, role?: Role };

type RoomState = {
  pin?: string;
  clients: Set<Client>;
  createdAt: number;
  createdBy?: string;
};

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(room: string): RoomState {
  let rs = rooms.get(room);
  if (!rs) {
    rs = { clients: new Set(), createdAt: Date.now() };
    rooms.set(room, rs);
  }
  return rs;
}

function joinRoom(c: Client, room: string) {
  c.room = room;
  getOrCreateRoom(room).clients.add(c);
}

function leaveRoom(c: Client) {
  if (!c.room) return;
  const rs = rooms.get(c.room);
  if (!rs) return;
  rs.clients.delete(c);
  if (rs.clients.size === 0) rooms.delete(c.room);
}

function broadcast(room: string, data: any, except?: Client) {
  const rs = rooms.get(room);
  if (!rs) return;
  const msg = JSON.stringify(data);
  for (const client of rs.clients) {
    if (client !== except && client.ws.readyState === client.ws.OPEN) client.ws.send(msg);
  }
}

function send(ws: WebSocket, data: any) {
  try { ws.send(JSON.stringify(data)); } catch {}
}

wss.on('connection', (ws) => {
  const client: Client = { ws };

  ws.on('message', (data) => {
    try {
      const evt = JSON.parse(String(data)) as WireEvent & any;

      // Setup stanza (GM)
      if (evt.t === 'setup') {
        const rs = getOrCreateRoom(evt.room);
        if (!rs.createdBy || rs.createdBy === evt.nick) {
          rs.pin = evt.pin || undefined;
          rs.createdBy = evt.nick || rs.createdBy || 'gm';
          send(ws, { t: 'room-setup', room: evt.room, withPin: !!rs.pin });
        } else {
          send(ws, { t: 'error', error: 'room-already-setup' });
        }
        return;
      }

      // Join (GM/Player/Display)
      if (evt.t === 'join') {
        const rs = getOrCreateRoom(evt.room);
        if (rs.pin && evt.role !== 'display') {
          if (!evt.pin || String(evt.pin) !== String(rs.pin)) {
            return send(ws, { t: 'join-denied', reason: 'bad-pin' });
          }
        }
        client.nick = evt.nick || 'anon';
        client.role = evt.role;
        joinRoom(client, evt.room);
        send(ws, { t: 'joined', room: evt.room, nick: client.nick, role: client.role });
        broadcast(evt.room, { t: 'presence', nicks: Array.from(rs.clients).map(c => c.nick || 'anon') });
        return;
      }

      // Da qui in poi serve essere in stanza
      if (!client.room) return;

      if (evt.t === 'chat') broadcast(client.room, evt);
      else if (evt.t === 'banner') broadcast(client.room, evt);
      else if (evt.t === 'scene') broadcast(client.room, evt);
      else if (evt.t === 'countdown') broadcast(client.room, evt);
      else if (evt.t === 'dice') {
        const result = rollArchei(evt.pool, evt.override);
        broadcast(client.room, { ...evt, result });
      } else if (evt.t === 'ping') {
        send(ws, { t: 'pong', at: Date.now() });
      }
    } catch (e) {
      send(ws, { t: 'error', error: (e as Error).message });
    }
  });

  ws.on('close', () => leaveRoom(client));
});

console.log(`[WS] ARCHEI realtime listening on :${PORT}`);
