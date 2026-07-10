import { Router } from 'express';
import pool from '../db.js';
import { soloDocente, puedeGestionarMateria } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

const router = Router();

const esIdValido = (n) => Number.isInteger(n) && n > 0;

// Un tipo de reto es un slug corto en minúsculas ('quiz', 'clasificador',
// 'lectura', 'memoria', ...). Registrar un juego nuevo NO exige tocar la API:
// cualquier slug válido se acepta y se guarda tal cual. Solo se añade una
// entrada en VALIDADORES_CONFIG si esa mecánica quiere validación específica
// de su configuración al publicarse.
const TIPO_SLUG = /^[a-z0-9][a-z0-9-]{1,29}$/;

// Valida la configuración del juego 'clasificador' que envía el editor
// no-code del docente. Devuelve un mensaje de error o null si es válida.
// Forma esperada: { categorias: [{ nombre, elementos: [string, ...] }, ...] }
const validarConfigClasificador = (config) => {
    if (!config || !Array.isArray(config.categorias)) {
        return 'La configuración debe incluir un arreglo "categorias"';
    }
    if (config.categorias.length < 2) {
        return 'El clasificador necesita al menos 2 categorías';
    }
    for (const cat of config.categorias) {
        if (typeof cat?.nombre !== 'string' || !cat.nombre.trim()) {
            return 'Cada categoría necesita un nombre';
        }
        if (!Array.isArray(cat.elementos) || cat.elementos.length < 1) {
            return `La categoría "${cat.nombre}" necesita al menos un elemento`;
        }
        if (cat.elementos.some((e) => typeof e !== 'string' || !e.trim())) {
            return `La categoría "${cat.nombre}" tiene elementos vacíos`;
        }
    }
    return null;
};

// Valida la configuración de una 'mision' narrativa (generada con IA en el
// panel del docente). Forma esperada: { titulo, introduccion, final,
// desafios: [{ narrativa, pregunta, alternativas: {A,B,C}, correcta, pista, exito }] }
const validarConfigMision = (config) => {
    if (!config?.introduccion || !config?.final) {
        return 'La misión necesita introducción y final narrativos';
    }
    if (!Array.isArray(config.desafios) || config.desafios.length < 3) {
        return 'La misión necesita al menos 3 desafíos';
    }
    for (const [i, d] of config.desafios.entries()) {
        const etiqueta = `El desafío ${i + 1}`;
        if (!d?.narrativa || !d?.pregunta) return `${etiqueta} necesita narrativa y pregunta`;
        if (!d?.alternativas?.A || !d?.alternativas?.B || !d?.alternativas?.C) {
            return `${etiqueta} necesita las alternativas A, B y C`;
        }
        if (!['A', 'B', 'C'].includes(String(d?.correcta || '').trim().toUpperCase())) {
            return `${etiqueta} necesita una respuesta correcta (A, B o C)`;
        }
    }
    return null;
};

// Validadores opcionales de configuracion_json por tipo de reto.
const VALIDADORES_CONFIG = {
    clasificador: validarConfigClasificador,
    mision: validarConfigMision
};

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
router.get('/gestion', soloDocente, async (req, res, next) => {
    try {
        const esAdmin = req.user.rol === 'admin';
        const filtroDocente = esAdmin
            ? ''
            : 'AND r.materia_id IN (SELECT materia_id FROM docente_materia WHERE docente_id = ?)';
        const [filas] = await pool.query(
            `SELECT r.id, r.materia_id, m.nombre AS materia, m.color, m.icono,
                    r.titulo, r.tipo, r.descripcion, r.xp_recompensa, r.estado,
                    r.creado_en,
                    (SELECT COUNT(*) FROM progreso_estudiante p WHERE p.reto_id = r.id) AS veces_jugado
             FROM retos r
             JOIN materias m ON m.id = r.materia_id
             WHERE m.eliminado_en IS NULL ${filtroDocente}
             ORDER BY r.creado_en DESC, r.id DESC`,
            esAdmin ? [] : [req.user.id]
        );
        res.json(filas);
    } catch (err) {
        next(err);
    }
});

// Busca el reto y verifica que el docente pueda gestionarlo (materia asignada).
// Devuelve la fila o responde el error y devuelve null.
const retoGestionable = async (req, res, retoId) => {
    if (!esIdValido(retoId)) {
        res.status(400).json({ error: 'El id del reto debe ser un entero positivo' });
        return null;
    }
    const [[reto]] = await pool.query(
        `SELECT r.*, m.nombre AS materia_nombre FROM retos r
         JOIN materias m ON m.id = r.materia_id WHERE r.id = ?`,
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
        if (!cambios.length) {
            return res.status(400).json({ error: 'Nada que actualizar (estado, descripcion o xp_recompensa)' });
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
            `INSERT INTO retos (materia_id, titulo, tipo, descripcion, configuracion_json, xp_recompensa, estado, docente_id)
             SELECT materia_id, ?, tipo, descripcion, configuracion_json, xp_recompensa, 'borrador', ?
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

        const [[existente]] = await pool.query(
            'SELECT id FROM retos WHERE materia_id = ? AND titulo = ?',
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
                     xp_recompensa = ?, estado = 'publicado',
                     docente_id = COALESCE(docente_id, ?)
                 WHERE id = ?`,
                [tipo, descripcion, configJson, xp, req.user.id, retoId]
            );
        } else {
            const [creado] = await pool.query(
                `INSERT INTO retos (materia_id, titulo, tipo, descripcion, configuracion_json, xp_recompensa, estado, docente_id)
                 VALUES (?, ?, ?, ?, ?, ?, 'publicado', ?)`,
                [materiaId, titulo, tipo, descripcion, configJson, xp, req.user.id]
            );
            retoId = creado.insertId;
        }

        // Auditoría (SPEC-003): quién creó/editó qué actividad y de qué materia.
        const [[infoMateria]] = await pool.query('SELECT nombre FROM materias WHERE id = ?', [materiaId]);
        const NOMBRE_TIPO = { quiz: 'el quiz', clasificador: 'el clasificador', mision: 'la misión' };
        const etiquetaTipo = NOMBRE_TIPO[tipo] || `la actividad (${tipo})`;
        registrarAuditoria({
            usuario: req.user,
            accion: existente ? `edito-${tipo}` : `creo-${tipo}`,
            descripcion: `${existente ? 'Editó y volvió a publicar' : 'Publicó'} ${etiquetaTipo} "${titulo}"`,
            materia: infoMateria?.nombre || null,
            detalle: { titulo, tipo, xp_recompensa: xp, materia: infoMateria?.nombre }
        });
        res.status(existente ? 200 : 201).json({
            id: retoId,
            materia_id: materiaId,
            titulo,
            tipo,
            descripcion,
            configuracion,
            xp_recompensa: xp,
            estado: 'publicado'
        });
    } catch (err) {
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'Materia no encontrada' });
        }
        next(err);
    }
});

export default router;
