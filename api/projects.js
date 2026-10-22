// POST   /api/projects        { name, category: 'kantor'|'pribadi', color? }
// DELETE /api/projects?id=..  (menghapus project beserta task-nya)
import { createProject, deleteProject } from '../lib/board.js';
import { writeHandler, body, queryOf } from '../lib/http.js';

export default writeHandler({
  POST: (req) => createProject(body(req)),
  DELETE: (req) => deleteProject(queryOf(req, 'id')),
});
