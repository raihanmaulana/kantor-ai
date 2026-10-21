// Penyimpanan kecil: Upstash Redis di Vercel, atau memori biasa saat dijalankan lokal tanpa Redis.
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export const backend = redis ? 'redis' : 'memory';

// Memori bertahan selama proses hidup (cukup untuk mode lokal; di Vercel wajib pakai Redis).
const mem = (globalThis.__kantorMem ||= { kv: new Map(), lists: new Map() });
const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

export async function get(key) {
  if (redis) return await redis.get(key);
  return clone(mem.kv.get(key));
}

export async function set(key, value, ttlSeconds) {
  if (redis) return ttlSeconds ? redis.set(key, value, { ex: ttlSeconds }) : redis.set(key, value);
  mem.kv.set(key, clone(value));
}

export async function incr(key) {
  if (redis) return await redis.incr(key);
  const n = Number(mem.kv.get(key) || 0) + 1;
  mem.kv.set(key, n);
  return n;
}

export async function pushFront(key, value, keep) {
  if (redis) {
    await redis.lpush(key, value);
    await redis.ltrim(key, 0, keep - 1);
    return;
  }
  const list = mem.lists.get(key) || [];
  list.unshift(value);
  mem.lists.set(key, list.slice(0, keep));
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
