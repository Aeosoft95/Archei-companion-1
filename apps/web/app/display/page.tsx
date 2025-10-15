// Server Component: redirect a /display-online con ws/room di default
import { redirect } from 'next/navigation';

export const dynamic = 'force-static';

export default function Page() {
  const ws = process.env.NEXT_PUBLIC_WS_DEFAULT ?? '';
  const room = process.env.NEXT_PUBLIC_ROOM_DEFAULT ?? 'demo';
  const url = `/display-online?ws=${encodeURIComponent(ws)}&room=${encodeURIComponent(room)}`;
  redirect(url);
}
