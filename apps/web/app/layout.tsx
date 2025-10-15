export const metadata = { title: 'ARCHEI Companion' };

import './styles.css';
import '../styles/globals.css';
import Header from '@/components/Header';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="app-shell">
        <Header />
        <main className="app-main">{children}</main>
        <footer className="app-footer">
          <div className="app-footer-inner">
            <span>© {new Date().getFullYear()} ARCHEI</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
