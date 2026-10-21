// Penyimpanan kecil:
//  - Upstash Redis bila variabelnya ada (wajib di Vercel).
//  - File JSON (data/kantor-ai.json) saat dijalankan lokal, jadi data tetap ada walau server dimatikan.
import { Redis } from '@upstash/redis';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const dataFile = !redis && !process.env.VERCEL
  ? (process.env.KANTOR_DATA_FILE || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'kantor-ai.json'))
  : null;

export const backend = redis ? 'redis' : dataFile ? 'file' : 'memory';

const mem = (globalThis.__kantorMem ||= loadFile());
const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

function loadFile() {
  const empty = { kv: new Map(), lists: new Map() };
  if (!dataFile || !existsSync(dataFile)) return empty;
  try {
    const raw = JSON.parse(readFileSync(dataFile, 'utf8'));
    return { kv: new Map(raw.kv || []), lists: new Map(raw.lists || []) };
  } catch {
    return empty;
  }
}

let saveTimer = null;
function scheduleSave() {
  if (!dataFile) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(dataFile), { recursive: true });
      const tmp = dataFile + '.tmp';
      writeFileSync(tmp, JSON.stringify({ kv: [...mem.kv], lists: [...mem.lists] }));
      renameSync(tmp, dataFile);
    } catch (err) {
      console.error('Gagal menyimpan data lokal:', err.message);
    }
  }, 200);
}

export async function get(key) {
  if (redis) return await redis.get(key);
  return clone(mem.kv.get(key));
}

export async function set(key, value, ttlSeconds) {
  if (redis) return ttlSeconds ? redis.set(key, value, { ex: ttlSeconds }) : redis.set(key, value);
  mem.kv.set(key, clone(value));
  scheduleSave();
}

export async function del(key) {
  if (redis) return redis.del(key);
  mem.kv.delete(key);
  scheduleSave();
}

export async function incr(key, ttlSeconds) {
  if (redis) {
    const n = await redis.incr(key);
    if (ttlSeconds && n === 1) await redis.expire(key, ttlSeconds);
    return n;
  }
  const n = Number(mem.kv.get(key) || 0) + 1;
  mem.kv.set(key, n);
  scheduleSave();
  return n;
}

// Tambah di depan daftar dan potong ke `keep` item. Mengembalikan item yang terbuang (hanya mode lokal).
export async function pushFront(key, value, keep) {
  if (redis) {
    await redis.lpush(key, value);
    await redis.ltrim(key, 0, keep - 1);
    return [];
  }
  const list = mem.lists.get(key) || [];
  list.unshift(value);
  mem.lists.set(key, list.slice(0, keep));
  scheduleSave();
  return list.slice(keep);
}

export async function range(key, start, stop) {
  if (redis) return (await redis.lrange(key, start, stop)) || [];
  return (mem.lists.get(key) || []).slice(start, stop + 1);
}

export async function getMany(keys) {
  if (!keys.length) return [];
  if (redis) return (await redis.mget(...keys)) || [];
  return keys.map((k) => clone(mem.kv.get(k)));
}
