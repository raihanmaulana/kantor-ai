#!/usr/bin/env node
// Memasang hook Kantor AI (opsional) ke Claude Code untuk SEMUA proyek (file ~/.claude/settings.json).
// Server baru membuat task dari hook bila CLAUDE_HOOK_ENABLED=1.
//
//   node install-hooks.mjs --url https://nama-anda.vercel.app --key KUNCI_TULIS
//   node install-hooks.mjs --url http://localhost:3000 --key KUNCI_TULIS     (mode lokal)
//   node install-hooks.mjs --url ... --key ... --no-text   (kirim status saja, tanpa isi prompt/jawaban)
//   node install-hooks.mjs --uninstall
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const has = (name) => args.includes('--' + name);

const claudeDir = join(homedir(), '.claude');
const hookDir = join(claudeDir, 'hooks');
const settingsPath = join(claudeDir, 'settings.json');
const scriptPath = join(hookDir, 'kantor-ai.mjs');
const configPath = join(hookDir, 'kantor-ai.config.json');
const isOurs = (h) => String(h && h.command || '').includes('kantor-ai.mjs');

let settings = {};
if (existsSync(settingsPath)) {
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); }
  catch { console.error(`${settingsPath} bukan JSON yang valid. Perbaiki dulu file itu, lalu jalankan lagi.`); process.exit(1); }
  copyFileSync(settingsPath, settingsPath + '.bak-kantor-ai');
}
settings.hooks ||= {};

// Hapus pemasangan lama (supaya tidak dobel), lalu pasang ulang bila bukan uninstall.
for (const ev of ['UserPromptSubmit', 'Stop']) {
  const groups = (settings.hooks[ev] || [])
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
    .filter((g) => g.hooks.length);
  if (groups.length) settings.hooks[ev] = groups; else delete settings.hooks[ev];
}

if (has('uninstall')) {
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  rmSync(scriptPath, { force: true }); rmSync(configPath, { force: true });
  console.log('Hook Kantor AI sudah dilepas. Mulai ulang Claude Code.');
  process.exit(0);
}

const url = arg('url');
const key = arg('key');
if (!url || !key) {
  console.error('Pakai: node install-hooks.mjs --url https://nama-anda.vercel.app --key KUNCI_TULIS');
  process.exit(1);
}

mkdirSync(hookDir, { recursive: true });
copyFileSync(join(here, 'hooks', 'kantor-ai.mjs'), scriptPath);
writeFileSync(configPath, JSON.stringify({ url, key, sendText: !has('no-text') }, null, 2) + '\n');

// Path absolut ke node dan skrip, garis miring maju supaya jalan di macOS, Linux, dan Windows.
const node = process.execPath.replace(/\\/g, '/');
const script = scriptPath.replace(/\\/g, '/');
const cmd = (m) => `"${node}" "${script}" ${m}`;
(settings.hooks.UserPromptSubmit ||= []).push({ hooks: [{ type: 'command', command: cmd('prompt'), timeout: 5 }] });
(settings.hooks.Stop ||= []).push({ hooks: [{ type: 'command', command: cmd('stop'), timeout: 5 }] });
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

console.log('Hook Kantor AI terpasang.');
console.log('  Skrip   : ' + scriptPath);
console.log('  Config  : ' + configPath + (has('no-text') ? '  (isi prompt tidak dikirim)' : ''));
console.log('  Settings: ' + settingsPath + (existsSync(settingsPath + '.bak-kantor-ai') ? '  (cadangan: settings.json.bak-kantor-ai)' : ''));
console.log('Pastikan server mengizinkan hook: CLAUDE_HOOK_ENABLED=1 di .env atau environment variables Vercel.');
console.log('Mulai ulang Claude Code, lalu coba: npm run test-event');
