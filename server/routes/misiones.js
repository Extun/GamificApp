import { Router } from 'express';
import { obtenerMisionesEstudiante } from '../lib/misiones.js';

const router = Router();

const esIdValido = (n) => Number.isInteger(n) && n > 0;

// GET /api/misiones — catálogo de misiones del estudiante en sesión con su
// progreso, estado (bloqueada|disponible|completada) y recompensas. Evalúa
// primero para reflejar acciones recientes (incluidas las que dependen del
// ranking). Solo el propio estudiante (docente/admin no tienen "sus" misiones).
router.get('/', async (req, res, next) => {
    if (req.user.rol !== 'estudiante' || !esIdValido(req.user.estudiante_id)) {
        return res.status(403).json({ error: 'Solo los estudiantes tienen misiones' });
    }
    try {
        const data = await obtenerMisionesEstudiante(req.user.estudiante_id);
        res.json(data);
    } catch (err) {
        next(err);
    }
});

export default router;
