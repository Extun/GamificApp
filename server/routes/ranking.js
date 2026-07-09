import { Router } from 'express';
import pool from '../db.js';
import { soloDocente } from '../middleware/auth.js';

const router = Router();

// GET /api/ranking/completo — vista completa para docentes/admin (SPEC-004):
// todos los estudiantes activos con posición, curso, XP, retos completados,
// resultados perfectos (base de las insignias con regla real) y su última
// actividad registrada. La lógica del ranking no cambia: mismo orden por
// estudiantes.xp_total con RANK().
router.get('/completo', soloDocente, async (_req, res, next) => {
    try {
        const [filas] = await pool.query(
            `SELECT e.id,
                    CONCAT(e.nombres, ' ', e.apellidos) AS nombre,
                    e.curso,
                    e.xp_total,
                    RANK() OVER (ORDER BY e.xp_total DESC) AS posicion,
                    (SELECT COUNT(*) FROM progreso_estudiante p
                     WHERE p.estudiante_id = e.id AND p.completado) AS completados,
                    (SELECT COUNT(*) FROM progreso_estudiante p
                     WHERE p.estudiante_id = e.id AND p.porcentaje = 100) AS perfectos,
                    (SELECT MAX(p.actualizado_en) FROM progreso_estudiante p
                     WHERE p.estudiante_id = e.id) AS ultima_actividad
             FROM estudiantes e
             WHERE NOT EXISTS (
                 SELECT 1 FROM usuarios u
                 WHERE u.estudiante_id = e.id AND u.eliminado_en IS NOT NULL
             )
             ORDER BY e.xp_total DESC, e.apellidos, e.nombres`
        );
        res.json(filas);
    } catch (err) {
        next(err);
    }
});

// GET /api/ranking?limite=10 — Top N de estudiantes por XP acumulado.
//
// No agrega sobre progreso_estudiante: usa el acumulado ya materializado en
// estudiantes.xp_total (que POST /api/progreso mantiene de forma
// transaccional), así que la consulta es un ORDER BY servido por el índice
// idx_estudiantes_xp. RANK() asigna la misma posición a estudiantes empatados
// en XP.
router.get('/', async (req, res, next) => {
    const limite = Math.min(Math.max(Number(req.query.limite) || 10, 1), 50);

    try {
        const [filas] = await pool.query(
            `SELECT e.id,
                    CONCAT(e.nombres, ' ', e.apellidos) AS nombre,
                    e.curso,
                    e.xp_total,
                    RANK() OVER (ORDER BY e.xp_total DESC) AS posicion
             FROM estudiantes e
             -- Los estudiantes cuya cuenta está en la Papelera (SPEC-003)
             -- no compiten en el ranking mientras estén eliminados.
             WHERE NOT EXISTS (
                 SELECT 1 FROM usuarios u
                 WHERE u.estudiante_id = e.id AND u.eliminado_en IS NOT NULL
             )
             ORDER BY e.xp_total DESC, e.apellidos, e.nombres
             LIMIT ?`,
            [limite]
        );
        res.json(filas);
    } catch (err) {
        next(err);
    }
});

export default router;
