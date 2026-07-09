// Panel del administrador: gestión de docentes y estudiantes.
// Todas las rutas exigen rol admin.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import {
    soloAdmin, conPermiso, esPrincipalEnBD,
    PERMISOS_VALIDOS, permisosEfectivos
} from '../middleware/auth.js';
import { resetearPinADefault } from '../lib/estudiantes.js';
import { registrarAuditoria } from '../lib/auditoria.js';

const router = Router();
router.use(soloAdmin);

// Atajo: registra en auditoría una acción de este admin (fire-and-forget).
const auditar = (req, accion, descripcion, detalle = null, materia = null) =>
    registrarAuditoria({ usuario: req.user, accion, descripcion, detalle, materia });

const USERNAME_VALIDO = /^[a-z0-9][a-z0-9._-]{2,49}$/;

// ---- DOCENTES ----

// GET /api/admin/docentes — cada docente con sus materias asignadas.
router.get('/docentes', conPermiso('docentes'), async (_req, res, next) => {
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
             WHERE u.rol = 'docente' AND u.eliminado_en IS NULL
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
router.post('/docentes', conPermiso('docentes'), async (req, res, next) => {
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
        auditar(req, 'creo-docente', `Creó la cuenta del docente "${username}"`, { docente: username, materia_ids: materiaIds });
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
router.put('/docentes/:id', conPermiso('docentes'), async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
        const docenteId = Number(req.params.id);
        const [[docente]] = await conn.query(
            "SELECT id, username FROM usuarios WHERE id = ? AND rol = 'docente' AND eliminado_en IS NULL", [docenteId]
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
        auditar(req, 'edito-docente', `Actualizó la cuenta del docente "${docente.username}"`, {
            docente: docente.username,
            cambio_password: Boolean(req.body?.password),
            materia_ids: Array.isArray(req.body?.materia_ids) ? req.body.materia_ids : undefined
        });
        res.json({ ok: true });
    } catch (err) {
        await conn.rollback().catch(() => {});
        next(err);
    } finally {
        conn.release();
    }
});

// DELETE /api/admin/docentes/:id — pasa a la Papelera (SPEC-003): la cuenta
// se marca como eliminada (no puede iniciar sesión ni aparece en listados),
// pero sus materias asignadas, invitaciones, retos y material permanecen
// intactos para poder restaurarla exactamente como estaba.
router.delete('/docentes/:id', conPermiso('docentes'), async (req, res, next) => {
    try {
        const [[docente]] = await pool.query(
            "SELECT username FROM usuarios WHERE id = ? AND rol = 'docente' AND eliminado_en IS NULL",
            [Number(req.params.id)]
        );
        if (!docente) return res.status(404).json({ error: 'Docente no encontrado' });
        await pool.query(
            'UPDATE usuarios SET eliminado_en = NOW(), eliminado_por = ? WHERE id = ?',
            [req.user.username, Number(req.params.id)]
        );
        auditar(req, 'elimino-docente', `Envió a la papelera al docente "${docente.username}"`, { docente: docente.username });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ---- ESTUDIANTES ----

// GET /api/admin/estudiantes — todos, con su curso, XP y estado de bloqueo.
router.get('/estudiantes', conPermiso('estudiantes'), async (_req, res, next) => {
    try {
        const [filas] = await pool.query(
            `SELECT u.id AS usuario_id, u.nombre_completo, u.codigo_emergencia,
                    u.intentos_fallidos, u.bloqueado_hasta,
                    e.id AS estudiante_id, e.curso, e.xp_total, e.fecha_nacimiento, e.creado_en
             FROM usuarios u
             JOIN estudiantes e ON e.id = u.estudiante_id
             WHERE u.rol = 'estudiante' AND u.eliminado_en IS NULL
             ORDER BY e.curso, u.nombre_completo`
        );
        res.json(filas);
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/estudiantes/:usuarioId/resetear-pin
router.post('/estudiantes/:usuarioId/resetear-pin', conPermiso('estudiantes'), async (req, res, next) => {
    try {
        const [[cuenta]] = await pool.query(
            "SELECT nombre_completo FROM usuarios WHERE id = ? AND rol = 'estudiante'",
            [Number(req.params.usuarioId)]
        );
        const pin = cuenta ? await resetearPinADefault(Number(req.params.usuarioId)) : null;
        if (!pin) return res.status(404).json({ error: 'Estudiante no encontrado' });
        auditar(req, 'reseteo-pin', `Restableció el PIN de "${cuenta.nombre_completo}"`, { estudiante: cuenta.nombre_completo });
        res.json({ ok: true, pin, mensaje: `PIN restablecido a su fecha de nacimiento: ${pin}` });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/estudiantes/:usuarioId — pasa a la Papelera (SPEC-003):
// la cuenta se marca como eliminada; la ficha con su XP y progreso queda
// intacta, así la restauración lo devuelve exactamente como estaba.
router.delete('/estudiantes/:usuarioId', conPermiso('estudiantes'), async (req, res, next) => {
    try {
        const usuarioId = Number(req.params.usuarioId);
        const [[cuenta]] = await pool.query(
            "SELECT nombre_completo FROM usuarios WHERE id = ? AND rol = 'estudiante' AND eliminado_en IS NULL",
            [usuarioId]
        );
        if (!cuenta) return res.status(404).json({ error: 'Estudiante no encontrado' });
        await pool.query(
            'UPDATE usuarios SET eliminado_en = NOW(), eliminado_por = ? WHERE id = ?',
            [req.user.username, usuarioId]
        );
        auditar(req, 'elimino-estudiante', `Envió a la papelera al estudiante "${cuenta.nombre_completo}"`, { estudiante: cuenta.nombre_completo });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/invitaciones — visión global de todos los códigos.
router.get('/invitaciones', conPermiso('invitaciones'), async (_req, res, next) => {
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
router.delete('/invitaciones/:id', conPermiso('invitaciones'), async (req, res, next) => {
    try {
        const [[inv]] = await pool.query(
            'SELECT codigo, curso, estado FROM invitaciones_estudiante WHERE id = ?',
            [Number(req.params.id)]
        );
        if (!inv) return res.status(404).json({ error: 'Invitación no encontrada' });
        if (inv.estado === 'usado') {
            return res.status(409).json({ error: 'No se puede eliminar una invitación ya utilizada' });
        }
        await pool.query('DELETE FROM invitaciones_estudiante WHERE id = ?', [Number(req.params.id)]);
        auditar(req, 'elimino-invitacion', `Eliminó la invitación "${inv.codigo}" (${inv.curso})`, { codigo: inv.codigo, curso: inv.curso, estado: inv.estado });
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
router.post('/materias', conPermiso('materias'), async (req, res, next) => {
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
        auditar(req, 'creo-materia', `Creó la materia "${datos.nombre}"`, { materia: datos.nombre }, datos.nombre);
        res.status(201).json({ id: siguiente, ...datos });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe una materia con ese nombre' });
        }
        next(err);
    }
});

// PUT /api/admin/materias/:id — edita nombre, color, icono y/o estado.
router.put('/materias/:id', conPermiso('materias'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const datos = validarMateria(req.body);
        if (datos.error) return res.status(400).json({ error: datos.error });
        const activa = req.body?.activa === undefined ? true : Boolean(req.body.activa);
        const [resultado] = await pool.query(
            'UPDATE materias SET nombre = ?, color = ?, icono = ?, activa = ? WHERE id = ? AND eliminado_en IS NULL',
            [datos.nombre, datos.color, datos.icono, activa, id]
        );
        if (!resultado.affectedRows) return res.status(404).json({ error: 'Materia no encontrada' });
        auditar(req, 'edito-materia', `Editó la materia "${datos.nombre}"`, { materia: datos.nombre, activa }, datos.nombre);
        res.json({ ok: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe una materia con ese nombre' });
        }
        next(err);
    }
});

// DELETE /api/admin/materias/:id — pasa a la Papelera (SPEC-003): la materia
// desaparece de docentes y estudiantes, pero sus retos, material y
// asignaciones quedan intactos para restaurarla tal cual. Las validaciones
// de integridad se aplican en la eliminación DEFINITIVA desde la Papelera.
router.delete('/materias/:id', conPermiso('materias'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const [[materia]] = await pool.query(
            'SELECT nombre FROM materias WHERE id = ? AND eliminado_en IS NULL', [id]
        );
        if (!materia) return res.status(404).json({ error: 'Materia no encontrada' });
        await pool.query(
            'UPDATE materias SET eliminado_en = NOW(), eliminado_por = ? WHERE id = ?',
            [req.user.username, id]
        );
        auditar(req, 'elimino-materia', `Envió a la papelera la materia "${materia.nombre}"`, { materia: materia.nombre }, materia.nombre);
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
    // La etiqueta "nombre paralelo" se copia a columnas VARCHAR(20)
    // (estudiantes.curso, invitaciones_estudiante.curso): no puede excederlas.
    if (nombre.length + 1 + paralelo.length > 20) {
        return { error: 'Nombre + paralelo no pueden superar 19 caracteres en total' };
    }
    const nivel = String(body?.nivel || '').trim().slice(0, 30) || null;
    return { nombre, paralelo, nivel };
};

// GET /api/admin/cursos — todos, con conteos reales de estudiantes y
// docentes (docentes = emisores distintos de invitaciones del curso).
router.get('/cursos', conPermiso('cursos'), async (_req, res, next) => {
    try {
        const [cursos] = await pool.query(
            `SELECT c.id, c.nombre, c.paralelo, c.nivel, c.activo, c.creado_en,
                    CONCAT(c.nombre, ' ', c.paralelo) AS etiqueta,
                    (SELECT COUNT(*) FROM estudiantes e WHERE e.curso_id = c.id) AS estudiantes,
                    (SELECT COUNT(DISTINCT i.docente_id) FROM invitaciones_estudiante i
                     WHERE i.curso_id = c.id) AS docentes
             FROM cursos c
             WHERE c.eliminado_en IS NULL
             ORDER BY c.nombre, c.paralelo`
        );
        res.json(cursos);
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/cursos
router.post('/cursos', conPermiso('cursos'), async (req, res, next) => {
    try {
        const datos = validarCurso(req.body);
        if (datos.error) return res.status(400).json({ error: datos.error });
        const [creado] = await pool.query(
            'INSERT INTO cursos (nombre, paralelo, nivel) VALUES (?, ?, ?)',
            [datos.nombre, datos.paralelo, datos.nivel]
        );
        auditar(req, 'creo-curso', `Creó el curso "${datos.nombre} ${datos.paralelo}"`, { curso: `${datos.nombre} ${datos.paralelo}`, nivel: datos.nivel });
        res.status(201).json({ id: creado.insertId, ...datos });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ese curso y paralelo ya existen' });
        }
        next(err);
    }
});

// PUT /api/admin/cursos/:id — edita datos y/o activa/desactiva.
router.put('/cursos/:id', conPermiso('cursos'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const datos = validarCurso(req.body);
        if (datos.error) return res.status(400).json({ error: datos.error });
        const activo = req.body?.activo === undefined ? true : Boolean(req.body.activo);
        // Transacción: el catálogo y los VARCHAR `curso` denormalizados
        // (SPEC-002 §1.2) se actualizan juntos o no se actualiza nada.
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const [resultado] = await conn.query(
                `UPDATE cursos SET nombre = ?, paralelo = ?, nivel = ?, activo = ?
                 WHERE id = ? AND eliminado_en IS NULL`,
                [datos.nombre, datos.paralelo, datos.nivel, activo, id]
            );
            if (!resultado.affectedRows) {
                await conn.rollback();
                return res.status(404).json({ error: 'Curso no encontrado' });
            }
            await conn.query(
                `UPDATE estudiantes SET curso = CONCAT(?, ' ', ?) WHERE curso_id = ?`,
                [datos.nombre, datos.paralelo, id]
            );
            await conn.query(
                `UPDATE invitaciones_estudiante SET curso = CONCAT(?, ' ', ?) WHERE curso_id = ?`,
                [datos.nombre, datos.paralelo, id]
            );
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
        auditar(req, 'edito-curso', `Editó el curso "${datos.nombre} ${datos.paralelo}"`, { curso: `${datos.nombre} ${datos.paralelo}`, activo });
        res.json({ ok: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ese curso y paralelo ya existen' });
        }
        next(err);
    }
});

// DELETE /api/admin/cursos/:id — pasa a la Papelera (SPEC-003). Los
// estudiantes conservan su curso_id (la fila sigue existiendo); las
// validaciones de integridad se aplican al eliminarlo DEFINITIVAMENTE.
router.delete('/cursos/:id', conPermiso('cursos'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const [[curso]] = await pool.query(
            "SELECT CONCAT(nombre, ' ', paralelo) AS etiqueta FROM cursos WHERE id = ? AND eliminado_en IS NULL",
            [id]
        );
        if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });
        await pool.query(
            'UPDATE cursos SET eliminado_en = NOW(), eliminado_por = ? WHERE id = ?',
            [req.user.username, id]
        );
        auditar(req, 'elimino-curso', `Envió a la papelera el curso "${curso.etiqueta}"`, { curso: curso.etiqueta });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ---- ADMINISTRADORES (SPEC-003: permiso 'administradores') ----
// Lo ESTRUCTURAL (dar/quitar es_principal, repartir permisos, tocar cuentas
// Principal) sigue exigiendo ser Administrador Principal: un admin con el
// permiso 'administradores' solo gestiona cuentas operativas.

// ¿Cuántos Administradores Principales activos quedarían sin contar a `id`?
// Sostiene el invariante: nunca puede quedar el sistema sin uno.
const otrosPrincipalesActivos = async (conn, id) => {
    const [[fila]] = await conn.query(
        `SELECT COUNT(*) AS n FROM usuarios
         WHERE rol = 'admin' AND es_principal = TRUE AND activo = TRUE
           AND eliminado_en IS NULL AND id <> ?`,
        [id]
    );
    return fila.n;
};

// Valida y limpia la lista de permisos que envía el cliente.
const limpiarPermisos = (valor) => {
    if (!Array.isArray(valor)) return null;
    return valor.filter((p) => PERMISOS_VALIDOS.includes(p));
};

// GET /api/admin/administradores — todos los admins con rol, estado y permisos.
router.get('/administradores', conPermiso('administradores'), async (_req, res, next) => {
    try {
        const [filas] = await pool.query(
            `SELECT id, username, es_principal, activo, permisos, creado_en
             FROM usuarios WHERE rol = 'admin' AND eliminado_en IS NULL
             ORDER BY es_principal DESC, username`
        );
        res.json(filas.map((f) => ({ ...f, permisos: permisosEfectivos(f) })));
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/administradores — crea un admin.
// Body: { username, password, es_principal?, permisos? }
// Crear Principales o asignar permisos requiere ser Principal.
router.post('/administradores', conPermiso('administradores'), async (req, res, next) => {
    try {
        const username = String(req.body?.username || '').trim().toLowerCase();
        const password = String(req.body?.password || '');
        if (!USERNAME_VALIDO.test(username)) {
            return res.status(400).json({ error: 'Usuario inválido (3-50 caracteres: letras, números, . _ -)' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
        }
        const permisos = limpiarPermisos(req.body?.permisos);
        if ((req.body?.es_principal || permisos) && !(await esPrincipalEnBD(req.user.id))) {
            return res.status(403).json({ error: 'Solo el Administrador Principal puede asignar roles o permisos.' });
        }
        const [creado] = await pool.query(
            "INSERT INTO usuarios (username, password_hash, rol, es_principal, permisos) VALUES (?, ?, 'admin', ?, ?)",
            [username, bcrypt.hashSync(password, 10), Boolean(req.body?.es_principal), permisos ? JSON.stringify(permisos) : null]
        );
        auditar(req, 'creo-administrador', `Creó la cuenta de administrador "${username}"`, {
            administrador: username,
            es_principal: Boolean(req.body?.es_principal),
            permisos: permisos ?? 'operativos por defecto'
        });
        res.status(201).json({ id: creado.insertId, username, rol: 'admin' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe un usuario con ese nombre' });
        }
        next(err);
    }
});

// PUT /api/admin/administradores/:id — contraseña, rol, estado y/o permisos.
// Body: { password?, es_principal?, activo?, permisos? }
// Reglas: no puede quedar el sistema sin un Principal activo; tocar cuentas
// Principal, el rol o los permisos exige ser Principal.
router.put('/administradores/:id', conPermiso('administradores'), async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
        const id = Number(req.params.id);
        await conn.beginTransaction();
        const [[objetivo]] = await conn.query(
            "SELECT id, username, es_principal, activo FROM usuarios WHERE id = ? AND rol = 'admin' AND eliminado_en IS NULL FOR UPDATE",
            [id]
        );
        if (!objetivo) {
            await conn.rollback();
            return res.status(404).json({ error: 'Administrador no encontrado' });
        }

        const permisos = limpiarPermisos(req.body?.permisos);
        const cambiaEstructura = req.body?.es_principal !== undefined || req.body?.permisos !== undefined;
        if ((objetivo.es_principal || cambiaEstructura) && !(await esPrincipalEnBD(req.user.id))) {
            await conn.rollback();
            return res.status(403).json({ error: 'Solo el Administrador Principal puede modificar roles, permisos o cuentas Principal.' });
        }

        const esPrincipal = req.body?.es_principal === undefined
            ? Boolean(objetivo.es_principal) : Boolean(req.body.es_principal);
        const activo = req.body?.activo === undefined
            ? Boolean(objetivo.activo) : Boolean(req.body.activo);

        // Si era Principal activo y deja de serlo (o se desactiva), debe
        // quedar al menos otro Principal activo.
        const eraPrincipalActivo = objetivo.es_principal && objetivo.activo;
        if (eraPrincipalActivo && (!esPrincipal || !activo)) {
            if (!(await otrosPrincipalesActivos(conn, id))) {
                await conn.rollback();
                return res.status(409).json({
                    error: 'Es el último Administrador Principal activo: promueve a otro antes de cambiarle el rol o desactivarlo.'
                });
            }
        }

        if (req.body?.password) {
            if (String(req.body.password).length < 8) {
                await conn.rollback();
                return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
            }
            await conn.query(
                'UPDATE usuarios SET password_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?',
                [bcrypt.hashSync(String(req.body.password), 10), id]
            );
        }
        if (req.body?.permisos !== undefined) {
            await conn.query('UPDATE usuarios SET permisos = ? WHERE id = ?',
                [permisos ? JSON.stringify(permisos) : null, id]);
        }
        await conn.query(
            'UPDATE usuarios SET es_principal = ?, activo = ? WHERE id = ?',
            [esPrincipal, activo, id]
        );
        await conn.commit();
        auditar(req, 'edito-administrador', `Actualizó la cuenta de administrador "${objetivo.username}"`, {
            administrador: objetivo.username,
            es_principal: esPrincipal,
            activo,
            cambio_password: Boolean(req.body?.password),
            permisos: req.body?.permisos !== undefined ? permisos : undefined
        });
        res.json({ ok: true });
    } catch (err) {
        await conn.rollback().catch(() => {});
        next(err);
    } finally {
        conn.release();
    }
});

// DELETE /api/admin/administradores/:id — pasa a la Papelera (SPEC-003).
// No puedes eliminarte a ti mismo ni al último Principal activo; eliminar
// una cuenta Principal exige ser Principal.
router.delete('/administradores/:id', conPermiso('administradores'), async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
        const id = Number(req.params.id);
        if (id === req.user.id) {
            return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
        }
        await conn.beginTransaction();
        const [[objetivo]] = await conn.query(
            "SELECT id, username, es_principal, activo FROM usuarios WHERE id = ? AND rol = 'admin' AND eliminado_en IS NULL FOR UPDATE",
            [id]
        );
        if (!objetivo) {
            await conn.rollback();
            return res.status(404).json({ error: 'Administrador no encontrado' });
        }
        if (objetivo.es_principal && !(await esPrincipalEnBD(req.user.id))) {
            await conn.rollback();
            return res.status(403).json({ error: 'Solo el Administrador Principal puede eliminar cuentas Principal.' });
        }
        if (objetivo.es_principal && objetivo.activo && !(await otrosPrincipalesActivos(conn, id))) {
            await conn.rollback();
            return res.status(409).json({
                error: 'Es el último Administrador Principal activo: promueve a otro antes de eliminarlo.'
            });
        }
        await conn.query(
            'UPDATE usuarios SET eliminado_en = NOW(), eliminado_por = ? WHERE id = ?',
            [req.user.username, id]
        );
        await conn.commit();
        auditar(req, 'elimino-administrador', `Envió a la papelera al administrador "${objetivo.username}"`, { administrador: objetivo.username });
        res.json({ ok: true });
    } catch (err) {
        await conn.rollback().catch(() => {});
        next(err);
    } finally {
        conn.release();
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
// Requiere el permiso 'institucion' (el Principal lo tiene siempre).
router.put('/institucion', conPermiso('institucion'), async (req, res, next) => {
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
        auditar(req, 'edito-institucion', `Actualizó la configuración institucional ("${nombre}")`, { nombre });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ---- AUDITORÍA (SPEC-003) ----

// GET /api/admin/auditoria?rol=&limite= — últimos eventos registrados.
router.get('/auditoria', conPermiso('auditoria'), async (req, res, next) => {
    try {
        const limite = Math.min(Math.max(Number(req.query.limite) || 500, 1), 1000);
        const rol = ['admin', 'docente', 'estudiante'].includes(req.query.rol) ? req.query.rol : null;
        const [filas] = await pool.query(
            `SELECT id, usuario_id, rol, nombre, accion, descripcion, materia, detalle_json, creado_en
             FROM auditoria ${rol ? 'WHERE rol = ?' : ''}
             ORDER BY creado_en DESC, id DESC LIMIT ?`,
            rol ? [rol, limite] : [limite]
        );
        res.json(filas);
    } catch (err) {
        // Pre-migración 004: sin tabla aún no hay historial (lista vacía).
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        next(err);
    }
});

// GET /api/admin/auditoria/reciente — últimos 5 eventos para el widget
// "Actividad reciente" del Inicio. Accesible a cualquier admin (es el
// resumen del panel, no el historial completo).
router.get('/auditoria/reciente', async (_req, res, next) => {
    try {
        const [filas] = await pool.query(
            `SELECT id, rol, nombre, accion, descripcion, materia, creado_en
             FROM auditoria ORDER BY creado_en DESC, id DESC LIMIT 5`
        );
        res.json(filas);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        next(err);
    }
});

// ---- PAPELERA (SPEC-003: soft-delete y restauración) ----
// Tipos soportados y cómo se materializa cada uno.
const TIPOS_PAPELERA = ['docente', 'estudiante', 'administrador', 'materia', 'curso'];

// GET /api/admin/papelera — todos los elementos eliminados, unificados.
router.get('/papelera', conPermiso('papelera'), async (_req, res, next) => {
    try {
        const [usuarios] = await pool.query(
            `SELECT id, COALESCE(nombre_completo, username) AS nombre,
                    CASE rol WHEN 'docente' THEN 'docente'
                             WHEN 'estudiante' THEN 'estudiante'
                             ELSE 'administrador' END AS tipo,
                    eliminado_en, eliminado_por
             FROM usuarios WHERE eliminado_en IS NOT NULL`
        );
        const [materias] = await pool.query(
            `SELECT id, nombre, 'materia' AS tipo, eliminado_en, eliminado_por
             FROM materias WHERE eliminado_en IS NOT NULL`
        );
        const [cursos] = await pool.query(
            `SELECT id, CONCAT(nombre, ' ', paralelo) AS nombre, 'curso' AS tipo,
                    eliminado_en, eliminado_por
             FROM cursos WHERE eliminado_en IS NOT NULL`
        );
        const todos = [...usuarios, ...materias, ...cursos]
            .sort((a, b) => new Date(b.eliminado_en) - new Date(a.eliminado_en));
        res.json(todos);
    } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR') return res.json([]); // pre-migración
        next(err);
    }
});

// POST /api/admin/papelera/:tipo/:id/restaurar — quita la marca de eliminado.
// La fila nunca se tocó, así que todo vuelve exactamente como estaba.
router.post('/papelera/:tipo/:id/restaurar', conPermiso('papelera'), async (req, res, next) => {
    try {
        const tipo = req.params.tipo;
        const id = Number(req.params.id);
        if (!TIPOS_PAPELERA.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });

        if (tipo === 'materia' || tipo === 'curso') {
            const tabla = tipo === 'materia' ? 'materias' : 'cursos';
            const [[fila]] = await pool.query(
                `SELECT ${tipo === 'curso' ? "CONCAT(nombre, ' ', paralelo)" : 'nombre'} AS nombre
                 FROM ${tabla} WHERE id = ? AND eliminado_en IS NOT NULL`, [id]
            );
            if (!fila) return res.status(404).json({ error: 'Elemento no encontrado en la papelera' });
            // Un homónimo creado después chocaría con el UNIQUE al volver a
            // usarse: se avisa de forma amigable en lugar de fallar en seco.
            const [duplicados] = tipo === 'materia'
                ? await pool.query('SELECT 1 FROM materias WHERE nombre = ? AND id <> ? AND eliminado_en IS NULL', [fila.nombre, id])
                : await pool.query(
                    `SELECT 1 FROM cursos c JOIN cursos original ON original.id = ?
                     WHERE c.nombre = original.nombre AND c.paralelo = original.paralelo
                       AND c.id <> original.id AND c.eliminado_en IS NULL`, [id]
                );
            if (duplicados.length) {
                return res.status(409).json({
                    error: `No se puede restaurar: ya existe ${tipo === 'materia' ? 'una materia' : 'un curso'} con el mismo nombre. Renómbralo o elimínalo primero.`
                });
            }
            await pool.query(`UPDATE ${tabla} SET eliminado_en = NULL, eliminado_por = NULL WHERE id = ?`, [id]);
            auditar(req, `restauro-${tipo}`, `Restauró ${tipo === 'materia' ? 'la materia' : 'el curso'} "${fila.nombre}" desde la papelera`, { [tipo]: fila.nombre });
            return res.json({ ok: true });
        }

        // Cuentas (docente/estudiante/administrador): el username sigue
        // reservado mientras la fila existe, así que siempre puede volver.
        const rolEsperado = tipo === 'administrador' ? 'admin' : tipo;
        const [[cuenta]] = await pool.query(
            'SELECT COALESCE(nombre_completo, username) AS nombre FROM usuarios WHERE id = ? AND rol = ? AND eliminado_en IS NOT NULL',
            [id, rolEsperado]
        );
        if (!cuenta) return res.status(404).json({ error: 'Elemento no encontrado en la papelera' });
        await pool.query('UPDATE usuarios SET eliminado_en = NULL, eliminado_por = NULL WHERE id = ?', [id]);
        auditar(req, `restauro-${tipo}`, `Restauró al ${tipo} "${cuenta.nombre}" desde la papelera`, { [tipo]: cuenta.nombre });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/papelera/:tipo/:id — eliminación DEFINITIVA. Aquí sí se
// aplican las validaciones de integridad (nunca se borra en silencio algo
// que dejaría datos huérfanos): mensajes 409 amigables.
router.delete('/papelera/:tipo/:id', conPermiso('papelera'), async (req, res, next) => {
    try {
        const tipo = req.params.tipo;
        const id = Number(req.params.id);
        if (!TIPOS_PAPELERA.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });

        if (tipo === 'materia') {
            const [[materia]] = await pool.query(
                'SELECT nombre FROM materias WHERE id = ? AND eliminado_en IS NOT NULL', [id]
            );
            if (!materia) return res.status(404).json({ error: 'Elemento no encontrado en la papelera' });
            const [[uso]] = await pool.query(
                `SELECT (SELECT COUNT(*) FROM retos WHERE materia_id = ?) AS retos,
                        (SELECT COUNT(*) FROM materiales WHERE materia_id = ?) AS materiales,
                        (SELECT COUNT(*) FROM docente_materia WHERE materia_id = ?) AS docentes`,
                [id, id, id]
            );
            if (uso.retos || uso.materiales || uso.docentes) {
                return res.status(409).json({
                    error: 'La materia tiene retos, material o docentes asignados: eliminarla borraría ese contenido. Restáurala y vacíala primero, o déjala en la papelera.'
                });
            }
            await pool.query('DELETE FROM materias WHERE id = ?', [id]);
            auditar(req, 'purgo-materia', `Eliminó definitivamente la materia "${materia.nombre}"`, { materia: materia.nombre });
            return res.json({ ok: true });
        }

        if (tipo === 'curso') {
            const [[curso]] = await pool.query(
                "SELECT CONCAT(nombre, ' ', paralelo) AS etiqueta FROM cursos WHERE id = ? AND eliminado_en IS NOT NULL", [id]
            );
            if (!curso) return res.status(404).json({ error: 'Elemento no encontrado en la papelera' });
            const [[uso]] = await pool.query(
                'SELECT (SELECT COUNT(*) FROM estudiantes WHERE curso_id = ?) AS estudiantes', [id]
            );
            if (uso.estudiantes) {
                return res.status(409).json({
                    error: 'El curso tiene estudiantes vinculados: elimínalo definitivamente solo cuando ya no queden estudiantes en él.'
                });
            }
            await pool.query('DELETE FROM cursos WHERE id = ?', [id]);
            auditar(req, 'purgo-curso', `Eliminó definitivamente el curso "${curso.etiqueta}"`, { curso: curso.etiqueta });
            return res.json({ ok: true });
        }

        const rolEsperado = tipo === 'administrador' ? 'admin' : tipo;
        const [[cuenta]] = await pool.query(
            'SELECT id, estudiante_id, COALESCE(nombre_completo, username) AS nombre FROM usuarios WHERE id = ? AND rol = ? AND eliminado_en IS NOT NULL',
            [id, rolEsperado]
        );
        if (!cuenta) return res.status(404).json({ error: 'Elemento no encontrado en la papelera' });
        // Estudiante: aquí sí desaparece la ficha con su progreso (cascada).
        await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
        if (tipo === 'estudiante' && cuenta.estudiante_id) {
            await pool.query('DELETE FROM estudiantes WHERE id = ?', [cuenta.estudiante_id]);
        }
        auditar(req, `purgo-${tipo}`, `Eliminó definitivamente al ${tipo} "${cuenta.nombre}"`, { [tipo]: cuenta.nombre });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

export default router;
