import { Router } from 'express';
import pool from '../db.js';
import { soloDocente, puedeGestionarMateria } from '../middleware/auth.js';

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

// Validadores opcionales de configuracion_json por tipo de reto.
const VALIDADORES_CONFIG = {
    clasificador: validarConfigClasificador
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

    const condiciones = ["estado = 'publicado'"];
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
            await pool.query(
                `UPDATE retos
                 SET tipo = ?, descripcion = ?, configuracion_json = ?,
                     xp_recompensa = ?, estado = 'publicado'
                 WHERE id = ?`,
                [tipo, descripcion, configJson, xp, retoId]
            );
        } else {
            const [creado] = await pool.query(
                `INSERT INTO retos (materia_id, titulo, tipo, descripcion, configuracion_json, xp_recompensa, estado)
                 VALUES (?, ?, ?, ?, ?, ?, 'publicado')`,
                [materiaId, titulo, tipo, descripcion, configJson, xp]
            );
            retoId = creado.insertId;
        }

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
