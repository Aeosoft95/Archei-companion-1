export const metadata = { title: 'ARCHEI Companion' };

import './styles.css';
import '../styles/globals.css';
import Link from 'next/link';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <nav className="container flex gap-4 py-4">
          <Link href="/">Home</Link>
          <Link href="/join">Join</Link>
          <Link href="/tools/chat">Chat & Dadi</Link>
          <Link href="/display">Display Locale</Link>
          <Link href="/display-online">Display Online</Link>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
