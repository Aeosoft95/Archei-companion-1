export async function POST() {
  try {
    // Qui potresti mandare un messaggio di broadcast o ping al WS
    // oppure, se vuoi, farlo restartare via PM2 o script interno.
    console.log('Richiesto riavvio WS (placeholder)');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
}
