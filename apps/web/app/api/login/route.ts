import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { nick, password, role } = await req.json();
    if (!nick || !password || !role) {
      return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 });
    }
    if (typeof nick !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Formati non validi' }, { status: 400 });
    }
    if (password.length < 4) {
      return NextResponse.json({ error: 'Password troppo corta' }, { status: 400 });
    }
    if (role !== 'gm' && role !== 'player') {
      return NextResponse.json({ error: 'Ruolo non valido' }, { status: 400 });
    }

    // Regole minime (demo): se vuoi forzare un “super GM”
    // if (role === 'gm' && password !== 'gm1234') {
    //   return NextResponse.json({ error: 'Password GM errata' }, { status: 401 });
    // }

    const token = Buffer.from(`${nick}:${role}:${Date.now()}`).toString('base64');
    return NextResponse.json({ ok: true, token, nick, role });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Errore interno' }, { status: 500 });
  }
}
