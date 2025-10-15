'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const ITEMS = [
  { href: '/', label: 'Dashboard GM' },
  { href: '/tools/chat', label: 'Chat' },
  { href: '/tools/scene', label: 'Scene' },
  { href: '/tools/clock', label: 'Clock' },
  { href: '/display', label: 'Display' },
];

export default function ToolsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-1.5 lg:hidden"
            onClick={() => setOpen(v => !v)}
            aria-label="Apri menu"
          >
            ☰ Menu
          </button>
          <Link href="/" className="font-semibold">ARCHEI Companion</Link>
          <div className="opacity-0 lg:opacity-0" />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[220px,1fr]">
        {/* overlay mobile */}
        {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={()=>setOpen(false)} />}

        {/* sidebar piatta */}
        <aside
          className={
            'fixed z-40 left-0 top-14 h-[calc(100vh-3.5rem)] w-64 -translate-x-full overflow-y-auto ' +
            'border-r border-neutral-800 bg-neutral-900 p-3 shadow-xl transition-transform duration-200 ' +
            (open ? 'translate-x-0' : '') +
            ' lg:static lg:h-auto lg:w-auto lg:translate-x-0 lg:border lg:rounded-2xl'
          }
        >
          <nav className="grid gap-1">
            {ITEMS.map(it => {
              const active = pathname === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={
                    'block px-3 py-2 rounded-lg transition-colors ' +
                    (active
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-300 hover:bg-neutral-800/60 hover:text-white')
                  }
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* contenuto */}
        <section className="min-h-[60vh] rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3">
          {children}
        </section>
      </div>
    </div>
  );
}
