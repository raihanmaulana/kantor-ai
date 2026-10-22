// POST   /api/tasks           { title, projectId?, description?, priority?, assigneeId?, deadline?, labels? }
// PATCH  /api/tasks?id=..     { status?, title?, description?, priority?, assigneeId?, deadline?, projectId?, labels? }
// DELETE /api/tasks?id=..
// Status "done" dari dashboard selalu lewat "review" (presentasi ke Manager) lalu otomatis selesai.
import { createTask, updateTask, deleteTask } from '../lib/board.js';
import { writeHandler, body, queryOf } from '../lib/http.js';

export default writeHandler({
  POST: (req) => createTask(body(req)),
  PATCH: (req) => updateTask(queryOf(req, 'id'), body(req)),
  DELETE: (req) => deleteTask(queryOf(req, 'id')),
});
