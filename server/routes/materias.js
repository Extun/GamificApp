import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/materias — catálogo dinámico (SPEC-002). El admin recibe todas
// (gestiona también las desactivadas); docentes y estudiantes solo las
// activas. `color` e `icono` pintan la identidad visual en el frontend.
router.get('/', async (req, res, next) => {
    try {
        const soloActivas = req.user?.rol !== 'admin';
        const [materias] = await pool.query(
            `SELECT id, nombre, color, icono, activa FROM materias
             ${soloActivas ? 'WHERE activa = TRUE' : ''}
             ORDER BY id`
        );
        res.json(materias);
    } catch (err) {
        next(err);
    }
});

export default router;
