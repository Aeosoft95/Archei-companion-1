export const CHANNEL = {
  display: 'archei-display',
  scene: 'archei-scene',
  chat: 'archei-chat',
  banner: 'archei-banner',
} as const;

export type ChannelKey = keyof typeof CHANNEL;

export function sendLocal<T=any>(key: ChannelKey, payload: T) {
  try {
    const bc = new BroadcastChannel(CHANNEL[key]);
    bc.postMessage(payload);
    bc.close();
  } catch {}
}
