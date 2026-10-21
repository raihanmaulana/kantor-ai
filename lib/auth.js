import { timingSafeEqual } from 'node:crypto';

// Kunci dikirim sebagai "Authorization: Bearer <kunci>" atau header "x-office-key".
export function keyFrom(req) {
  const h = req.headers || {};
  const auth = String(h.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(h['x-office-key'] || '').trim();
}

export function matches(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}
