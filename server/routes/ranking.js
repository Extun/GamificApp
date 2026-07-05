import { Router } from 'express';
import pool from '../db.js';

const router = Router();

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
