export type Room = string;
export type Role = 'gm' | 'player' | 'display';

export type WireEvent =
  | { t: 'setup'; room: Room; pin?: string; nick?: string }
  | { t: 'room-setup'; room: Room; withPin: boolean }
  | { t: 'join'; room: Room; role: Role; nick?: string; pin?: string }
  | { t: 'join-denied'; reason: 'bad-pin' }
  | { t: 'joined'; room: Room; nick: string; role: Role }
  | { t: 'presence'; nicks: string[] }
  | { t: 'chat'; room: Room; nick: string; channel: 'global'|'party'|'ooc'|'pm-gm'; text: string }
  | { t: 'dice'; room: Room; nick: string; pool: number; override?: number; result?: any }
  | { t: 'banner'; room: Room; text: string }
  | { t: 'scene'; room: Room; title?: string; color?: string; image?: string }
  | { t: 'countdown'; room: Room; seconds: number; text?: string }
  | { t: 'ping' }
  | { t: 'pong'; at: number }
  | { t: 'error'; error: string }
;
