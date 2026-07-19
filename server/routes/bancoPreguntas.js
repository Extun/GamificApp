// Repositorio de Preguntas (SPEC-010, Fase 1) — banco reutilizable de
// preguntas por materia/tema/tipo. Módulo ADITIVO: las actividades siguen
// guardando su configuracion_json como siempre; aquí solo vive la biblioteca
// (crear, editar, listar, buscar, archivar, duplicar).
//
// Cada fila guarda UN ítem con la misma forma que ese juego usa dentro de su
// configuracion_json (quiz -> un elemento de preguntas[], completar -> de
// frases[], memorama -> de parejas[], linea-tiempo -> de eventos[]), para que
// en la Fase 2 insertar del banco a una actividad sea concatenar, sin
// transformar. Cero formatos nuevos.
import { Router } from 'express';
import pool from '../db.js';
import { soloDocente, puedeGestionarMateria } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { VALIDADORES_ITEM, RESUMEN_ITEM, TIPOS_BANCO } from '../lib/juegos/registro.js';

const router = Router();

const esIdValido = (n) => Number.isInteger(n) && n > 0;

const DIFICULTADES = ['facil', 'media', 'dificil'];
const ESTADOS = ['pendiente', 'aprobada', 'archivada'];

// ---- Validadores POR ÍTEM (SPEC-017: viven en el registro de juegos) --------
// `validarConfig` de cada tipo valida la configuración COMPLETA de una
// actividad (con mínimos de 2-3 ítems); el bloque `banco` de ese mismo tipo
// valida UN solo ítem, con la misma forma. Ambos viven juntos en
// lib/juegos/tipos/*.js, así que un juego nuevo trae su soporte de banco sin
// tocar este archivo.
export { TIPOS_BANCO } from '../lib/juegos/registro.js';

// Enunciado buscable/legible derivado del contenido, según el tipo.
const derivarEnunciado = (tipo, item) => {
    const texto = RESUMEN_ITEM[tipo]?.(item);
    return String(texto || '').trim().slice(0, 255) || null;
};

// mysql2 ya parsea JSON, pero se normaliza por si el driver devuelve string.
const parsearContenido = (valor) => {
    if (typeof valor !== 'string') return valor;
    try {
        return JSON.parse(valor);
    } catch {
        return null;
    }
};

const aRespuesta = ({ contenido_json, ...fila }) => ({
    ...fila,
    contenido: parsearContenido(contenido_json)
});

// Busca la pregunta y verifica que el usuario pueda gestionar su materia.
// Devuelve la fila o responde el error y devuelve null.
const preguntaGestionable = async (req, res, preguntaId) => {
    if (!esIdValido(preguntaId)) {
        res.status(400).json({ error: 'El id de la pregunta debe ser un entero positivo' });
        return null;
    }
    const [[pregunta]] = await pool.query(
        `SELECT b.*, m.nombre AS materia_nombre FROM banco_preguntas b
         JOIN materias m ON m.id = b.materia_id
         WHERE b.id = ?`,
        [preguntaId]
    );
    if (!pregunta) {
        res.status(404).json({ error: 'Pregunta no encontrada' });
        return null;
    }
    if (!await puedeGestionarMateria(req.user, pregunta.materia_id)) {
        res.status(403).json({ error: 'No tienes asignada esta materia' });
        return null;
    }
    return pregunta;
};

// Valida y normaliza el cuerpo de crear/editar. Devuelve { datos } o { error }.
const validarCuerpo = (body) => {
    const materiaId = Number(body?.materia_id);
    const tipo = body?.tipo;
    const contenido = body?.contenido;
    if (!esIdValido(materiaId)) return { error: 'materia_id debe ser un entero positivo' };
    if (!TIPOS_BANCO.includes(tipo)) {
        return { error: `tipo debe ser uno de: ${TIPOS_BANCO.join(', ')}` };
    }
    const errorItem = VALIDADORES_ITEM[tipo](contenido);
    if (errorItem) return { error: errorItem };

    const dificultad = DIFICULTADES.includes(body?.dificultad) ? body.dificultad : null;
    const tema = typeof body?.tema === 'string' ? body.tema.trim().slice(0, 120) || null : null;
    const explicacion = typeof body?.explicacion === 'string' ? body.explicacion.trim() || null : null;
    const etiquetas = typeof body?.etiquetas === 'string' ? body.etiquetas.trim().slice(0, 255) || null : null;
    return {
        datos: {
            materiaId, tipo, contenido, dificultad, tema, explicacion, etiquetas,
            enunciado: derivarEnunciado(tipo, contenido)
        }
    };
};

// GET /api/banco?materia_id=&tema=&tipo=&dificultad=&estado=&q= — listar y
// buscar. El docente ve las preguntas de sus materias asignadas; el admin,
// todas. Sin paginación de servidor: el volumen esperado (una escuela) se
// filtra bien en el cliente, igual que la Biblioteca de Actividades.
router.get('/', soloDocente, async (req, res, next) => {
    try {
        const esAdmin = req.user.rol === 'admin';
        const condiciones = ['m.eliminado_en IS NULL'];
        const params = [];
        if (!esAdmin) {
            condiciones.push('b.materia_id IN (SELECT materia_id FROM docente_materia WHERE docente_id = ?)');
            params.push(req.user.id);
        }
        if (req.query.materia_id !== undefined) {
            const materiaId = Number(req.query.materia_id);
            if (!esIdValido(materiaId)) {
                return res.status(400).json({ error: 'materia_id debe ser un entero positivo' });
            }
            condiciones.push('b.materia_id = ?');
            params.push(materiaId);
        }
        if (req.query.tipo) {
            condiciones.push('b.tipo = ?');
            params.push(String(req.query.tipo));
        }
        if (req.query.dificultad) {
            condiciones.push('b.dificultad = ?');
            params.push(String(req.query.dificultad));
        }
        if (req.query.estado) {
            if (!ESTADOS.includes(req.query.estado)) {
                return res.status(400).json({ error: `estado debe ser uno de: ${ESTADOS.join(', ')}` });
            }
            condiciones.push('b.estado = ?');
            params.push(req.query.estado);
        }
        if (req.query.tema) {
            condiciones.push('b.tema LIKE ?');
            params.push(`%${String(req.query.tema).trim()}%`);
        }
        if (req.query.q) {
            condiciones.push('(b.enunciado LIKE ? OR b.etiquetas LIKE ? OR b.tema LIKE ?)');
            const q = `%${String(req.query.q).trim()}%`;
            params.push(q, q, q);
        }
        const [filas] = await pool.query(
            `SELECT b.id, b.materia_id, m.nombre AS materia, m.color, m.icono,
                    b.tema, b.tipo, b.dificultad, b.enunciado, b.etiquetas,
                    b.origen, b.estado, b.veces_utilizada, b.ultima_utilizacion,
                    b.creado_en, b.actualizado_en
             FROM banco_preguntas b
             JOIN materias m ON m.id = b.materia_id
             WHERE ${condiciones.join(' AND ')}
             ORDER BY COALESCE(b.actualizado_en, b.creado_en) DESC, b.id DESC`,
            params
        );
        res.json(filas);
    } catch (err) {
        next(err);
    }
});

// GET /api/banco/:id — detalle con el contenido completo.
router.get('/:id', soloDocente, async (req, res, next) => {
    try {
        const pregunta = await preguntaGestionable(req, res, Number(req.params.id));
        if (!pregunta) return;
        res.json(aRespuesta(pregunta));
    } catch (err) {
        next(err);
    }
});

// POST /api/banco — crear pregunta manual (nace aprobada).
// Body: { materia_id, tipo, contenido, tema?, dificultad?, explicacion?, etiquetas? }
router.post('/', soloDocente, async (req, res, next) => {
    const { datos, error } = validarCuerpo(req.body);
    if (error) return res.status(400).json({ error });
    try {
        if (!await puedeGestionarMateria(req.user, datos.materiaId)) {
            return res.status(403).json({ error: 'No tienes asignada esta materia' });
        }
        const [creado] = await pool.query(
            `INSERT INTO banco_preguntas
                (materia_id, tema, tipo, dificultad, enunciado, contenido_json,
                 explicacion, etiquetas, origen, estado, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'aprobada', ?)`,
            [datos.materiaId, datos.tema, datos.tipo, datos.dificultad, datos.enunciado,
             JSON.stringify(datos.contenido), datos.explicacion, datos.etiquetas, req.user.id]
        );
        registrarAuditoria({
            usuario: req.user, accion: 'creo-pregunta-banco',
            descripcion: `Creó en el repositorio la pregunta "${datos.enunciado || datos.tipo}"`,
            detalle: { tipo: datos.tipo, tema: datos.tema, materia_id: datos.materiaId }
        });
        res.status(201).json({ id: creado.insertId, estado: 'aprobada', origen: 'manual' });
    } catch (err) {
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'Materia no encontrada' });
        }
        next(err);
    }
});

// PUT /api/banco/:id — editar. No toca contadores ni actividades ya creadas
// (guardan su propio snapshot).
router.put('/:id', soloDocente, async (req, res, next) => {
    try {
        const pregunta = await preguntaGestionable(req, res, Number(req.params.id));
        if (!pregunta) return;
        const { datos, error } = validarCuerpo({ ...req.body, materia_id: req.body?.materia_id ?? pregunta.materia_id, tipo: pregunta.tipo });
        if (error) return res.status(400).json({ error });
        if (datos.materiaId !== pregunta.materia_id &&
            !await puedeGestionarMateria(req.user, datos.materiaId)) {
            return res.status(403).json({ error: 'No tienes asignada la materia destino' });
        }
        await pool.query(
            `UPDATE banco_preguntas
             SET materia_id = ?, tema = ?, dificultad = ?, enunciado = ?,
                 contenido_json = ?, explicacion = ?, etiquetas = ?,
                 actualizado_en = NOW()
             WHERE id = ?`,
            [datos.materiaId, datos.tema, datos.dificultad, datos.enunciado,
             JSON.stringify(datos.contenido), datos.explicacion, datos.etiquetas, pregunta.id]
        );
        registrarAuditoria({
            usuario: req.user, accion: 'edito-pregunta-banco',
            descripcion: `Editó en el repositorio la pregunta "${datos.enunciado || pregunta.enunciado || pregunta.tipo}"`,
            materia: pregunta.materia_nombre,
            detalle: { id: pregunta.id, tipo: pregunta.tipo }
        });
        res.json({ ok: true, id: pregunta.id });
    } catch (err) {
        next(err);
    }
});

// POST /api/banco/:id/duplicar — copia aprobada con contadores en cero.
router.post('/:id/duplicar', soloDocente, async (req, res, next) => {
    try {
        const pregunta = await preguntaGestionable(req, res, Number(req.params.id));
        if (!pregunta) return;
        const [creado] = await pool.query(
            `INSERT INTO banco_preguntas
                (materia_id, tema, tipo, dificultad, enunciado, contenido_json,
                 explicacion, etiquetas, origen, estado, creado_por)
             SELECT materia_id, tema, tipo, dificultad, enunciado, contenido_json,
                    explicacion, etiquetas, origen, 'aprobada', ?
             FROM banco_preguntas WHERE id = ?`,
            [req.user.id, pregunta.id]
        );
        res.status(201).json({ id: creado.insertId, estado: 'aprobada' });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/banco/:id/estado — aprobar / archivar / reactivar.
router.patch('/:id/estado', soloDocente, async (req, res, next) => {
    try {
        const pregunta = await preguntaGestionable(req, res, Number(req.params.id));
        if (!pregunta) return;
        const estado = req.body?.estado;
        if (!['aprobada', 'archivada'].includes(estado)) {
            return res.status(400).json({ error: 'estado debe ser "aprobada" o "archivada"' });
        }
        await pool.query(
            'UPDATE banco_preguntas SET estado = ?, actualizado_en = NOW() WHERE id = ?',
            [estado, pregunta.id]
        );
        registrarAuditoria({
            usuario: req.user,
            accion: estado === 'archivada' ? 'archivo-pregunta-banco' : 'aprobo-pregunta-banco',
            descripcion: `${estado === 'archivada' ? 'Archivó' : 'Aprobó'} en el repositorio la pregunta "${pregunta.enunciado || pregunta.tipo}"`,
            materia: pregunta.materia_nombre,
            detalle: { id: pregunta.id, de: pregunta.estado, a: estado }
        });
        res.json({ ok: true, id: pregunta.id, estado });
    } catch (err) {
        next(err);
    }
});

// POST /api/banco/uso — registra que estas preguntas se insertaron en una
// actividad: incrementa veces_utilizada y sella ultima_utilizacion. Solo
// afecta preguntas de materias que el usuario puede gestionar (el docente,
// las suyas; el admin, todas). Body: { ids: [1, 2, ...] }.
router.post('/uso', soloDocente, async (req, res, next) => {
    try {
        const ids = Array.isArray(req.body?.ids)
            ? [...new Set(req.body.ids.map(Number).filter(esIdValido))]
            : [];
        if (!ids.length) {
            return res.status(400).json({ error: 'ids debe ser un arreglo de enteros positivos' });
        }
        const condiciones = ['id IN (?)'];
        const params = [ids];
        if (req.user.rol !== 'admin') {
            condiciones.push('materia_id IN (SELECT materia_id FROM docente_materia WHERE docente_id = ?)');
            params.push(req.user.id);
        }
        const [resultado] = await pool.query(
            `UPDATE banco_preguntas
             SET veces_utilizada = veces_utilizada + 1, ultima_utilizacion = NOW()
             WHERE ${condiciones.join(' AND ')}`,
            params
        );
        res.json({ ok: true, actualizadas: resultado.affectedRows });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/banco/:id — regla SPEC-010: con uso registrado se ARCHIVA (las
// actividades guardan su snapshot, así que nada se rompe); sin uso, borrado
// físico permitido.
router.delete('/:id', soloDocente, async (req, res, next) => {
    try {
        const pregunta = await preguntaGestionable(req, res, Number(req.params.id));
        if (!pregunta) return;
        const conUso = pregunta.veces_utilizada > 0;
        if (conUso) {
            await pool.query(
                "UPDATE banco_preguntas SET estado = 'archivada', actualizado_en = NOW() WHERE id = ?",
                [pregunta.id]
            );
        } else {
            await pool.query('DELETE FROM banco_preguntas WHERE id = ?', [pregunta.id]);
        }
        registrarAuditoria({
            usuario: req.user,
            accion: conUso ? 'archivo-pregunta-banco' : 'elimino-pregunta-banco',
            descripcion: `${conUso ? 'Archivó (tiene uso)' : 'Eliminó del repositorio'} la pregunta "${pregunta.enunciado || pregunta.tipo}"`,
            materia: pregunta.materia_nombre,
            detalle: { id: pregunta.id, tipo: pregunta.tipo, veces_utilizada: pregunta.veces_utilizada }
        });
        res.json({ ok: true, archivada: conUso });
    } catch (err) {
        next(err);
    }
});

export default router;
