// Panel del docente: sus materias, sus invitaciones y sus estudiantes.
// Todas las rutas exigen rol docente (o admin, que hereda el acceso).
import { Router } from 'express';
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
            ? await pool.query('SELECT id, nombre, color, icono FROM materias WHERE activa = TRUE AND eliminado_en IS NULL ORDER BY id')
            : await pool.query(
                `SELECT m.id, m.nombre, m.color, m.icono FROM materias m
                 JOIN docente_materia dm ON dm.materia_id = m.id
                 WHERE dm.docente_id = ? AND m.activa = TRUE AND m.eliminado_en IS NULL ORDER BY m.id`,
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

export default router;
