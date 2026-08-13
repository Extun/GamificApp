// Material de estudio por materia — fuente única de verdad en MySQL.
// Cualquier cliente (web o móvil) ve exactamente lo mismo porque todos
// consultan estas rutas; ya no existe material solo-local.
import { Router } from 'express';
import pool from '../db.js';
import { soloDocente, puedeGestionarMateria } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { cursoDelEstudiante, sqlAlcanceCurso, puedeDirigirACurso } from '../lib/alcanceCurso.js';

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
        const condiciones = ['materia_id = ?'];
        const params = [materiaId];
        if (!esDocente) condiciones.push('is_private = FALSE');
        if (req.user?.rol === 'estudiante') {
            const [[materia]] = await pool.query(
                'SELECT activa FROM materias WHERE id = ? AND eliminado_en IS NULL',
                [materiaId]
            );
            if (!materia || !materia.activa) {
                return res.status(404).json({ error: 'Materia no encontrada' });
            }
            // SPEC-026 — Misma frontera de curso que las actividades: el niño de
            // 2do A no ve los PDF que el docente de 3ro A subió para su clase.
            // El material anterior a la migración 015 tiene docente_id NULL y
            // sigue siendo institucional: nadie pierde lo que hoy ve.
            const cursoId = await cursoDelEstudiante(req.user.estudiante_id);
            if (cursoId !== null) {
                condiciones.push(sqlAlcanceCurso('materiales'));
                params.push(cursoId, cursoId);
            }
        }
        const [filas] = await pool.query(
            `SELECT id, materia_id, nombre, kind, size_label, is_private,
                    page_count, thumbnail, data_url, creado_en
             FROM materiales
             WHERE ${condiciones.join(' AND ')}
             ORDER BY creado_en, id`,
            params
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

        // SPEC-026 — Autor y destino. `docente_id` es lo que permite acotar el
        // material al aula ("todos mis cursos"); `curso_id` es opcional y hoy
        // ningún cliente lo envía (no hay selector al subir), pero si llega se
        // valida igual que en las actividades: nadie publica en el aula de otro.
        const cursoId = Number.isInteger(req.body?.curso_id) && req.body.curso_id > 0
            ? req.body.curso_id
            : null;
        if (cursoId !== null && !await puedeDirigirACurso(req.user, cursoId)) {
            return res.status(403).json({ error: 'Ese curso no está asignado a tu cuenta' });
        }

        const [resultado] = await pool.query(
            `INSERT INTO materiales
                (materia_id, nombre, kind, size_label, is_private, page_count,
                 thumbnail, data_url, docente_id, curso_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                materiaId,
                nombre.slice(0, 255),
                (kind || 'file').slice(0, 20),
                size_label ?? null,
                Boolean(is_private),
                Number.isInteger(page_count) ? page_count : null,
                thumbnail ?? null,
                data_url ?? null,
                req.user.id,
                cursoId
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
