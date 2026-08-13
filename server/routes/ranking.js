import { Router } from 'express';
import pool from '../db.js';
import { soloDocente, puedeGestionarMateria } from '../middleware/auth.js';
import { sqlAulaDocente } from '../lib/estudiantes.js';

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

// GET /api/ranking/materia/:materia_id?limite=3 — Top N DE UNA MATERIA
// (SPEC-025), no de la institución.
//
// Dos diferencias con el Top global, y las dos son el punto de la ruta:
//   1. El XP se suma SOLO por lo jugado en esa materia
//      (progreso_estudiante → retos.materia_id), no `estudiantes.xp_total`,
//      que además incluye el XP de las Misiones (SPEC-007), que no pertenece
//      a ninguna materia.
//   2. Solo compiten los estudiantes del AULA de quien pregunta — mismo
//      criterio único que `mis-estudiantes` y el resto del panel
//      (`sqlAulaDocente`, SPEC-014 F6). El admin no tiene ese límite.
//
// `HAVING > 0`: quien tiene progreso registrado pero 0 XP no es un "top";
// listarlo como «0 pts» era ruido que además hacía mentir al estado vacío.
router.get('/materia/:materia_id', soloDocente, async (req, res, next) => {
    const materiaId = Number(req.params.materia_id);
    const limite = Math.min(Math.max(Number(req.query.limite) || 3, 1), 50);
    if (!Number.isInteger(materiaId) || materiaId <= 0) {
        return res.status(400).json({ error: 'materia_id debe ser un entero positivo' });
    }

    try {
        // Misma autoridad que para publicar contenido: el docente solo puede
        // mirar el ranking de las materias que el admin le asignó.
        if (!(await puedeGestionarMateria(req.user, materiaId))) {
            return res.status(403).json({ error: 'No tienes acceso a esa materia' });
        }

        const esAdmin = req.user.rol === 'admin';
        const params = esAdmin
            ? [materiaId, limite]
            : [materiaId, req.user.id, req.user.id, limite];

        const [filas] = await pool.query(
            `SELECT e.id,
                    CONCAT(e.nombres, ' ', e.apellidos) AS nombre,
                    e.curso,
                    -- CAST: SUM() de un entero devuelve DECIMAL, y mysql2 lo
                    -- entrega como cadena; el cliente necesita un número.
                    CAST(SUM(p.xp_obtenido) AS SIGNED) AS xp_materia,
                    RANK() OVER (ORDER BY SUM(p.xp_obtenido) DESC) AS posicion
             FROM progreso_estudiante p
             -- Retos en la Papelera: su XP no cuenta mientras estén eliminados
             -- (mismo criterio que GET /api/progreso/:id).
             JOIN retos r ON r.id = p.reto_id
                         AND r.materia_id = ?
                         AND r.eliminado_en IS NULL
             JOIN estudiantes e ON e.id = p.estudiante_id
             -- Cuentas en la Papelera (SPEC-003): no compiten, igual que en el
             -- Top global.
             WHERE NOT EXISTS (
                 SELECT 1 FROM usuarios u
                 WHERE u.estudiante_id = e.id AND u.eliminado_en IS NOT NULL
             )
             ${esAdmin ? '' : `AND ${sqlAulaDocente('e.id')}`}
             GROUP BY e.id, e.nombres, e.apellidos, e.curso
             HAVING SUM(p.xp_obtenido) > 0
             ORDER BY xp_materia DESC, e.apellidos, e.nombres
             LIMIT ?`,
            params
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
