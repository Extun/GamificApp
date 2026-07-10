// Panel del docente: sus materias, sus invitaciones y sus estudiantes.
// Todas las rutas exigen rol docente (o admin, que hereda el acceso).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { soloDocente } from '../middleware/auth.js';
import { generarCodigo } from './auth.js';
import { resetearPinADefault } from '../lib/estudiantes.js';
import { registrarAuditoria } from '../lib/auditoria.js';

const router = Router();
router.use(soloDocente);

const DIAS_VIGENCIA_INVITACION = 7;

// GET /api/docente/mis-materias — las materias que el admin le asignó.
// El admin ve todas (no tiene asignaciones propias).
router.get('/mis-materias', async (req, res, next) => {
    try {
        // Solo materias activas: si el admin desactiva una, desaparece del
        // panel del docente sin perder la asignación ni el contenido.
        const [materias] = req.user.rol === 'admin'
            ? await pool.query(`SELECT id, nombre, color, icono, descripcion, banner_data FROM materias
                 WHERE activa = TRUE AND eliminado_en IS NULL ORDER BY orden, id`)
            : await pool.query(
                `SELECT m.id, m.nombre, m.color, m.icono, m.descripcion, m.banner_data FROM materias m
                 JOIN docente_materia dm ON dm.materia_id = m.id
                 WHERE dm.docente_id = ? AND m.activa = TRUE AND m.eliminado_en IS NULL ORDER BY m.orden, m.id`,
                [req.user.id]
            );
        res.json(materias);
    } catch (err) {
        next(err);
    }
});

// POST /api/docente/invitaciones — genera N códigos de un solo uso para un
// curso ("2do A"). Los códigos expiran a los 7 días.
router.post('/invitaciones', async (req, res, next) => {
    try {
        const cantidad = Math.min(Math.max(Number(req.body?.cantidad) || 1, 1), 40);
        // SPEC-002: el curso se elige del catálogo (curso_id). Se acepta
        // también el texto libre `curso` por compatibilidad transitoria.
        let curso = String(req.body?.curso || '').trim();
        let cursoId = Number(req.body?.curso_id) || null;
        if (cursoId) {
            const [[filaCurso]] = await pool.query(
                'SELECT CONCAT(nombre, " ", paralelo) AS etiqueta FROM cursos WHERE id = ? AND activo = TRUE AND eliminado_en IS NULL',
                [cursoId]
            );
            if (!filaCurso) return res.status(400).json({ error: 'Curso no encontrado o inactivo' });
            curso = filaCurso.etiqueta;
        }
        if (!curso) return res.status(400).json({ error: 'Elige el curso de la lista' });

        const codigos = [];
        for (let i = 0; i < cantidad; i++) {
            // Reintenta si el código aleatorio colisiona (UNIQUE en BD).
            for (let intento = 0; intento < 5; intento++) {
                const codigo = generarCodigo(6);
                try {
                    await pool.query(
                        `INSERT INTO invitaciones_estudiante (codigo, docente_id, curso, curso_id, expira_en)
                         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
                        [codigo, req.user.id, curso, cursoId, DIAS_VIGENCIA_INVITACION]
                    );
                    codigos.push(codigo);
                    break;
                } catch (err) {
                    if (err.code !== 'ER_DUP_ENTRY') throw err;
                }
            }
        }
        registrarAuditoria({
            usuario: req.user, accion: 'genero-invitaciones',
            descripcion: `Generó ${codigos.length} ${codigos.length === 1 ? 'invitación' : 'invitaciones'} para ${curso}`,
            detalle: { curso, cantidad: codigos.length, codigos }
        });
        res.status(201).json({ curso, dias_vigencia: DIAS_VIGENCIA_INVITACION, codigos });
    } catch (err) {
        next(err);
    }
});

// GET /api/docente/invitaciones — sus códigos con estado real (marca como
// expirados los pendientes cuya fecha ya pasó).
router.get('/invitaciones', async (req, res, next) => {
    try {
        await pool.query(
            `UPDATE invitaciones_estudiante SET estado = 'expirado'
             WHERE estado = 'pendiente' AND expira_en < NOW() AND docente_id = ?`,
            [req.user.id]
        );
        const [filas] = await pool.query(
            `SELECT i.id, i.codigo, i.curso, i.estado, i.creado_en, i.expira_en,
                    u.nombre_completo AS usado_por
             FROM invitaciones_estudiante i
             LEFT JOIN usuarios u ON u.id = i.usuario_id
             WHERE i.docente_id = ?
             ORDER BY i.creado_en DESC, i.id DESC`,
            [req.user.id]
        );
        res.json(filas);
    } catch (err) {
        next(err);
    }
});

// GET /api/docente/mis-estudiantes — estudiantes registrados con SUS
// invitaciones (el admin ve todos desde su propio panel).
router.get('/mis-estudiantes', async (req, res, next) => {
    try {
        const [filas] = await pool.query(
            `SELECT u.id AS usuario_id, u.nombre_completo, u.bloqueado_hasta,
                    e.id AS estudiante_id, e.curso, e.xp_total, e.fecha_nacimiento
             FROM invitaciones_estudiante i
             JOIN usuarios u ON u.id = i.usuario_id
             JOIN estudiantes e ON e.id = u.estudiante_id
             WHERE i.docente_id = ? AND i.estado = 'usado' AND u.eliminado_en IS NULL
             ORDER BY e.curso, u.nombre_completo`,
            [req.user.id]
        );
        res.json(filas);
    } catch (err) {
        next(err);
    }
});

// POST /api/docente/estudiantes/:usuarioId/resetear-pin — cuando el niño
// olvidó todo: el PIN vuelve a su fecha de nacimiento y se muestra al
// docente para dictárselo. Solo sobre estudiantes que él registró.
router.post('/estudiantes/:usuarioId/resetear-pin', async (req, res, next) => {
    try {
        const usuarioId = Number(req.params.usuarioId);
        if (req.user.rol !== 'admin') {
            const [propio] = await pool.query(
                "SELECT 1 FROM invitaciones_estudiante WHERE docente_id = ? AND usuario_id = ?",
                [req.user.id, usuarioId]
            );
            if (!propio.length) {
                return res.status(403).json({ error: 'Ese estudiante no pertenece a tus grupos' });
            }
        }
        const pin = await resetearPinADefault(usuarioId);
        if (!pin) return res.status(404).json({ error: 'Estudiante no encontrado' });
        const [[alumno]] = await pool.query('SELECT nombre_completo FROM usuarios WHERE id = ?', [usuarioId]);
        registrarAuditoria({
            usuario: req.user, accion: 'reseteo-pin',
            descripcion: `Restableció el PIN de "${alumno?.nombre_completo || 'estudiante'}"`,
            detalle: alumno ? { estudiante: alumno.nombre_completo } : null
        });
        res.json({ ok: true, pin, mensaje: `PIN restablecido a su fecha de nacimiento: ${pin}` });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// SPEC-004 — Rediseño del Panel Docente
// ---------------------------------------------------------------------------

// ¿Este estudiante (usuarios.id) fue invitado por este docente? El admin ve a
// todos. Devuelve la fila { usuario_id, estudiante_id, ... } o null.
const estudianteDelDocente = async (user, usuarioId) => {
    const [filas] = await pool.query(
        `SELECT u.id AS usuario_id, u.nombre_completo, u.foto_data,
                e.id AS estudiante_id, e.curso, e.xp_total, e.creado_en
         FROM usuarios u
         JOIN estudiantes e ON e.id = u.estudiante_id
         WHERE u.id = ? AND u.rol = 'estudiante' AND u.eliminado_en IS NULL
           ${user.rol === 'admin' ? '' : `AND EXISTS (
               SELECT 1 FROM invitaciones_estudiante i
               WHERE i.usuario_id = u.id AND i.docente_id = ?)`}`,
        user.rol === 'admin' ? [usuarioId] : [usuarioId, user.id]
    );
    return filas[0] || null;
};

// Materias (ids) que este docente puede ver. El admin: todas las activas.
const idsMateriasDelDocente = async (user) => {
    const [filas] = user.rol === 'admin'
        ? await pool.query('SELECT id FROM materias WHERE eliminado_en IS NULL')
        : await pool.query('SELECT materia_id AS id FROM docente_materia WHERE docente_id = ?', [user.id]);
    return filas.map((f) => f.id);
};

// GET /api/docente/resumen — todos los números reales del Home en una sola
// llamada: conteos de contenido, aula, XP entregada, promedio, pulso semanal
// y el Centro de Actividad (cronología desde la auditoría: lo que hizo el
// docente y lo que hicieron SUS estudiantes).
router.get('/resumen', async (req, res, next) => {
    try {
        const materiaIds = await idsMateriasDelDocente(req.user);
        const sinMaterias = !materiaIds.length;

        // Contenido creado en sus materias, por tipo y estado.
        const [retos] = sinMaterias ? [[]] : await pool.query(
            `SELECT tipo, estado, COUNT(*) AS n FROM retos
             WHERE materia_id IN (?) GROUP BY tipo, estado`,
            [materiaIds]
        );
        const [[materiales]] = sinMaterias ? [[{ n: 0 }]] : await pool.query(
            'SELECT COUNT(*) AS n FROM materiales WHERE materia_id IN (?)',
            [materiaIds]
        );

        // Su aula: estudiantes que se registraron con SUS códigos (el admin
        // ve el total institucional).
        const filtroAula = req.user.rol === 'admin'
            ? { sql: '', params: [] }
            : {
                sql: `AND e.id IN (SELECT u.estudiante_id FROM invitaciones_estudiante i
                       JOIN usuarios u ON u.id = i.usuario_id
                       WHERE i.docente_id = ? AND i.estado = 'usado')`,
                params: [req.user.id]
            };
        const [[aula]] = await pool.query(
            `SELECT COUNT(DISTINCT e.id) AS estudiantes,
                    COALESCE(SUM(e.xp_total), 0) AS xp_entregada
             FROM estudiantes e
             WHERE NOT EXISTS (SELECT 1 FROM usuarios u
                               WHERE u.estudiante_id = e.id AND u.eliminado_en IS NOT NULL)
             ${filtroAula.sql}`,
            filtroAula.params
        );
        const [[rendimiento]] = await pool.query(
            `SELECT ROUND(AVG(p.porcentaje)) AS promedio,
                    SUM(p.actualizado_en >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND p.completado) AS completados_semana
             FROM progreso_estudiante p
             JOIN estudiantes e ON e.id = p.estudiante_id
             WHERE 1 = 1 ${filtroAula.sql}`,
            filtroAula.params
        );

        // Centro de Actividad: eventos reales de auditoría del docente y de
        // sus estudiantes (los del admin: todos los de docentes y estudiantes).
        const [actividad] = await pool.query(
            req.user.rol === 'admin'
                ? `SELECT id, rol, nombre, accion, descripcion, materia, creado_en
                   FROM auditoria WHERE rol IN ('docente', 'estudiante')
                   ORDER BY creado_en DESC, id DESC LIMIT 15`
                : `SELECT id, rol, nombre, accion, descripcion, materia, creado_en
                   FROM auditoria
                   WHERE usuario_id = ? OR usuario_id IN (
                       SELECT usuario_id FROM invitaciones_estudiante
                       WHERE docente_id = ? AND estado = 'usado')
                   ORDER BY creado_en DESC, id DESC LIMIT 15`,
            req.user.rol === 'admin' ? [] : [req.user.id, req.user.id]
        ).catch((err) => {
            // Tabla auditoria ausente (deploy a medias): Home sin cronología.
            if (err.code === 'ER_NO_SUCH_TABLE') return [[]];
            throw err;
        });

        const cuentaRetos = (tipo) => retos
            .filter((r) => r.tipo === tipo && r.estado !== 'archivado')
            .reduce((suma, r) => suma + r.n, 0);
        res.json({
            stats: {
                quizzes: cuentaRetos('quiz'),
                clasificadores: cuentaRetos('clasificador'),
                misiones: cuentaRetos('mision'),
                actividades: retos.filter((r) => r.estado !== 'archivado').reduce((s, r) => s + r.n, 0),
                archivadas: retos.filter((r) => r.estado === 'archivado').reduce((s, r) => s + r.n, 0),
                materiales: materiales.n,
                estudiantes: aula.estudiantes,
                xp_entregada: Number(aula.xp_entregada),
                promedio: rendimiento.promedio === null ? null : Number(rendimiento.promedio),
                completados_semana: Number(rendimiento.completados_semana || 0)
            },
            actividad
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/docente/estudiantes/:usuarioId/detalle — ficha rápida (SPEC-004):
// datos, XP, últimas actividades reales, progreso por materia, insignias con
// regla real derivable en servidor y las retroalimentaciones del docente.
router.get('/estudiantes/:usuarioId/detalle', async (req, res, next) => {
    try {
        const usuarioId = Number(req.params.usuarioId);
        const estudiante = await estudianteDelDocente(req.user, usuarioId);
        if (!estudiante) {
            return res.status(404).json({ error: 'Ese estudiante no pertenece a tus grupos' });
        }

        const [ultimas] = await pool.query(
            `SELECT r.titulo, r.tipo, m.nombre AS materia, p.porcentaje,
                    p.xp_obtenido, p.completado, p.actualizado_en
             FROM progreso_estudiante p
             JOIN retos r ON r.id = p.reto_id
             JOIN materias m ON m.id = r.materia_id
             WHERE p.estudiante_id = ?
             ORDER BY p.actualizado_en DESC LIMIT 10`,
            [estudiante.estudiante_id]
        );
        const [porMateria] = await pool.query(
            `SELECT m.nombre AS materia, m.color, m.icono,
                    COUNT(*) AS actividades, SUM(p.completado) AS completadas,
                    ROUND(AVG(p.porcentaje)) AS promedio
             FROM progreso_estudiante p
             JOIN retos r ON r.id = p.reto_id
             JOIN materias m ON m.id = r.materia_id
             WHERE p.estudiante_id = ?
             GROUP BY m.id ORDER BY m.orden, m.id`,
            [estudiante.estudiante_id]
        );
        const [[hitos]] = await pool.query(
            `SELECT SUM(completado) AS completados,
                    SUM(porcentaje = 100) AS perfectos
             FROM progreso_estudiante WHERE estudiante_id = ?`,
            [estudiante.estudiante_id]
        );
        // Solo las insignias con regla REAL verificable en la BD; el resto del
        // catálogo vive en el cliente y no se inventa aquí.
        const insignias = [];
        if (Number(hitos.completados)) insignias.push({ id: 'primer-quiz', titulo: 'Primer Quiz' });
        if (Number(hitos.perfectos)) insignias.push({ id: 'maestro-materia', titulo: 'Maestro de la Materia' });

        const [retroalimentaciones] = await pool.query(
            `SELECT r.id, r.mensaje, r.creado_en, u.username AS docente
             FROM retroalimentaciones r
             JOIN usuarios u ON u.id = r.docente_id
             WHERE r.estudiante_id = ?
             ORDER BY r.creado_en DESC, r.id DESC`,
            [estudiante.estudiante_id]
        ).catch((err) => {
            if (err.code === 'ER_NO_SUCH_TABLE') return [[]];
            throw err;
        });

        res.json({
            estudiante,
            ultimas_actividades: ultimas,
            progreso_por_materia: porMateria,
            insignias,
            retos_completados: Number(hitos.completados || 0),
            retroalimentaciones
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/docente/estudiantes/:usuarioId/retroalimentaciones — observación
// privada del docente sobre el estudiante (SPEC-004). No es un comentario
// público: solo la ven docentes/admin en la ficha.
router.post('/estudiantes/:usuarioId/retroalimentaciones', async (req, res, next) => {
    try {
        const usuarioId = Number(req.params.usuarioId);
        const mensaje = String(req.body?.mensaje || '').trim().slice(0, 400);
        if (!mensaje) return res.status(400).json({ error: 'Escribe la observación' });

        const estudiante = await estudianteDelDocente(req.user, usuarioId);
        if (!estudiante) {
            return res.status(404).json({ error: 'Ese estudiante no pertenece a tus grupos' });
        }
        const [creada] = await pool.query(
            'INSERT INTO retroalimentaciones (docente_id, estudiante_id, mensaje) VALUES (?, ?, ?)',
            [req.user.id, estudiante.estudiante_id, mensaje]
        );
        registrarAuditoria({
            usuario: req.user, accion: 'retroalimento-estudiante',
            descripcion: `Dejó una observación a "${estudiante.nombre_completo}"`,
            detalle: { estudiante: estudiante.nombre_completo }
        });
        res.status(201).json({ id: creada.insertId, mensaje });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/docente/estudiantes/:usuarioId/retroalimentaciones/:id —
// solo el autor (o el admin) puede retirar su observación.
router.delete('/estudiantes/:usuarioId/retroalimentaciones/:id', async (req, res, next) => {
    try {
        const usuarioId = Number(req.params.usuarioId);
        const retroId = Number(req.params.id);
        const estudiante = await estudianteDelDocente(req.user, usuarioId);
        if (!estudiante) {
            return res.status(404).json({ error: 'Ese estudiante no pertenece a tus grupos' });
        }
        const [resultado] = await pool.query(
            `DELETE FROM retroalimentaciones
             WHERE id = ? AND estudiante_id = ?
               ${req.user.rol === 'admin' ? '' : 'AND docente_id = ?'}`,
            req.user.rol === 'admin'
                ? [retroId, estudiante.estudiante_id]
                : [retroId, estudiante.estudiante_id, req.user.id]
        );
        if (!resultado.affectedRows) {
            return res.status(404).json({ error: 'Observación no encontrada (solo puedes borrar las tuyas)' });
        }
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// GET /api/docente/perfil — identidad del docente + su actividad reciente
// (las estadísticas del perfil se leen de /resumen, misma fuente que el Home).
router.get('/perfil', async (req, res, next) => {
    try {
        const [[perfil]] = await pool.query(
            'SELECT id, username, nombre_completo, foto_data, creado_en FROM usuarios WHERE id = ?',
            [req.user.id]
        );
        if (!perfil) return res.status(404).json({ error: 'Usuario no encontrado' });
        const [actividad] = await pool.query(
            `SELECT id, accion, descripcion, materia, creado_en
             FROM auditoria WHERE usuario_id = ?
             ORDER BY creado_en DESC, id DESC LIMIT 20`,
            [req.user.id]
        ).catch((err) => {
            if (err.code === 'ER_NO_SUCH_TABLE') return [[]];
            throw err;
        });
        res.json({ ...perfil, actividad });
    } catch (err) {
        next(err);
    }
});

// PUT /api/docente/perfil — solo nombre visible y foto (SPEC-004). El
// username y el rol no se tocan desde aquí.
router.put('/perfil', async (req, res, next) => {
    try {
        const cambios = [];
        const params = [];
        if (req.body?.nombre_completo !== undefined) {
            const nombre = String(req.body.nombre_completo).trim().replace(/\s+/g, ' ').slice(0, 120);
            if (!nombre) return res.status(400).json({ error: 'El nombre visible no puede quedar vacío' });
            cambios.push('nombre_completo = ?');
            params.push(nombre);
        }
        if (req.body?.foto_data !== undefined) {
            const foto = req.body.foto_data === null ? null : String(req.body.foto_data);
            if (foto && !foto.startsWith('data:image/')) {
                return res.status(400).json({ error: 'La foto debe ser una imagen' });
            }
            if (foto && foto.length > 2_000_000) {
                return res.status(400).json({ error: 'La foto es demasiado grande (máx. ~1.5 MB)' });
            }
            cambios.push('foto_data = ?');
            params.push(foto);
        }
        if (!cambios.length) {
            return res.status(400).json({ error: 'Nada que actualizar (nombre_completo o foto_data)' });
        }
        await pool.query(`UPDATE usuarios SET ${cambios.join(', ')} WHERE id = ?`, [...params, req.user.id]);
        registrarAuditoria({
            usuario: req.user, accion: 'actualizo-perfil',
            descripcion: 'Actualizó su perfil'
        });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// PUT /api/docente/perfil/password — exige la contraseña actual.
router.put('/perfil/password', async (req, res, next) => {
    try {
        const actual = String(req.body?.password_actual || '');
        const nueva = String(req.body?.password_nueva || '');
        if (nueva.length < 8) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
        }
        const [[usuario]] = await pool.query('SELECT password_hash FROM usuarios WHERE id = ?', [req.user.id]);
        if (!usuario?.password_hash || !await bcrypt.compare(actual, usuario.password_hash)) {
            return res.status(401).json({ error: 'La contraseña actual no es correcta' });
        }
        await pool.query('UPDATE usuarios SET password_hash = ? WHERE id = ?',
            [bcrypt.hashSync(nueva, 10), req.user.id]);
        registrarAuditoria({
            usuario: req.user, accion: 'cambio-password',
            descripcion: 'Cambió su contraseña'
        });
        res.json({ ok: true, mensaje: 'Contraseña actualizada. Úsala desde tu próximo ingreso.' });
    } catch (err) {
        next(err);
    }
});

export default router;
