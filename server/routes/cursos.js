// Catálogo de cursos (SPEC-002): lectura para docentes (y admin) al generar
// invitaciones. La gestión (crear/editar) vive en /api/admin/cursos.
import { Router } from 'express';
import pool from '../db.js';
import { soloDocente } from '../middleware/auth.js';

const router = Router();

// GET /api/cursos — solo los activos, listos para un selector.
router.get('/', soloDocente, async (_req, res, next) => {
    try {
        const [cursos] = await pool.query(
            `SELECT id, nombre, paralelo, nivel,
                    CONCAT(nombre, ' ', paralelo) AS etiqueta
             FROM cursos WHERE activo = TRUE
             ORDER BY nombre, paralelo`
        );
        res.json(cursos);
    } catch (err) {
        next(err);
    }
});

export default router;
