// Tipi condivisi tra web e ws (facoltativo)

export type Clock = {
  id: string;
  name: string;
  segments: number;
  filled: number;
  visible: boolean;
  color?: string;
  icon?: string;
};

export type DisplayStateEv = { t: 'DISPLAY_CLOCKS_STATE'; room?: string; clocks: Clock[] };
export type DisplayHiEv   = { t: 'DISPLAY_HIGHLIGHT'; room?: string; clockId: string; type: 'advance'|'complete' };

export type JoinEv = { t: 'join'; room: string; nick?: string; role?: string };
export type JoinedEv = { t: 'joined'; room: string; nick?: string; role?: string };

export type Incoming = JoinEv | { t: 'ping' } | DisplayStateEv | DisplayHiEv | Record<string, unknown>;
export type Outgoing = JoinedEv | { t: 'pong' } | DisplayStateEv | DisplayHiEv | Record<string, unknown>;
