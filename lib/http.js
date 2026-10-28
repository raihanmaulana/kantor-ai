// Kunci baca untuk halaman dan API.
import { timingSafeEqual } from 'node:crypto';

function matches(given, expected) {
  const a = Buffer.from(String(given || '')), b = Buffer.from(String(expected || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
function header(req, name) {
  const v = (req.headers || {})[name];
  return Array.isArray(v) ? v[0] : v || '';
}
export function canRead(req) {
  const readKey = process.env.OFFICE_READ_KEY;
  if (!readKey) return true;
  return matches(header(req, 'x-office-key'), readKey);
}
