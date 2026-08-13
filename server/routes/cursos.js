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
//
// El ADMIN no pasa por `docente_curso` —esa tabla es solo de docentes—, así que
// filtrar por ella le devolvía SIEMPRE [] y le dejaba vacíos todos los
// selectores de curso del panel (crear actividad, generador de IA, misiones,
// filtro de la Biblioteca). Desde SPEC-026 `curso_id` decide quién ve el
// contenido, así que un selector vacío significaba que el administrador no
// podía dirigir nada a ningún curso. Ve todos los vivos, que es exactamente lo
// que `puedeDirigirACurso` ya le autoriza (SPEC-026 §2.4).
router.get('/', soloDocente, async (req, res, next) => {
    try {
        const esAdmin = req.user?.rol === 'admin';
        const [cursos] = await pool.query(
            `SELECT c.id, c.nombre, c.paralelo, c.nivel,
                    CONCAT(c.nombre, ' ', c.paralelo) AS etiqueta
             FROM cursos c
             ${esAdmin ? '' : 'JOIN docente_curso dc ON dc.curso_id = c.id AND dc.docente_id = ?'}
             WHERE c.activo = TRUE AND c.eliminado_en IS NULL
             ORDER BY c.nombre, c.paralelo`,
            esAdmin ? [] : [req.user.id]
        );
        res.json(cursos);
    } catch (err) {
        next(err);
    }
});

export default router;
