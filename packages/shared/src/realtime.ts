export type Room = string;

export type WireEvent =
  | { t: 'join'; room: Room; role: 'gm'|'player'; nick?: string }
  | { t: 'chat'; room: Room; nick: string; channel: 'global'|'party'|'ooc'|'pm-gm'; text: string }
  | { t: 'dice'; room: Room; nick: string; pool: number; override?: number; result?: any }
  | { t: 'banner'; room: Room; text: string }
  | { t: 'scene'; room: Room; title?: string; color?: string; image?: string }
  | { t: 'countdown'; room: Room; seconds: number; text?: string }
  | { t: 'ping' }
  ;
