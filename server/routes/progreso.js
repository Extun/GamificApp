import { Router } from 'express';
import pool from '../db.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { actualizarRacha, evaluarMisiones } from '../lib/misiones.js';

const router = Router();

const esIdValido = (n) => Number.isInteger(n) && n > 0;

// GET /api/progreso/:estudiante_id — avance completo de un estudiante:
// datos básicos, XP total y su progreso en cada reto agrupado por materia.
router.get('/:estudiante_id', async (req, res, next) => {
    const estudianteId = Number(req.params.estudiante_id);
    if (!esIdValido(estudianteId)) {
        return res.status(400).json({ error: 'estudiante_id debe ser un entero positivo' });
    }
    // Un estudiante solo puede consultar SU propio progreso; docente y admin
    // pueden consultar el de cualquiera.
    if (req.user.rol === 'estudiante' && req.user.estudiante_id !== estudianteId) {
        return res.status(403).json({ error: 'Solo puedes consultar tu propio progreso' });
    }

    try {
        const [[estudiante]] = await pool.query(
            'SELECT id, nombres, apellidos, curso, xp_total FROM estudiantes WHERE id = ?',
            [estudianteId]
        );
        if (!estudiante) {
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }

        const [progreso] = await pool.query(
            `SELECT m.id            AS materia_id,
                    m.nombre        AS materia,
                    r.id            AS reto_id,
                    r.titulo        AS reto,
                    r.tipo,
                    r.xp_recompensa,
                    p.porcentaje,
                    p.xp_obtenido,
                    p.completado,
                    p.observacion,
                    p.revisado,
                    p.actualizado_en
             FROM progreso_estudiante p
             -- Retos o materias en la Papelera: su historial se oculta (vuelve
             -- al restaurarlos); el XP acumulado no se toca.
             JOIN retos    r ON r.id = p.reto_id AND r.eliminado_en IS NULL
             JOIN materias m ON m.id = r.materia_id AND m.eliminado_en IS NULL
             WHERE p.estudiante_id = ?
             ORDER BY m.orden, m.id, r.id`,
            [estudianteId]
        );

        res.json({ estudiante, progreso });
    } catch (err) {
        next(err);
    }
});

// POST /api/progreso — registra el progreso de un reto completado.
// Body: { estudiante_id, puntos_obtenidos, reto_id }
//   o bien, si el reto aún no existe en la BD (los quizzes nacen en el
//   panel del docente): { estudiante_id, puntos_obtenidos, materia_id,
//   reto_titulo, xp_recompensa? } — el reto se busca por (materia, título)
//   y se crea dentro de la misma transacción si no existe.
//
// Corre dentro de una transacción con bloqueo de fila (FOR UPDATE):
// el upsert del progreso y la actualización de xp_total se confirman
// juntos o se revierten juntos, y reenvíos del mismo reto solo suman
// la diferencia de puntos (nunca duplican XP).
router.post('/', async (req, res, next) => {
    const estudianteId = Number(req.body?.estudiante_id);
    const retoIdBody = Number(req.body?.reto_id);
    const materiaId = Number(req.body?.materia_id);
    const retoTitulo = typeof req.body?.reto_titulo === 'string' ? req.body.reto_titulo.trim() : '';
    const puntos = Number(req.body?.puntos_obtenidos);

    const identificaReto = esIdValido(retoIdBody) || (esIdValido(materiaId) && retoTitulo);
    if (!esIdValido(estudianteId) || !identificaReto || !Number.isInteger(puntos) || puntos < 0) {
        return res.status(400).json({
            error: 'Se requieren estudiante_id y puntos_obtenidos válidos, y reto_id o materia_id + reto_titulo'
        });
    }
    // Un estudiante solo puede registrar progreso EN SU PROPIA cuenta: sin
    // esto, cualquier alumno autenticado podría inflar (o alterar) el XP de
    // otro con un simple POST.
    if (req.user.rol === 'estudiante' && req.user.estudiante_id !== estudianteId) {
        return res.status(403).json({ error: 'Solo puedes registrar tu propio progreso' });
    }
    // Un docente solo puede registrar progreso de estudiantes que él invitó
    // (misma regla que resetear PIN); el admin no tiene restricción.
    if (req.user.rol === 'docente') {
        const [propio] = await pool.query(
            `SELECT 1 FROM invitaciones_estudiante i
             JOIN usuarios u ON u.id = i.usuario_id
             WHERE i.docente_id = ? AND u.estudiante_id = ?`,
            [req.user.id, estudianteId]
        );
        if (!propio.length) {
            return res.status(403).json({ error: 'Ese estudiante no pertenece a tus grupos' });
        }
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Resuelve el reto: por id directo, o por (materia, título) creándolo
        // si es la primera vez que un estudiante completa ese quiz.
        let reto;
        if (esIdValido(retoIdBody)) {
            [[reto]] = await conn.query(
                'SELECT id, xp_recompensa FROM retos WHERE id = ? AND eliminado_en IS NULL',
                [retoIdBody]
            );
        } else {
            [[reto]] = await conn.query(
                'SELECT id, xp_recompensa FROM retos WHERE materia_id = ? AND titulo = ? AND eliminado_en IS NULL',
                [materiaId, retoTitulo]
            );
            if (!reto) {
                // No se crea progreso sobre una materia en la Papelera.
                const [[materiaViva]] = await conn.query(
                    'SELECT 1 AS si FROM materias WHERE id = ? AND eliminado_en IS NULL',
                    [materiaId]
                );
                if (!materiaViva) {
                    await conn.rollback();
                    return res.status(404).json({ error: 'Materia no encontrada' });
                }
                const xpRecompensa = esIdValido(Number(req.body?.xp_recompensa))
                    ? Number(req.body.xp_recompensa)
                    : 100;
                const [creado] = await conn.query(
                    `INSERT INTO retos (materia_id, titulo, xp_recompensa, estado)
                     VALUES (?, ?, ?, 'publicado')`,
                    [materiaId, retoTitulo, xpRecompensa]
                );
                reto = { id: creado.insertId, xp_recompensa: xpRecompensa };
            }
        }
        if (!reto) {
            await conn.rollback();
            return res.status(404).json({ error: 'Reto no encontrado' });
        }
        const retoId = reto.id;

        // Bloquea la fila del estudiante: dos envíos simultáneos se serializan.
        const [[estudiante]] = await conn.query(
            'SELECT id, xp_total FROM estudiantes WHERE id = ? FOR UPDATE',
            [estudianteId]
        );
        if (!estudiante) {
            await conn.rollback();
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }

        // No se otorga más XP que la recompensa definida para el reto.
        const xpNuevo = Math.min(puntos, reto.xp_recompensa);

        const [[previo]] = await conn.query(
            `SELECT xp_obtenido FROM progreso_estudiante
             WHERE estudiante_id = ? AND reto_id = ? FOR UPDATE`,
            [estudianteId, retoId]
        );

        // Solo se abona la mejora respecto a intentos anteriores del mismo reto.
        const delta = Math.max(0, xpNuevo - (previo?.xp_obtenido ?? 0));
        const porcentaje = reto.xp_recompensa > 0
            ? Math.min(100, Math.round((xpNuevo / reto.xp_recompensa) * 100))
            : 100;

        await conn.query(
            `INSERT INTO progreso_estudiante
                (estudiante_id, reto_id, porcentaje, xp_obtenido, completado)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                porcentaje  = GREATEST(porcentaje, VALUES(porcentaje)),
                xp_obtenido = GREATEST(xp_obtenido, VALUES(xp_obtenido)),
                completado  = completado OR VALUES(completado)`,
            [estudianteId, retoId, porcentaje, xpNuevo, porcentaje === 100]
        );

        if (delta > 0) {
            await conn.query(
                'UPDATE estudiantes SET xp_total = xp_total + ? WHERE id = ?',
                [delta, estudianteId]
            );
        }

        // Sistema de Misiones (SPEC-007): dentro de la MISMA transacción, con la
        // fila del estudiante ya bloqueada. Primero la racha (constancia), luego
        // la evaluación de misiones (que puede otorgar XP de recompensa). Se
        // reconsulta el XP final para reportarlo con precisión.
        await actualizarRacha(conn, estudianteId);
        const nuevasMisiones = await evaluarMisiones(conn, estudianteId);
        const [[fin]] = await conn.query('SELECT xp_total FROM estudiantes WHERE id = ?', [estudianteId]);
        const xpTotalFinal = Number(fin?.xp_total ?? (estudiante.xp_total + delta));

        await conn.commit();
        // Auditoría (SPEC-003): solo cuando quien resuelve es el propio
        // estudiante (los registros de docente/admin son correcciones).
        if (req.user.rol === 'estudiante') {
            const [[info]] = await pool.query(
                `SELECT r.titulo, r.tipo, m.nombre AS materia
                 FROM retos r JOIN materias m ON m.id = r.materia_id WHERE r.id = ?`,
                [retoId]
            );
            const VERBO = { quiz: 'Resolvió el quiz', clasificador: 'Jugó el clasificador', mision: 'Completó la misión' };
            const [[quien]] = await pool.query('SELECT nombre_completo FROM usuarios WHERE id = ?', [req.user.id]);
            registrarAuditoria({
                usuario: req.user,
                nombre: quien?.nombre_completo,
                accion: porcentaje === 100 ? 'completo-reto' : 'avanzo-reto',
                descripcion: `${VERBO[info?.tipo] || 'Completó la actividad'} "${info?.titulo || retoId}"${delta > 0 ? ` y ganó ${delta} XP` : ''}`,
                materia: info?.materia || null,
                detalle: { reto: info?.titulo, tipo: info?.tipo, porcentaje, xp_ganado: delta, xp_total: estudiante.xp_total + delta }
            });
        }
        res.status(201).json({
            estudiante_id: estudianteId,
            reto_id: retoId,
            xp_abonado: delta,
            xp_total: xpTotalFinal,
            porcentaje,
            completado: porcentaje === 100,
            // Misiones recién completadas por esta acción (para el LogroToast).
            nuevas_misiones: nuevasMisiones
        });
    } catch (err) {
        // rollback() puede fallar si la conexión murió; el error original manda.
        await conn.rollback().catch(() => {});
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'Materia no encontrada' });
        }
        next(err);
    } finally {
        conn.release();
    }
});

// PATCH /api/progreso/:estudiante_id/:reto_id — Libro de Calificaciones
// (SPEC-006 Fase 7): el docente edita la observación del intento y lo marca
// como revisado. NO toca porcentaje/XP (para eso está POST /api/progreso, que
// mantiene la transacción idempotente). Solo docente/admin, y el docente solo
// sobre estudiantes que él invitó (misma regla que resetear PIN).
router.patch('/:estudiante_id/:reto_id', async (req, res, next) => {
    const estudianteId = Number(req.params.estudiante_id);
    const retoId = Number(req.params.reto_id);
    if (!esIdValido(estudianteId) || !esIdValido(retoId)) {
        return res.status(400).json({ error: 'estudiante_id y reto_id deben ser enteros positivos' });
    }
    if (req.user.rol === 'estudiante') {
        return res.status(403).json({ error: 'Solo el docente puede editar el libro de calificaciones' });
    }
    if (req.user.rol === 'docente') {
        const [propio] = await pool.query(
            `SELECT 1 FROM invitaciones_estudiante i
             JOIN usuarios u ON u.id = i.usuario_id
             WHERE i.docente_id = ? AND u.estudiante_id = ?`,
            [req.user.id, estudianteId]
        );
        if (!propio.length) {
            return res.status(403).json({ error: 'Ese estudiante no pertenece a tus grupos' });
        }
    }

    const cambios = [];
    const params = [];
    if (req.body?.observacion !== undefined) {
        const obs = req.body.observacion === null ? null : String(req.body.observacion).trim().slice(0, 400);
        cambios.push('observacion = ?');
        params.push(obs || null);
    }
    if (req.body?.revisado !== undefined) {
        cambios.push('revisado = ?');
        params.push(Boolean(req.body.revisado));
    }
    if (!cambios.length) {
        return res.status(400).json({ error: 'Nada que actualizar (observacion o revisado)' });
    }

    try {
        // El UPDATE no debe mover `actualizado_en` (es la fecha del intento del
        // estudiante, no de la revisión del docente).
        const [resultado] = await pool.query(
            `UPDATE progreso_estudiante
             SET ${cambios.join(', ')}, actualizado_en = actualizado_en
             WHERE estudiante_id = ? AND reto_id = ?`,
            [...params, estudianteId, retoId]
        );
        if (!resultado.affectedRows) {
            return res.status(404).json({ error: 'No hay progreso registrado de ese estudiante en esa actividad' });
        }
        const [[info]] = await pool.query(
            `SELECT r.titulo, m.nombre AS materia,
                    CONCAT(e.nombres, ' ', e.apellidos) AS estudiante
             FROM retos r
             JOIN materias m ON m.id = r.materia_id
             JOIN estudiantes e ON e.id = ?
             WHERE r.id = ?`,
            [estudianteId, retoId]
        );
        registrarAuditoria({
            usuario: req.user,
            accion: 'ajusto-progreso',
            descripcion: `Actualizó el libro de calificaciones de ${info?.estudiante || estudianteId} en "${info?.titulo || retoId}"`,
            materia: info?.materia || null,
            detalle: {
                estudiante: info?.estudiante, reto: info?.titulo,
                ...(req.body?.observacion !== undefined ? { observacion: req.body.observacion } : {}),
                ...(req.body?.revisado !== undefined ? { revisado: Boolean(req.body.revisado) } : {})
            }
        });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

export default router;
