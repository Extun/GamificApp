// Catálogo de cursos (SPEC-002): lectura para docentes (y admin) al generar
// invitaciones. La gestión (crear/editar) vive en /api/admin/cursos.
import { Router } from 'express';
import pool from '../db.js';
import { soloDocente } from '../middleware/auth.js';

const router = Router();

// GET /api/cursos — cursos activos ASIGNADOS al docente en sesión (migración
// 010: el admin decide qué cursos maneja cada docente). Un docente sin cursos
// asignados recibe [] y no puede generar invitaciones hasta que el admin le
// asigne alguno.
router.get('/', soloDocente, async (req, res, next) => {
    try {
        const [cursos] = await pool.query(
            `SELECT c.id, c.nombre, c.paralelo, c.nivel,
                    CONCAT(c.nombre, ' ', c.paralelo) AS etiqueta
             FROM cursos c
             JOIN docente_curso dc ON dc.curso_id = c.id AND dc.docente_id = ?
             WHERE c.activo = TRUE AND c.eliminado_en IS NULL
             ORDER BY c.nombre, c.paralelo`,
            [req.user.id]
        );
        res.json(cursos);
    } catch (err) {
        next(err);
    }
});

export default router;
