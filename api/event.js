// POST /api/event — dari hook Claude Code (opsional). Aktif hanya bila CLAUDE_HOOK_ENABLED=1.
//   { type: 'prompt', session_id, project, prompt }  → task Open di project "Claude Code" (satu task per sesi)
//   { type: 'stop',   session_id, result }           → task pindah ke Review, menunggu persetujuan Anda
import { recordHookEvent } from '../lib/board.js';
import { writeHandler, body } from '../lib/http.js';

export default writeHandler({
  POST: (req) => recordHookEvent(body(req)),
});
