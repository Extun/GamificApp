import { Router } from 'express';
import pool from '../db.js';
import { soloDocente, puedeGestionarMateria } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { VALIDADORES_CONFIG } from '../lib/validadoresRetos.js';

const router = Router();

const esIdValido = (n) => Number.isInteger(n) && n > 0;

// Un tipo de reto es un slug corto en minúsculas ('quiz', 'clasificador',
// 'lectura', 'memoria', ...). Registrar un juego nuevo NO exige tocar la API:
// cualquier slug válido se acepta y se guarda tal cual. Solo se añade una
// entrada en VALIDADORES_CONFIG si esa mecánica quiere validación específica
// de su configuración al publicarse.
const TIPO_SLUG = /^[a-z0-9][a-z0-9-]{1,29}$/;

// Los validadores de configuracion_json por tipo viven en
// server/lib/validadoresRetos.js (SPEC-006): los comparten esta ruta y la IA.

// mysql2 ya parsea las columnas JSON, pero si el driver devolviera un string
// (según versión/config), lo normalizamos siempre a objeto.
const parsearConfig = (valor) => {
    if (typeof valor !== 'string') return valor;
    try {
        return JSON.parse(valor);
    } catch {
        return null;
    }
};

// GET /api/retos?materia_id=&tipo= — retos PUBLICADOS, con su configuración
// lista para que el reproductor del estudiante la consuma directamente.
router.get('/', async (req, res, next) => {
    const materiaId = Number(req.query.materia_id);
    const tipo = req.query.tipo;

    // Los retos de materias en la Papelera no se listan para nadie; los
    // estudiantes además no ven los de materias desactivadas, ni siquiera
    // pidiendo el materia_id directo (la UI oculta, el servidor protege).
    const condiciones = [
        "estado = 'publicado'",
        'eliminado_en IS NULL', // los retos en la Papelera no se listan para nadie
        `materia_id IN (SELECT id FROM materias WHERE eliminado_en IS NULL${req.user?.rol === 'estudiante' ? ' AND activa = TRUE' : ''})`
    ];
    const params = [];
    if (req.query.materia_id !== undefined) {
        if (!esIdValido(materiaId)) {
            return res.status(400).json({ error: 'materia_id debe ser un entero positivo' });
        }
        condiciones.push('materia_id = ?');
        params.push(materiaId);
    }
    if (tipo !== undefined) {
        if (typeof tipo !== 'string' || !TIPO_SLUG.test(tipo)) {
            return res.status(400).json({ error: 'tipo debe ser un slug en minúsculas (p. ej. "quiz", "clasificador")' });
        }
        condiciones.push('tipo = ?');
        params.push(tipo);
    }

    try {
        const [filas] = await pool.query(
            `SELECT id, materia_id, titulo, tipo, descripcion, configuracion_json,
                    xp_recompensa, estado, creado_en
             FROM retos
             WHERE ${condiciones.join(' AND ')}
             ORDER BY creado_en DESC, id DESC`,
            params
        );
        res.json(filas.map(({ configuracion_json, ...reto }) => ({
            ...reto,
            configuracion: parsearConfig(configuracion_json)
        })));
    } catch (err) {
        next(err);
    }
});

// GET /api/retos/gestion — Biblioteca del docente (SPEC-004): TODOS los retos
// de sus materias asignadas, en cualquier estado (borrador/publicado/
// archivado), con cuántos estudiantes los han jugado. Sin configuracion_json
// (pesado y no lo necesita el listado).
// `?papelera=1` devuelve en cambio los retos ELIMINADOS de sus materias
// (pestaña Papelera de la Biblioteca) para restaurar o purgar.
router.get('/gestion', soloDocente, async (req, res, next) => {
    try {
        const esAdmin = req.user.rol === 'admin';
        const enPapelera = req.query.papelera === '1';
        const filtroDocente = esAdmin
            ? ''
            : 'AND r.materia_id IN (SELECT materia_id FROM docente_materia WHERE docente_id = ?)';
        const [filas] = await pool.query(
            `SELECT r.id, r.materia_id, m.nombre AS materia, m.color, m.icono,
                    r.titulo, r.tipo, r.descripcion, r.xp_recompensa, r.estado,
                    r.origen, r.favorito, r.dificultad, r.curso_id,
                    CONCAT(c.nombre, ' ', c.paralelo) AS curso,
                    r.creado_en, r.eliminado_en,
                    (SELECT COUNT(*) FROM progreso_estudiante p WHERE p.reto_id = r.id) AS veces_jugado
             FROM retos r
             JOIN materias m ON m.id = r.materia_id
             LEFT JOIN cursos c ON c.id = r.curso_id AND c.eliminado_en IS NULL
             WHERE m.eliminado_en IS NULL
               AND r.eliminado_en IS ${enPapelera ? 'NOT NULL' : 'NULL'} ${filtroDocente}
             ORDER BY r.creado_en DESC, r.id DESC`,
            esAdmin ? [] : [req.user.id]
        );
        res.json(filas);
    } catch (err) {
        next(err);
    }
});

// GET /api/retos/:id/estadisticas — números REALES de una actividad, derivados
// de progreso_estudiante (SPEC-006 Fase 8). Sin datos por pregunta ni tiempos:
// la BD no los registra (prohibido inventarlos).
router.get('/:id/estadisticas', soloDocente, async (req, res, next) => {
    try {
        const reto = await retoGestionable(req, res, Number(req.params.id), { incluirEliminados: true });
        if (!reto) return;
        const [[stats]] = await pool.query(
            `SELECT COUNT(*)                            AS intentos,
                    COALESCE(SUM(completado), 0)        AS completados,
                    ROUND(AVG(porcentaje))              AS promedio,
                    MAX(porcentaje)                     AS mejor,
                    MIN(porcentaje)                     AS peor,
                    COALESCE(SUM(xp_obtenido), 0)       AS xp_entregada,
                    COALESCE(SUM(porcentaje = 100), 0)  AS perfectos,
                    MIN(actualizado_en)                 AS primer_intento,
                    MAX(actualizado_en)                 AS ultimo_intento
             FROM progreso_estudiante WHERE reto_id = ?`,
            [reto.id]
        );
        res.json({
            reto: {
                id: reto.id, titulo: reto.titulo, tipo: reto.tipo, estado: reto.estado,
                materia: reto.materia_nombre, xp_recompensa: reto.xp_recompensa,
                dificultad: reto.dificultad, origen: reto.origen
            },
            estadisticas: {
                intentos: Number(stats.intentos),
                completados: Number(stats.completados),
                perfectos: Number(stats.perfectos),
                promedio: stats.promedio === null ? null : Number(stats.promedio),
                mejor: stats.mejor === null ? null : Number(stats.mejor),
                peor: stats.peor === null ? null : Number(stats.peor),
                xp_entregada: Number(stats.xp_entregada),
                primer_intento: stats.primer_intento,
                ultimo_intento: stats.ultimo_intento
            }
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/retos/:id — detalle de UNA actividad para el docente (vista previa
// de la Biblioteca), con su configuración parseada. Incluye borradores,
// archivadas y las que están en la papelera (solo de sus materias).
router.get('/:id', soloDocente, async (req, res, next) => {
    try {
        const reto = await retoGestionable(req, res, Number(req.params.id), { incluirEliminados: true });
        if (!reto) return;
        const { configuracion_json, ...resto } = reto;
        res.json({ ...resto, configuracion: parsearConfig(configuracion_json) });
    } catch (err) {
        next(err);
    }
});

// Busca el reto y verifica que el docente pueda gestionarlo (materia asignada).
// Devuelve la fila o responde el error y devuelve null.
const retoGestionable = async (req, res, retoId, { incluirEliminados = false } = {}) => {
    if (!esIdValido(retoId)) {
        res.status(400).json({ error: 'El id del reto debe ser un entero positivo' });
        return null;
    }
    const [[reto]] = await pool.query(
        `SELECT r.*, m.nombre AS materia_nombre FROM retos r
         JOIN materias m ON m.id = r.materia_id
         WHERE r.id = ?${incluirEliminados ? '' : ' AND r.eliminado_en IS NULL'}`,
        [retoId]
    );
    if (!reto) {
        res.status(404).json({ error: 'Reto no encontrado' });
        return null;
    }
    if (!await puedeGestionarMateria(req.user, reto.materia_id)) {
        res.status(403).json({ error: 'No tienes asignada esta materia' });
        return null;
    }
    return reto;
};

const ESTADOS_RETO = ['borrador', 'publicado', 'archivado'];

// PATCH /api/retos/:id — gestión desde la Biblioteca (SPEC-004): cambiar el
// estado (archivar/restaurar/publicar un borrador) y ajustar descripción o XP.
// La configuración del juego NO se toca aquí (eso es de los editores), así que
// no se rompe la compatibilidad de configuracion_json ya publicado.
router.patch('/:id', soloDocente, async (req, res, next) => {
    try {
        const reto = await retoGestionable(req, res, Number(req.params.id));
        if (!reto) return;

        const cambios = [];
        const params = [];
        const estado = req.body?.estado;
        if (estado !== undefined) {
            if (!ESTADOS_RETO.includes(estado)) {
                return res.status(400).json({ error: `estado debe ser uno de: ${ESTADOS_RETO.join(', ')}` });
            }
            cambios.push('estado = ?');
            params.push(estado);
        }
        if (req.body?.descripcion !== undefined) {
            cambios.push('descripcion = ?');
            params.push(String(req.body.descripcion).trim() || null);
        }
        if (req.body?.xp_recompensa !== undefined) {
            const xp = Number(req.body.xp_recompensa);
            if (!esIdValido(xp) || xp > 100000) {
                return res.status(400).json({ error: 'xp_recompensa debe ser un entero positivo' });
            }
            cambios.push('xp_recompensa = ?');
            params.push(xp);
        }
        // Metadatos del centro docente (SPEC-006).
        if (req.body?.favorito !== undefined) {
            cambios.push('favorito = ?');
            params.push(Boolean(req.body.favorito));
        }
        if (req.body?.dificultad !== undefined) {
            const dif = req.body.dificultad;
            if (dif !== null && !['facil', 'media', 'dificil'].includes(dif)) {
                return res.status(400).json({ error: 'dificultad debe ser facil, media o dificil (o null)' });
            }
            cambios.push('dificultad = ?');
            params.push(dif);
        }
        if (req.body?.curso_id !== undefined) {
            const cursoId = req.body.curso_id === null ? null : Number(req.body.curso_id);
            if (cursoId !== null && !esIdValido(cursoId)) {
                return res.status(400).json({ error: 'curso_id debe ser un entero positivo o null' });
            }
            cambios.push('curso_id = ?');
            params.push(cursoId);
        }
        if (!cambios.length) {
            return res.status(400).json({ error: 'Nada que actualizar (estado, descripcion, xp_recompensa, favorito, dificultad o curso_id)' });
        }

        await pool.query(`UPDATE retos SET ${cambios.join(', ')} WHERE id = ?`, [...params, reto.id]);

        if (estado && estado !== reto.estado) {
            const VERBO = { archivado: 'Archivó', publicado: 'Publicó', borrador: 'Pasó a borrador' };
            registrarAuditoria({
                usuario: req.user,
                accion: `${estado === 'archivado' ? 'archivo' : 'cambio-estado'}-reto`,
                descripcion: `${VERBO[estado]} la actividad "${reto.titulo}"`,
                materia: reto.materia_nombre,
                detalle: { titulo: reto.titulo, tipo: reto.tipo, de: reto.estado, a: estado }
            });
        }
        res.json({ ok: true, id: reto.id });
    } catch (err) {
        next(err);
    }
});

// POST /api/retos/:id/duplicar — copia de trabajo en estado borrador
// ("Título (copia)"). El original y el progreso de los estudiantes no se tocan.
router.post('/:id/duplicar', soloDocente, async (req, res, next) => {
    try {
        const reto = await retoGestionable(req, res, Number(req.params.id));
        if (!reto) return;

        // Título único dentro de la materia: "(copia)", "(copia 2)", ...
        const base = reto.titulo.replace(/ \(copia( \d+)?\)$/, '');
        let titulo = null;
        for (let n = 1; n <= 50; n++) {
            const candidato = `${base} (copia${n > 1 ? ` ${n}` : ''})`.slice(0, 120);
            const [[ocupado]] = await pool.query(
                'SELECT 1 AS si FROM retos WHERE materia_id = ? AND titulo = ?',
                [reto.materia_id, candidato]
            );
            if (!ocupado) { titulo = candidato; break; }
        }
        if (!titulo) {
            return res.status(409).json({ error: 'Demasiadas copias de esta actividad; elimina o renombra alguna' });
        }

        const [creado] = await pool.query(
            `INSERT INTO retos (materia_id, titulo, tipo, descripcion, configuracion_json,
                                xp_recompensa, estado, docente_id, origen, dificultad, curso_id)
             SELECT materia_id, ?, tipo, descripcion, configuracion_json,
                    xp_recompensa, 'borrador', ?, origen, dificultad, curso_id
             FROM retos WHERE id = ?`,
            [titulo, req.user.id, reto.id]
        );
        registrarAuditoria({
            usuario: req.user, accion: 'duplico-reto',
            descripcion: `Duplicó la actividad "${reto.titulo}" como "${titulo}"`,
            materia: reto.materia_nombre,
            detalle: { original: reto.titulo, copia: titulo, tipo: reto.tipo }
        });
        res.status(201).json({ id: creado.insertId, titulo, estado: 'borrador' });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/retos/:id — Papelera (SPEC-006): marca, nunca borra físico.
// El progreso y el XP de los estudiantes no se tocan; el reto deja de
// listarse para todos hasta que se restaure.
router.delete('/:id', soloDocente, async (req, res, next) => {
    try {
        const reto = await retoGestionable(req, res, Number(req.params.id));
        if (!reto) return;
        await pool.query(
            'UPDATE retos SET eliminado_en = NOW(), eliminado_por = ? WHERE id = ?',
            [req.user.username || String(req.user.id), reto.id]
        );
        registrarAuditoria({
            usuario: req.user, accion: 'elimino-reto',
            descripcion: `Envió a la papelera la actividad "${reto.titulo}"`,
            materia: reto.materia_nombre,
            detalle: { titulo: reto.titulo, tipo: reto.tipo, estado: reto.estado }
        });
        res.json({ ok: true, id: reto.id });
    } catch (err) {
        next(err);
    }
});

// POST /api/retos/:id/restaurar — saca la actividad de la Papelera con su
// estado exacto (borrador/publicado/archivado, como estaba).
router.post('/:id/restaurar', soloDocente, async (req, res, next) => {
    try {
        const reto = await retoGestionable(req, res, Number(req.params.id), { incluirEliminados: true });
        if (!reto) return;
        if (!reto.eliminado_en) {
            return res.status(400).json({ error: 'Esta actividad no está en la papelera' });
        }
        await pool.query(
            'UPDATE retos SET eliminado_en = NULL, eliminado_por = NULL WHERE id = ?',
            [reto.id]
        );
        registrarAuditoria({
            usuario: req.user, accion: 'restauro-reto',
            descripcion: `Restauró de la papelera la actividad "${reto.titulo}"`,
            materia: reto.materia_nombre,
            detalle: { titulo: reto.titulo, tipo: reto.tipo, estado: reto.estado }
        });
        res.json({ ok: true, id: reto.id });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/retos/:id/definitivo — purga desde la Papelera. Solo si ningún
// estudiante registró progreso (misma filosofía de integridad que el resto de
// entidades); si hay historial, la actividad debe quedarse en la papelera.
router.delete('/:id/definitivo', soloDocente, async (req, res, next) => {
    try {
        const reto = await retoGestionable(req, res, Number(req.params.id), { incluirEliminados: true });
        if (!reto) return;
        if (!reto.eliminado_en) {
            return res.status(400).json({ error: 'Primero envía la actividad a la papelera' });
        }
        const [[jugado]] = await pool.query(
            'SELECT COUNT(*) AS n FROM progreso_estudiante WHERE reto_id = ?',
            [reto.id]
        );
        if (jugado.n > 0) {
            return res.status(409).json({
                error: 'No se puede eliminar definitivamente: hay estudiantes con progreso en esta actividad.'
            });
        }
        await pool.query('DELETE FROM retos WHERE id = ?', [reto.id]);
        registrarAuditoria({
            usuario: req.user, accion: 'purgo-reto',
            descripcion: `Eliminó definitivamente la actividad "${reto.titulo}"`,
            materia: reto.materia_nombre,
            detalle: { titulo: reto.titulo, tipo: reto.tipo }
        });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// POST /api/retos — publica (o republica) un reto configurable.
// Body: { materia_id, titulo, tipo, configuracion, xp_recompensa?, descripcion? }
//
// El editor del docente trabaja con objetos JS normales; ESTA capa es la que
// los convierte a `configuracion_json`. Es un upsert por (materia_id, titulo):
// volver a publicar el mismo reto actualiza su configuración sin duplicar la
// fila ni perder el progreso ya registrado por los estudiantes.
router.post('/', soloDocente, async (req, res, next) => {
    const materiaId = Number(req.body?.materia_id);
    const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
    const tipo = req.body?.tipo;
    const configuracion = req.body?.configuracion;
    const descripcion = typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : null;
    const xpRecompensa = Number(req.body?.xp_recompensa);
    // SPEC-006: se puede guardar como borrador y adjuntar metadatos del
    // centro docente. Por compatibilidad, sin `estado` se publica (como siempre).
    const estado = req.body?.estado === 'borrador' ? 'borrador' : 'publicado';
    const origen = req.body?.origen === 'ia' ? 'ia' : 'manual';
    const dificultad = ['facil', 'media', 'dificil'].includes(req.body?.dificultad) ? req.body.dificultad : null;
    const cursoId = esIdValido(Number(req.body?.curso_id)) ? Number(req.body.curso_id) : null;

    if (!esIdValido(materiaId) || !titulo || typeof tipo !== 'string' || !TIPO_SLUG.test(tipo)) {
        return res.status(400).json({ error: 'Se requieren materia_id, titulo y un tipo válido (slug en minúsculas)' });
    }
    const validarConfig = VALIDADORES_CONFIG[tipo];
    if (validarConfig) {
        const errorConfig = validarConfig(configuracion);
        if (errorConfig) return res.status(400).json({ error: errorConfig });
    }
    const xp = esIdValido(xpRecompensa) ? xpRecompensa : 100;

    try {
        // El docente solo publica retos en las materias que tiene asignadas.
        if (!await puedeGestionarMateria(req.user, materiaId)) {
            return res.status(403).json({ error: 'No tienes asignada esta materia' });
        }
        const configJson = configuracion ? JSON.stringify(configuracion) : null;

        // Solo se re-usa (upsert) una fila VIVA: las de la papelera no se
        // resucitan en silencio al publicar un homónimo.
        const [[existente]] = await pool.query(
            'SELECT id FROM retos WHERE materia_id = ? AND titulo = ? AND eliminado_en IS NULL',
            [materiaId, titulo]
        );

        let retoId;
        if (existente) {
            retoId = existente.id;
            // Republicar conserva la autoría original; si la fila es anterior
            // a la migración 005 (docente_id NULL), la adopta quien republica.
            await pool.query(
                `UPDATE retos
                 SET tipo = ?, descripcion = ?, configuracion_json = ?,
                     xp_recompensa = ?, estado = ?,
                     dificultad = COALESCE(?, dificultad),
                     curso_id = COALESCE(?, curso_id),
                     docente_id = COALESCE(docente_id, ?)
                 WHERE id = ?`,
                [tipo, descripcion, configJson, xp, estado, dificultad, cursoId, req.user.id, retoId]
            );
        } else {
            const [creado] = await pool.query(
                `INSERT INTO retos (materia_id, titulo, tipo, descripcion, configuracion_json,
                                    xp_recompensa, estado, docente_id, origen, dificultad, curso_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [materiaId, titulo, tipo, descripcion, configJson, xp, estado, req.user.id, origen, dificultad, cursoId]
            );
            retoId = creado.insertId;
        }

        // Auditoría (SPEC-003): quién creó/editó qué actividad y de qué materia.
        const [[infoMateria]] = await pool.query('SELECT nombre FROM materias WHERE id = ?', [materiaId]);
        const NOMBRE_TIPO = {
            quiz: 'el quiz', clasificador: 'el clasificador', mision: 'la misión',
            memorama: 'el memorama', 'linea-tiempo': 'la línea del tiempo', completar: 'la actividad de completar'
        };
        const etiquetaTipo = NOMBRE_TIPO[tipo] || `la actividad (${tipo})`;
        const verbo = estado === 'borrador'
            ? (existente ? 'Guardó como borrador' : 'Creó el borrador de')
            : (existente ? 'Editó y volvió a publicar' : 'Publicó');
        registrarAuditoria({
            usuario: req.user,
            accion: existente ? `edito-${tipo}` : `creo-${tipo}`,
            descripcion: `${verbo} ${etiquetaTipo} "${titulo}"`,
            materia: infoMateria?.nombre || null,
            detalle: { titulo, tipo, xp_recompensa: xp, estado, materia: infoMateria?.nombre }
        });
        res.status(existente ? 200 : 201).json({
            id: retoId,
            materia_id: materiaId,
            titulo,
            tipo,
            descripcion,
            configuracion,
            xp_recompensa: xp,
            estado,
            origen,
            dificultad,
            curso_id: cursoId
        });
    } catch (err) {
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'Materia no encontrada' });
        }
        next(err);
    }
});

export default router;
