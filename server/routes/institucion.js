// Configuración institucional (SPEC-002): fila única editable por el admin.
// El GET es PÚBLICO (sin token): el Login necesita el nombre, logo y colores
// antes de que exista sesión. Nunca expone datos sensibles.
import { Router } from 'express';
import pool from '../db.js';

const router = Router();

router.get('/', async (_req, res, next) => {
    try {
        const [[inst]] = await pool.query(
            `SELECT nombre, ciudad, provincia, pais, logo_data, favicon_data,
                    color_principal, color_secundario, anio_lectivo, xp_escala_max
             FROM institucion WHERE id = 1`
        );
        // Sin fila todavía (BD nueva a medio inicializar): el frontend usa
        // sus valores por defecto.
        res.json(inst || null);
    } catch (err) {
        next(err);
    }
});

export default router;
