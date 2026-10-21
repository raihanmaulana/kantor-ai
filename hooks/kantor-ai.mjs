#!/usr/bin/env node
// Hook Claude Code untuk Kantor AI.
//   node kantor-ai.mjs prompt   -> dipasang di event UserPromptSubmit (Manager menerima tugas)
//   node kantor-ai.mjs stop     -> dipasang di event Stop (Raihan menyetor hasil)
// Selalu keluar dengan kode 0 dan paling lama ~3 detik, jadi tidak pernah menghambat Claude Code.
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] === 'stop' ? 'stop' : 'prompt';
const here = dirname(fileURLToPath(import.meta.url));

let cfg = {};
try { cfg = JSON.parse(readFileSync(join(here, 'kantor-ai.config.json'), 'utf8')); } catch {}
const url = process.env.KANTOR_AI_URL || cfg.url;
const key = process.env.KANTOR_AI_KEY || cfg.key;
const sendText = String(process.env.KANTOR_AI_SEND_TEXT ?? cfg.sendText ?? true) !== 'false';
if (!url || !key) process.exit(0);

let raw = '';
try { for await (const chunk of process.stdin) raw += chunk; } catch {}
let input = {};
try { input = JSON.parse(raw); } catch {}

const project = input.cwd ? basename(String(input.cwd)) : '';
const body = { type: mode, session_id: input.session_id || 'default', project };

if (mode === 'prompt') {
  body.prompt = sendText ? String(input.prompt || '') : `Tugas baru di ${project || 'Claude Code'}`;
} else {
  if (input.stop_hook_active) process.exit(0);
  let text = input.last_assistant_message || '';
  if (!text && input.transcript_path) text = lastAssistantText(String(input.transcript_path));
  body.result = sendText ? text : 'Selesai.';
}

try {
  await fetch(String(url).replace(/\/+$/, '') + '/api/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
} catch {}
process.exit(0);

// Ambil teks jawaban terakhir Claude dari file transkrip (JSONL).
function lastAssistantText(path) {
  try {
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      let o; try { o = JSON.parse(lines[i]); } catch { continue; }
      const m = o.message || o;
      if ((o.type === 'assistant' || m.role === 'assistant') && m.content) {
        const text = Array.isArray(m.content)
          ? m.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n')
          : String(m.content);
        if (text.trim()) return text.trim();
      }
    }
  } catch {}
  return '';
}
