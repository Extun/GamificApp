import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/materias — las 5 materias oficiales, en el mismo orden de IDs
// que usa el frontend (src/constants/materias.js).
router.get('/', async (_req, res, next) => {
    try {
        const [materias] = await pool.query(
            'SELECT id, nombre FROM materias ORDER BY id'
        );
        res.json(materias);
    } catch (err) {
        next(err);
    }
});

export default router;
