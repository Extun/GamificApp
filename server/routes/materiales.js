// Material de estudio por materia — fuente única de verdad en MySQL.
// Cualquier cliente (web o móvil) ve exactamente lo mismo porque todos
// consultan estas rutas; ya no existe material solo-local.
import { Router } from 'express';
import pool from '../db.js';
import { soloDocente, puedeGestionarMateria } from '../middleware/auth.js';

// mergeParams: el router se monta en /api/materias/:id/material.
const router = Router({ mergeParams: true });

const materiaIdValida = (id) => Number.isInteger(id) && id > 0;

// GET /api/materias/:id/material — material unificado de la materia.
// El material privado del docente solo se incluye si quien pregunta es docente.
router.get('/', async (req, res, next) => {
    try {
        const materiaId = Number(req.params.id);
        if (!materiaIdValida(materiaId)) {
            return res.status(400).json({ error: 'Materia inválida' });
        }

        const esDocente = req.user?.rol === 'docente';
        const [filas] = await pool.query(
            `SELECT id, materia_id, nombre, kind, size_label, is_private,
                    page_count, thumbnail, data_url, creado_en
             FROM materiales
             WHERE materia_id = ? ${esDocente ? '' : 'AND is_private = FALSE'}
             ORDER BY creado_en, id`,
            [materiaId]
        );
        res.json(filas);
    } catch (err) {
        next(err);
    }
});

// POST /api/materias/:id/material — sube material (solo docente).
// Responde 201 Created con la fila persistida: el cliente debe refrescar
// la lista consultando el GET, no confiar en su estado local.
router.post('/', soloDocente, async (req, res, next) => {
    try {
        const materiaId = Number(req.params.id);
        if (!materiaIdValida(materiaId)) {
            return res.status(400).json({ error: 'Materia inválida' });
        }

        // El docente solo publica en las materias que el admin le asignó.
        if (!await puedeGestionarMateria(req.user, materiaId)) {
            return res.status(403).json({ error: 'No tienes asignada esta materia' });
        }

        const { nombre, kind, size_label, is_private, page_count, thumbnail, data_url } = req.body || {};
        if (!nombre || typeof nombre !== 'string') {
            return res.status(400).json({ error: 'El nombre del archivo es obligatorio' });
        }

        const [resultado] = await pool.query(
            `INSERT INTO materiales
                (materia_id, nombre, kind, size_label, is_private, page_count, thumbnail, data_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                materiaId,
                nombre.slice(0, 255),
                (kind || 'file').slice(0, 20),
                size_label ?? null,
                Boolean(is_private),
                Number.isInteger(page_count) ? page_count : null,
                thumbnail ?? null,
                data_url ?? null
            ]
        );

        const [[fila]] = await pool.query('SELECT * FROM materiales WHERE id = ?', [resultado.insertId]);
        res.status(201).json(fila);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/materias/:id/material/:materialId — elimina material (solo docente).
router.delete('/:materialId', soloDocente, async (req, res, next) => {
    try {
        const materiaId = Number(req.params.id);
        const materialId = Number(req.params.materialId);
        if (!await puedeGestionarMateria(req.user, materiaId)) {
            return res.status(403).json({ error: 'No tienes asignada esta materia' });
        }
        const [resultado] = await pool.query(
            'DELETE FROM materiales WHERE id = ? AND materia_id = ?',
            [materialId, materiaId]
        );
        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: 'Material no encontrado' });
        }
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

export default router;
