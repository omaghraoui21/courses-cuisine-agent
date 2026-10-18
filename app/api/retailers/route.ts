import { getChatGPTUser } from '../../chatgpt-auth';
import { collectAllRetailers, collectRetailer, SOURCES } from '../../../lib/retailers';
export async function GET() {
  if (!await getChatGPTUser()) return Response.json({ error: 'Connexion requise.' }, { status: 401 });
  return Response.json({ retailers: await collectAllRetailers() }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ error: 'Connexion requise.' }, { status: 401 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Origine refusée.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 1024) return Response.json({ error: 'Requête trop volumineuse.' }, { status: 413 });
  try {
    const body = await request.text(); if (body.length > 1024) return Response.json({ error: 'Requête trop volumineuse.' }, { status: 413 });
    const { id } = JSON.parse(body) as { id?: unknown };
    if (typeof id !== 'string' || !SOURCES.some(s => s.id === id)) return Response.json({ error: 'Enseigne inconnue.' }, { status: 400 });
    return Response.json({ retailer: await collectRetailer(id, true) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Requête invalide.' }, { status: 400 }); }
}
