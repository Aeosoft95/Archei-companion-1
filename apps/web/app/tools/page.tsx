'use client';
import ToolsShell from '@/components/ToolsShell';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ToolsHome() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // 🔄 ricarica l'interfaccia
  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      router.refresh();
      window.location.reload();
    }, 500);
  };

  // ♻️ riavvia server WS (chiude e riapre la connessione lato GM)
  const handleRestart = () => {
    setRestarting(true);
    fetch('/api/restart-ws', { method: 'POST' })
      .catch(() => console.warn('Nessun endpoint WS di riavvio trovato'))
      .finally(() => setTimeout(() => setRestarting(false), 1000));
  };

  return (
    <ToolsShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Pannello GM</h1>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm"
            disabled={refreshing}
          >
            🔄 {refreshing ? 'Ricarico…' : 'Ricarica Console'}
          </button>

          <button
            onClick={handleRestart}
            className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm"
            disabled={restarting}
          >
            ♻️ {restarting ? 'Riavvio…' : 'Riavvia WS'}
          </button>
        </div>
      </div>

      <div className="text-neutral-300">
        <p>Benvenuto nella console del GM. Da qui puoi accedere ai tuoi strumenti:</p>
        <ul className="list-disc list-inside mt-3">
          <li>Gestisci <b>Chat</b> tra giocatori e GM</li>
          <li>Mostra <b>Scene</b> e <b>Countdown</b> sul display</li>
          <li>Controlla e concatena i <b>Clock</b></li>
          <li>Lancia i <b>Dadi</b> del sistema ARCHEI</li>
        </ul>
      </div>
    </ToolsShell>
  );
}
