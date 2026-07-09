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
        // `usado_en`: el código se consume en el registro del estudiante,
        // por lo que su fecha de alta es la fecha real de uso (sin columna nueva).
        const [filas] = await pool.query(
            `SELECT i.id, i.codigo, i.curso, i.estado, i.creado_en, i.expira_en,
                    d.username AS docente, u.nombre_completo AS usado_por,
                    u.creado_en AS usado_en
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

// DELETE /api/admin/invitaciones/:id — solo códigos no utilizados
// (pendientes o expirados); el historial de usados es intocable.
router.delete('/invitaciones/:id', async (req, res, next) => {
    try {
        const [[inv]] = await pool.query(
            'SELECT estado FROM invitaciones_estudiante WHERE id = ?',
            [Number(req.params.id)]
        );
        if (!inv) return res.status(404).json({ error: 'Invitación no encontrada' });
        if (inv.estado === 'usado') {
            return res.status(409).json({ error: 'No se puede eliminar una invitación ya utilizada' });
        }
        await pool.query('DELETE FROM invitaciones_estudiante WHERE id = ?', [Number(req.params.id)]);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ---- MATERIAS (SPEC-002: catálogo dinámico) ----

const HEX_VALIDO = /^#[0-9a-fA-F]{6}$/;

const validarMateria = (body) => {
    const nombre = String(body?.nombre || '').trim();
    if (nombre.length < 2 || nombre.length > 60) return { error: 'El nombre debe tener entre 2 y 60 caracteres' };
    const color = String(body?.color || '#e0f2fe');
    if (!HEX_VALIDO.test(color)) return { error: 'Color inválido (formato #rrggbb)' };
    const icono = String(body?.icono || '📚').slice(0, 8);
    return { nombre, color, icono };
};

// POST /api/admin/materias — crea una materia nueva.
router.post('/materias', async (req, res, next) => {
    try {
        const datos = validarMateria(req.body);
        if (datos.error) return res.status(400).json({ error: datos.error });
        // IDs manuales (TINYINT sin AUTO_INCREMENT por herencia del esquema):
        // el siguiente libre se calcula aquí.
        const [[{ siguiente }]] = await pool.query(
            'SELECT COALESCE(MAX(id), 0) + 1 AS siguiente FROM materias'
        );
        await pool.query(
            'INSERT INTO materias (id, nombre, color, icono) VALUES (?, ?, ?, ?)',
            [siguiente, datos.nombre, datos.color, datos.icono]
        );
        res.status(201).json({ id: siguiente, ...datos });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe una materia con ese nombre' });
        }
        next(err);
    }
});

// PUT /api/admin/materias/:id — edita nombre, color, icono y/o estado.
router.put('/materias/:id', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const datos = validarMateria(req.body);
        if (datos.error) return res.status(400).json({ error: datos.error });
        const activa = req.body?.activa === undefined ? true : Boolean(req.body.activa);
        const [resultado] = await pool.query(
            'UPDATE materias SET nombre = ?, color = ?, icono = ?, activa = ? WHERE id = ?',
            [datos.nombre, datos.color, datos.icono, activa, id]
        );
        if (!resultado.affectedRows) return res.status(404).json({ error: 'Materia no encontrada' });
        res.json({ ok: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe una materia con ese nombre' });
        }
        next(err);
    }
});

// DELETE /api/admin/materias/:id — solo si la materia está vacía (sin retos,
// material ni docentes). Si tiene contenido, la opción correcta es desactivarla.
router.delete('/materias/:id', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const [[uso]] = await pool.query(
            `SELECT (SELECT COUNT(*) FROM retos WHERE materia_id = ?) AS retos,
                    (SELECT COUNT(*) FROM materiales WHERE materia_id = ?) AS materiales,
                    (SELECT COUNT(*) FROM docente_materia WHERE materia_id = ?) AS docentes`,
            [id, id, id]
        );
        if (uso.retos || uso.materiales || uso.docentes) {
            return res.status(409).json({
                error: 'La materia tiene contenido o docentes asignados. Desactívala en su lugar.'
            });
        }
        const [resultado] = await pool.query('DELETE FROM materias WHERE id = ?', [id]);
        if (!resultado.affectedRows) return res.status(404).json({ error: 'Materia no encontrada' });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ---- CURSOS (SPEC-002: solo el admin los crea) ----

const validarCurso = (body) => {
    const nombre = String(body?.nombre || '').trim();
    const paralelo = String(body?.paralelo || '').trim().toUpperCase();
    if (!nombre || nombre.length > 20) return { error: 'Nombre de curso inválido (ej: "2do")' };
    if (!paralelo || paralelo.length > 5) return { error: 'Paralelo inválido (ej: "A")' };
    const nivel = String(body?.nivel || '').trim().slice(0, 30) || null;
    return { nombre, paralelo, nivel };
};

// GET /api/admin/cursos — todos, con conteos reales de estudiantes y
// docentes (docentes = emisores distintos de invitaciones del curso).
router.get('/cursos', async (_req, res, next) => {
    try {
        const [cursos] = await pool.query(
            `SELECT c.id, c.nombre, c.paralelo, c.nivel, c.activo, c.creado_en,
                    CONCAT(c.nombre, ' ', c.paralelo) AS etiqueta,
                    (SELECT COUNT(*) FROM estudiantes e WHERE e.curso_id = c.id) AS estudiantes,
                    (SELECT COUNT(DISTINCT i.docente_id) FROM invitaciones_estudiante i
                     WHERE i.curso_id = c.id) AS docentes
             FROM cursos c
             ORDER BY c.nombre, c.paralelo`
        );
        res.json(cursos);
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/cursos
router.post('/cursos', async (req, res, next) => {
    try {
        const datos = validarCurso(req.body);
        if (datos.error) return res.status(400).json({ error: datos.error });
        const [creado] = await pool.query(
            'INSERT INTO cursos (nombre, paralelo, nivel) VALUES (?, ?, ?)',
            [datos.nombre, datos.paralelo, datos.nivel]
        );
        res.status(201).json({ id: creado.insertId, ...datos });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ese curso y paralelo ya existen' });
        }
        next(err);
    }
});

// PUT /api/admin/cursos/:id — edita datos y/o activa/desactiva.
router.put('/cursos/:id', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const datos = validarCurso(req.body);
        if (datos.error) return res.status(400).json({ error: datos.error });
        const activo = req.body?.activo === undefined ? true : Boolean(req.body.activo);
        const [resultado] = await pool.query(
            `UPDATE cursos SET nombre = ?, paralelo = ?, nivel = ?, activo = ?
             WHERE id = ?`,
            [datos.nombre, datos.paralelo, datos.nivel, activo, id]
        );
        if (!resultado.affectedRows) return res.status(404).json({ error: 'Curso no encontrado' });
        // El VARCHAR `curso` denormalizado acompaña al catálogo mientras dure
        // la transición (SPEC-002 §1.2): se sincroniza al editar el curso.
        await pool.query(
            `UPDATE estudiantes SET curso = CONCAT(?, ' ', ?) WHERE curso_id = ?`,
            [datos.nombre, datos.paralelo, id]
        );
        await pool.query(
            `UPDATE invitaciones_estudiante SET curso = CONCAT(?, ' ', ?) WHERE curso_id = ?`,
            [datos.nombre, datos.paralelo, id]
        );
        res.json({ ok: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ese curso y paralelo ya existen' });
        }
        next(err);
    }
});

// DELETE /api/admin/cursos/:id — solo cursos sin estudiantes.
router.delete('/cursos/:id', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const [[uso]] = await pool.query(
            'SELECT COUNT(*) AS estudiantes FROM estudiantes WHERE curso_id = ?', [id]
        );
        if (uso.estudiantes) {
            return res.status(409).json({
                error: 'El curso tiene estudiantes. Desactívalo en su lugar.'
            });
        }
        const [resultado] = await pool.query('DELETE FROM cursos WHERE id = ?', [id]);
        if (!resultado.affectedRows) return res.status(404).json({ error: 'Curso no encontrado' });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ---- INSTITUCIÓN (SPEC-002: fila única de configuración) ----

// Data URL de imagen: se revalida el MIME y el peso aunque el frontend ya
// haya redimensionado (la UI solo oculta, nunca protege).
const validarImagen = (dataUrl, maxKB) => {
    if (dataUrl === null || dataUrl === undefined || dataUrl === '') return null;
    const valor = String(dataUrl);
    if (!/^data:image\/(png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/.test(valor)) {
        return { error: 'Formato de imagen no permitido (png, jpg, webp o svg)' };
    }
    if (valor.length > maxKB * 1024 * 1.37) { // base64 pesa ~37% más
        return { error: `La imagen supera el máximo de ${maxKB} KB` };
    }
    return valor;
};

// PUT /api/admin/institucion — actualiza la configuración institucional.
router.put('/institucion', async (req, res, next) => {
    try {
        const nombre = String(req.body?.nombre || '').trim();
        if (nombre.length < 3 || nombre.length > 160) {
            return res.status(400).json({ error: 'El nombre debe tener entre 3 y 160 caracteres' });
        }
        for (const campo of ['color_principal', 'color_secundario']) {
            const v = req.body?.[campo];
            if (v && !HEX_VALIDO.test(String(v))) {
                return res.status(400).json({ error: `Color inválido en ${campo} (formato #rrggbb)` });
            }
        }
        const logo = validarImagen(req.body?.logo_data, 300);
        if (logo?.error) return res.status(400).json({ error: logo.error });
        const favicon = validarImagen(req.body?.favicon_data, 48);
        if (favicon?.error) return res.status(400).json({ error: favicon.error });

        const xpMax = Number(req.body?.xp_escala_max);
        await pool.query(
            `UPDATE institucion SET
                nombre = ?, ciudad = ?, provincia = ?, pais = ?,
                logo_data = ?, favicon_data = ?,
                color_principal = ?, color_secundario = ?,
                anio_lectivo = ?, xp_escala_max = ?
             WHERE id = 1`,
            [
                nombre,
                String(req.body?.ciudad || '').trim().slice(0, 80) || null,
                String(req.body?.provincia || '').trim().slice(0, 80) || null,
                String(req.body?.pais || '').trim().slice(0, 80) || null,
                logo,
                favicon,
                req.body?.color_principal || null,
                req.body?.color_secundario || null,
                String(req.body?.anio_lectivo || '').trim().slice(0, 20) || null,
                Number.isFinite(xpMax) && xpMax > 0 ? Math.floor(xpMax) : 1000
            ]
        );
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

export default router;
