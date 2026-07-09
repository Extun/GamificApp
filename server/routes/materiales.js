// Material de estudio por materia — fuente única de verdad en MySQL.
// Cualquier cliente (web o móvil) ve exactamente lo mismo porque todos
// consultan estas rutas; ya no existe material solo-local.
import { Router } from 'express';
import pool from '../db.js';
import { soloDocente, puedeGestionarMateria } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

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
        // Los estudiantes no acceden al material de materias desactivadas,
        // ni siquiera con el ID directo (la UI oculta, el servidor protege).
        if (req.user?.rol === 'estudiante') {
            const [[materia]] = await pool.query(
                'SELECT activa FROM materias WHERE id = ? AND eliminado_en IS NULL',
                [materiaId]
            );
            if (!materia || !materia.activa) {
                return res.status(404).json({ error: 'Materia no encontrada' });
            }
        }
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
        const [[infoMateria]] = await pool.query('SELECT nombre FROM materias WHERE id = ?', [materiaId]);
        registrarAuditoria({
            usuario: req.user, accion: 'subio-material',
            descripcion: `Subió el material "${fila.nombre}"`,
            materia: infoMateria?.nombre || null,
            detalle: { archivo: fila.nombre, tipo: fila.kind, privado: Boolean(fila.is_private) }
        });
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
        const [[previo]] = await pool.query(
            'SELECT nombre FROM materiales WHERE id = ? AND materia_id = ?',
            [materialId, materiaId]
        );
        const [resultado] = await pool.query(
            'DELETE FROM materiales WHERE id = ? AND materia_id = ?',
            [materialId, materiaId]
        );
        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: 'Material no encontrado' });
        }
        const [[infoMateria]] = await pool.query('SELECT nombre FROM materias WHERE id = ?', [materiaId]);
        registrarAuditoria({
            usuario: req.user, accion: 'elimino-material',
            descripcion: `Eliminó el material "${previo?.nombre || materialId}"`,
            materia: infoMateria?.nombre || null,
            detalle: previo ? { archivo: previo.nombre } : null
        });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

export default router;
