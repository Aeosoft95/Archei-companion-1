import Link from 'next/link';

export default function Page(){
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="card">
        <h2 className="text-xl font-bold mb-2">GM Scenes + Countdown</h2>
        <p>Invia scene, banner e countdown al display locale o online.</p>
        <Link className="underline" href="/tools/chat">Apri strumenti</Link>
      </div>
      <div className="card">
        <h2 className="text-xl font-bold mb-2">Display</h2>
        <p>Apri il display locale o connetti quello online ad una stanza.</p>
        <div className="flex gap-3 mt-2">
          <Link className="underline" href="/display">Locale</Link>
          <Link className="underline" href="/display-online">Online</Link>
        </div>
      </div>
    </div>
  )
}
