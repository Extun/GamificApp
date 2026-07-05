import { Router } from 'express';
import pool from '../db.js';

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
                    r.xp_recompensa,
                    p.porcentaje,
                    p.xp_obtenido,
                    p.completado,
                    p.actualizado_en
             FROM progreso_estudiante p
             JOIN retos    r ON r.id = p.reto_id
             JOIN materias m ON m.id = r.materia_id
             WHERE p.estudiante_id = ?
             ORDER BY m.id, r.id`,
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

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Resuelve el reto: por id directo, o por (materia, título) creándolo
        // si es la primera vez que un estudiante completa ese quiz.
        let reto;
        if (esIdValido(retoIdBody)) {
            [[reto]] = await conn.query(
                'SELECT id, xp_recompensa FROM retos WHERE id = ?',
                [retoIdBody]
            );
        } else {
            [[reto]] = await conn.query(
                'SELECT id, xp_recompensa FROM retos WHERE materia_id = ? AND titulo = ?',
                [materiaId, retoTitulo]
            );
            if (!reto) {
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

        await conn.commit();
        res.status(201).json({
            estudiante_id: estudianteId,
            reto_id: retoId,
            xp_abonado: delta,
            xp_total: estudiante.xp_total + delta,
            porcentaje,
            completado: porcentaje === 100
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

export default router;
