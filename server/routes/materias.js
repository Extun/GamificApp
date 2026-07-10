import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/materias — catálogo dinámico (SPEC-002). El admin recibe todas
// (gestiona también las desactivadas); docentes y estudiantes solo las
// activas. `color` e `icono` pintan la identidad visual en el frontend.
router.get('/', async (req, res, next) => {
    try {
        // Las materias en la Papelera (SPEC-003) no se listan para nadie;
        // solo aparecen en el módulo Papelera del admin.
        const soloActivas = req.user?.rol !== 'admin';
        const [materias] = await pool.query(
            `SELECT id, nombre, color, icono, activa, orden, descripcion,
                    banner_data, competencias, nivel, protegida
             FROM materias
             WHERE eliminado_en IS NULL ${soloActivas ? 'AND activa = TRUE' : ''}
             ORDER BY orden, id`
        );
        res.json(materias);
    } catch (err) {
        next(err);
    }
});

export default router;
