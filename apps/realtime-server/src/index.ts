import { WebSocketServer, WebSocket } from 'ws';
import type { WireEvent } from '@archei/shared';
import { rollArchei } from '@archei/shared';

const PORT = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port: PORT });

type Client = { ws: WebSocket, room?: string, nick?: string, role?: 'gm'|'player' };
const rooms = new Map<string, Set<Client>>();

function joinRoom(c: Client, room: string) {
  c.room = room;
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(c);
}

function broadcast(room: string, data: any, except?: Client) {
  const set = rooms.get(room);
  if (!set) return;
  const msg = JSON.stringify(data);
  for (const client of set) {
    if (client !== except && client.ws.readyState === client.ws.OPEN) client.ws.send(msg);
  }
}

wss.on('connection', (ws) => {
  const client: Client = { ws };

  ws.on('message', (data) => {
    try {
      const evt: WireEvent = JSON.parse(String(data));
      if (evt.t === 'join') {
        joinRoom(client, evt.room);
        client.nick = evt.nick || 'anon';
        client.role = evt.role;
        ws.send(JSON.stringify({ t: 'joined', room: evt.room, nick: client.nick, role: client.role }));
        return;
      }
      if (!client.room) return;

      if (evt.t === 'chat') broadcast(client.room, evt);
      else if (evt.t === 'banner') broadcast(client.room, evt);
      else if (evt.t === 'scene') broadcast(client.room, evt);
      else if (evt.t === 'countdown') broadcast(client.room, evt);
      else if (evt.t === 'dice') {
        const result = rollArchei(evt.pool, evt.override);
        broadcast(client.room, { ...evt, result });
      } else if (evt.t === 'ping') {
        ws.send(JSON.stringify({ t: 'pong', at: Date.now() }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ t: 'error', error: (e as Error).message }));
    }
  });

  ws.on('close', () => {
    if (client.room && rooms.has(client.room)) {
      rooms.get(client.room)!.delete(client);
      if (rooms.get(client.room)!.size === 0) rooms.delete(client.room);
    }
  });
});

console.log(`[WS] ARCHEI realtime listening on :${PORT}`);
