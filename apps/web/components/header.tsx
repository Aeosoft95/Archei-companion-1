'use client';
import Link from 'next/link';
import { useState } from 'react';
import Topbar from '@/components/Topbar';
import SideMenu from '@/components/SideMenu';

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="app-header">
        <nav className="app-header-inner gap-3">
          {/* Hamburger: apre il menù laterale */}
          <button
            onClick={()=>setOpen(true)}
            className="p-2 rounded hover:bg-neutral-800"
            aria-label="Apri menu"
            title="Apri menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Solo titolo/brand */}
          <Link href="/" className="font-semibold">ARCHEI Companion</Link>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Nessun link fisso: solo Topbar (nick/ruolo + Esci) */}
          <Topbar />
        </nav>
      </header>

      {/* Drawer laterale con tutte le voci */}
      <SideMenu open={open} onClose={()=>setOpen(false)} />
    </>
  );
}
