'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getSession, type Session } from '@/lib/session';

export default function SideMenu({ open, onClose }: { open: boolean; onClose: () => void; }) {
  const pathname = usePathname();
  const session: Session | null = typeof window !== 'undefined' ? getSession() : null;
  const isGM = session?.role === 'gm';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => { onClose(); }, [pathname]); // chiudi dopo click link

  const common = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/join', label: 'Join' },
    { href: '/display-online', label: 'Display Online' },
  ];
  const gm = [
    { href: '/tools/chat', label: 'Chat & Dadi (GM)' },
    { href: '/display', label: 'Display Locale' },
  ];

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/50 transition-opacity ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 left-0 h-full w-[85%] sm:w-80 bg-neutral-900 border-r border-neutral-800 shadow-2xl
                    transition-transform duration-200 ease-out z-50 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        role="dialog" aria-modal="true" aria-label="Menu laterale"
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-neutral-800">
          <Link href="/" className="font-semibold" aria-label="Home">ARCHEI Companion</Link>
          <button onClick={onClose} className="p-2 rounded hover:bg-neutral-800" aria-label="Chiudi menu" title="Chiudi">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <nav className="p-3 space-y-6 overflow-y-auto h-[calc(100%-3.5rem)]">
          <div>
            <div className="px-2 text-xs uppercase tracking-wider text-neutral-400 mb-1">Generale</div>
            <ul className="grid gap-1">
              {common.map(i=>(
                <li key={i.href}>
                  <Link href={i.href} className="block px-3 py-2 rounded hover:bg-neutral-800">{i.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {isGM && (
            <div>
              <div className="px-2 text-xs uppercase tracking-wider text-neutral-400 mb-1">GM</div>
              <ul className="grid gap-1">
                {gm.map(i=>(
                  <li key={i.href}>
                    <Link href={i.href} className="block px-3 py-2 rounded hover:bg-neutral-800">{i.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!session && (
            <div className="px-3 py-2 text-sm text-neutral-500">
              Accedi dalla Home per vedere le sezioni del tuo ruolo.
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
