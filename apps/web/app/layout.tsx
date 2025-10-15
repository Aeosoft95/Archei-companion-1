export const metadata = { title: 'ARCHEI Companion' };

import './styles.css';
import '../styles/globals.css';
import Link from 'next/link';
import Topbar from '@/components/Topbar';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="app-shell">
        {/* Header */}
        <header className="app-header">
          <nav className="app-header-inner">
            <Link href="/" className="font-semibold">ARCHEI Companion</Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/dashboard" className="hover:underline">Dashboard</Link>
              <Link href="/join" className="hover:underline">Join</Link>
              <Link href="/tools/chat" className="hover:underline">Chat & Dadi</Link>
              <Link href="/display" className="hover:underline">Display Locale</Link>
              <Link href="/display-online" className="hover:underline">Display Online</Link>
            </div>
            <Topbar />
          </nav>
        </header>

        {/* Main */}
        <main className="app-main">
          {children}
        </main>

        {/* Footer */}
        <footer className="app-footer">
          <div className="app-footer-inner">
            <span>© {new Date().getFullYear()} ARCHEI</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
