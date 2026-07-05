// Panel del administrador: gestión de docentes y estudiantes.
// Todas las rutas exigen rol admin.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { soloAdmin } from '../middleware/auth.js';
import { resetearPinADefault } from '../lib/estudiantes.js';

const router = Router();
router.use(soloAdmin);

const USERNAME_VALIDO = /^[a-z0-9][a-z0-9._-]{2,49}$/;

// ---- DOCENTES ----

// GET /api/admin/docentes — cada docente con sus materias asignadas.
router.get('/docentes', async (_req, res, next) => {
    try {
        const [filas] = await pool.query(
            `SELECT u.id, u.username, u.creado_en,
                    COALESCE(JSON_ARRAYAGG(
                        CASE WHEN m.id IS NOT NULL
                             THEN JSON_OBJECT('id', m.id, 'nombre', m.nombre) END
                    ), JSON_ARRAY()) AS materias
             FROM usuarios u
             LEFT JOIN docente_materia dm ON dm.docente_id = u.id
             LEFT JOIN materias m ON m.id = dm.materia_id
             WHERE u.rol = 'docente'
             GROUP BY u.id
             ORDER BY u.username`
        );
        // JSON_ARRAYAGG deja [null] cuando no hay asignaciones: se limpia aquí.
        res.json(filas.map((f) => ({
            ...f,
            materias: (typeof f.materias === 'string' ? JSON.parse(f.materias) : f.materias)
                .filter(Boolean)
        })));
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/docentes — crea un docente y le asigna sus materias.
// Body: { username, password, materia_ids: [1, 3] }
router.post('/docentes', async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
        const username = String(req.body?.username || '').trim().toLowerCase();
        const password = String(req.body?.password || '');
        const materiaIds = Array.isArray(req.body?.materia_ids) ? req.body.materia_ids : [];

        if (!USERNAME_VALIDO.test(username)) {
            return res.status(400).json({ error: 'Usuario inválido (3-50 caracteres: letras, números, . _ -)' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
        }

        await conn.beginTransaction();
        const [creado] = await conn.query(
            "INSERT INTO usuarios (username, password_hash, rol) VALUES (?, ?, 'docente')",
            [username, bcrypt.hashSync(password, 10)]
        );
        for (const materiaId of materiaIds) {
            await conn.query(
                'INSERT IGNORE INTO docente_materia (docente_id, materia_id) VALUES (?, ?)',
                [creado.insertId, Number(materiaId)]
            );
        }
        await conn.commit();
        res.status(201).json({ id: creado.insertId, username, rol: 'docente', materia_ids: materiaIds });
    } catch (err) {
        await conn.rollback().catch(() => {});
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe un usuario con ese nombre' });
        }
        next(err);
    } finally {
        conn.release();
    }
});

// PUT /api/admin/docentes/:id — cambia contraseña y/o materias asignadas.
// Body: { password?, materia_ids? }
router.put('/docentes/:id', async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
        const docenteId = Number(req.params.id);
        const [[docente]] = await conn.query(
            "SELECT id FROM usuarios WHERE id = ? AND rol = 'docente'", [docenteId]
        );
        if (!docente) return res.status(404).json({ error: 'Docente no encontrado' });

        await conn.beginTransaction();
        if (req.body?.password) {
            if (String(req.body.password).length < 8) {
                await conn.rollback();
                return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
            }
            await conn.query(
                'UPDATE usuarios SET password_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?',
                [bcrypt.hashSync(String(req.body.password), 10), docenteId]
            );
        }
        if (Array.isArray(req.body?.materia_ids)) {
            await conn.query('DELETE FROM docente_materia WHERE docente_id = ?', [docenteId]);
            for (const materiaId of req.body.materia_ids) {
                await conn.query(
                    'INSERT IGNORE INTO docente_materia (docente_id, materia_id) VALUES (?, ?)',
                    [docenteId, Number(materiaId)]
                );
            }
        }
        await conn.commit();
        res.json({ ok: true });
    } catch (err) {
        await conn.rollback().catch(() => {});
        next(err);
    } finally {
        conn.release();
    }
});

// DELETE /api/admin/docentes/:id — sus asignaciones e invitaciones caen en
// cascada; el material y los retos que publicó permanecen.
router.delete('/docentes/:id', async (req, res, next) => {
    try {
        const [resultado] = await pool.query(
            "DELETE FROM usuarios WHERE id = ? AND rol = 'docente'",
            [Number(req.params.id)]
        );
        if (!resultado.affectedRows) return res.status(404).json({ error: 'Docente no encontrado' });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ---- ESTUDIANTES ----

// GET /api/admin/estudiantes — todos, con su curso, XP y estado de bloqueo.
router.get('/estudiantes', async (_req, res, next) => {
    try {
        const [filas] = await pool.query(
            `SELECT u.id AS usuario_id, u.nombre_completo, u.codigo_emergencia,
                    u.intentos_fallidos, u.bloqueado_hasta,
                    e.id AS estudiante_id, e.curso, e.xp_total, e.fecha_nacimiento, e.creado_en
             FROM usuarios u
             JOIN estudiantes e ON e.id = u.estudiante_id
             WHERE u.rol = 'estudiante'
             ORDER BY e.curso, u.nombre_completo`
        );
        res.json(filas);
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/estudiantes/:usuarioId/resetear-pin
router.post('/estudiantes/:usuarioId/resetear-pin', async (req, res, next) => {
    try {
        const pin = await resetearPinADefault(Number(req.params.usuarioId));
        if (!pin) return res.status(404).json({ error: 'Estudiante no encontrado' });
        res.json({ ok: true, pin, mensaje: `PIN restablecido a su fecha de nacimiento: ${pin}` });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/estudiantes/:usuarioId — elimina cuenta Y ficha con su
// progreso (acción irreversible, pensada para bajas o registros de prueba).
router.delete('/estudiantes/:usuarioId', async (req, res, next) => {
    try {
        const usuarioId = Number(req.params.usuarioId);
        const [[cuenta]] = await pool.query(
            "SELECT estudiante_id FROM usuarios WHERE id = ? AND rol = 'estudiante'", [usuarioId]
        );
        if (!cuenta) return res.status(404).json({ error: 'Estudiante no encontrado' });

        await pool.query('DELETE FROM usuarios WHERE id = ?', [usuarioId]);
        if (cuenta.estudiante_id) {
            await pool.query('DELETE FROM estudiantes WHERE id = ?', [cuenta.estudiante_id]);
        }
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/invitaciones — visión global de todos los códigos.
router.get('/invitaciones', async (_req, res, next) => {
    try {
        await pool.query(
            "UPDATE invitaciones_estudiante SET estado = 'expirado' WHERE estado = 'pendiente' AND expira_en < NOW()"
        );
        const [filas] = await pool.query(
            `SELECT i.id, i.codigo, i.curso, i.estado, i.creado_en, i.expira_en,
                    d.username AS docente, u.nombre_completo AS usado_por
             FROM invitaciones_estudiante i
             JOIN usuarios d ON d.id = i.docente_id
             LEFT JOIN usuarios u ON u.id = i.usuario_id
             ORDER BY i.creado_en DESC, i.id DESC`
        );
        res.json(filas);
    } catch (err) {
        next(err);
    }
});

export default router;
