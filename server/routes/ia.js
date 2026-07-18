// Rutas de IA (SPEC-006) — la API key de Gemini vive SOLO en el servidor.
//
//   POST /api/ia/generar   → cualquier tipo de actividad del registro (genérico)
//   POST /api/ia/sorpresa  → la IA decide juego/tema/dificultad y guarda un BORRADOR
//   POST /api/ia/adaptar   → transforma una actividad existente (curso/materia/dificultad/temática)
//   POST /api/ia/quiz      → compatibilidad (GeneradorQuiz existente)
//   POST /api/ia/mision    → compatibilidad (GeneradorMision existente)
//   POST /api/ia/asistente → respuesta libre (sin entrada en la UI actual)
//
// El cliente Gemini vive en lib/iaCliente.js y los prompts/esquemas por tipo
// en lib/actividadesIA.js (registro único, sin prompts duplicados).
import { Router } from 'express';
import { Type } from '@google/genai';
import pool from '../db.js';
import { soloDocente, puedeGestionarMateria } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { generarJSON, generarConReintentos } from '../lib/iaCliente.js';
import { VALIDADORES_CONFIG } from '../lib/validadoresRetos.js';
import {
    ACTIVIDADES_IA,
    DIFICULTADES,
    construirContexto,
    generarActividad,
    continuarMision
} from '../lib/actividadesIA.js';

const router = Router();

const esIdValido = (n) => Number.isInteger(n) && n > 0;
// Misma regla de recompensa que el resto de la app: 100 XP por ítem acertado
// (PUNTOS_POR_ACIERTO del frontend).
const XP_POR_ITEM = 100;

const responderErrorIA = (res, contexto, err) => {
    console.error(`IA/${contexto}:`, err.message);
    const status = err?.status === 503 ? 503 : 502;
    res.status(status).json({ error: `No se pudo generar con la IA. Inténtalo de nuevo.` });
};

// Lee y valida los parámetros comunes de generación desde el body.
const parametrosGeneracion = (body) => ({
    materiaId: Number(body?.materia_id),
    cursoId: body?.curso_id ? Number(body.curso_id) : null,
    tema: String(body?.tema || '').trim().slice(0, 200),
    tematica: String(body?.tematica || '').trim().slice(0, 60) || null,
    dificultad: DIFICULTADES.includes(body?.dificultad) ? body.dificultad : 'media',
    cantidad: Number(body?.cantidad) || undefined
});

// Título único dentro de la materia (mismo criterio que "duplicar" en retos.js).
const tituloDisponible = async (materiaId, base) => {
    const limpio = base.slice(0, 110).trim();
    for (let n = 0; n <= 50; n++) {
        const candidato = n === 0 ? limpio : `${limpio} (${n + 1})`.slice(0, 120);
        const [[ocupado]] = await pool.query(
            'SELECT 1 AS si FROM retos WHERE materia_id = ? AND titulo = ?',
            [materiaId, candidato]
        );
        if (!ocupado) return candidato;
    }
    return null;
};

// Inserta un borrador generado por IA y registra auditoría. Devuelve la fila creada.
const guardarBorradorIA = async ({ user, materiaId, cursoId, tipo, dificultad, resultado, accion, descripcionAuditoria }) => {
    const titulo = await tituloDisponible(materiaId, resultado.titulo);
    if (!titulo) {
        const err = new Error('Demasiadas actividades con ese título; renombra o elimina alguna.');
        err.status = 409;
        throw err;
    }
    const xp = Math.max(resultado.items, 1) * XP_POR_ITEM;
    const [creado] = await pool.query(
        `INSERT INTO retos (materia_id, titulo, tipo, descripcion, configuracion_json,
                            xp_recompensa, estado, docente_id, origen, dificultad, curso_id)
         VALUES (?, ?, ?, ?, ?, ?, 'borrador', ?, 'ia', ?, ?)`,
        [materiaId, titulo, tipo, resultado.descripcion, JSON.stringify(resultado.configuracion),
         xp, user.id, dificultad, cursoId]
    );
    const [[materia]] = await pool.query('SELECT nombre FROM materias WHERE id = ?', [materiaId]);
    registrarAuditoria({
        usuario: user,
        accion,
        descripcion: `${descripcionAuditoria} "${titulo}"`,
        materia: materia?.nombre || null,
        detalle: { titulo, tipo, dificultad, xp_recompensa: xp, estado: 'borrador' }
    });
    return {
        id: creado.insertId,
        materia_id: materiaId,
        titulo,
        tipo,
        descripcion: resultado.descripcion,
        configuracion: resultado.configuracion,
        xp_recompensa: xp,
        estado: 'borrador',
        origen: 'ia',
        dificultad,
        curso_id: cursoId
    };
};

// ---- POST /api/ia/generar ----
// Body: { tipo, materia_id, tema, cantidad?, dificultad?, curso_id?, tematica?, existentes? }
// Devuelve la actividad generada y VALIDADA, sin guardarla (el docente decide
// en su editor si la guarda como borrador o la publica).
router.post('/generar', soloDocente, async (req, res) => {
    const tipo = String(req.body?.tipo || '').trim();
    const params = parametrosGeneracion(req.body);

    if (!ACTIVIDADES_IA[tipo]) {
        return res.status(400).json({ error: `tipo debe ser uno de: ${Object.keys(ACTIVIDADES_IA).join(', ')}` });
    }
    if (!esIdValido(params.materiaId) || !params.tema) {
        return res.status(400).json({ error: 'Se requieren materia_id y tema' });
    }
    try {
        if (!await puedeGestionarMateria(req.user, params.materiaId)) {
            return res.status(403).json({ error: 'No tienes asignada esta materia' });
        }
        const ctx = await construirContexto(params);
        if (!ctx) return res.status(404).json({ error: 'Materia no encontrada' });
        if (Array.isArray(req.body?.existentes)) {
            ctx.existentes = req.body.existentes.map((p) => String(p).trim()).filter(Boolean).slice(0, 50);
        }
        const resultado = await generarActividad(generarJSON, tipo, ctx);
        res.json({
            tipo,
            titulo: resultado.titulo,
            descripcion: resultado.descripcion,
            configuracion: resultado.configuracion,
            items: resultado.items,
            xp_sugerida: Math.max(resultado.items, 1) * XP_POR_ITEM,
            dificultad: ctx.dificultad
        });
    } catch (err) {
        responderErrorIA(res, 'generar', err);
    }
});

// ---- POST /api/ia/sorpresa ----
// Body: { materia_id, curso_id? }. La IA decide tipo, tema, temática,
// dificultad y cantidad según la materia/curso reales; se genera el contenido
// completo y se guarda como BORRADOR (nunca se publica solo).
const SORPRESA_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        tipo: { type: Type.STRING, description: 'El tipo de juego elegido' },
        tema: { type: Type.STRING, description: 'Tema concreto del currículo de la materia para el nivel indicado' },
        tematica: { type: Type.STRING, description: 'Ambientación narrativa si el tipo es mision (ej. "piratas")' },
        dificultad: { type: Type.STRING, description: 'facil, media o dificil' },
        cantidad: { type: Type.INTEGER, description: 'Cuántos ítems tendrá la actividad' },
        objetivo: { type: Type.STRING, description: 'Objetivo pedagógico en una frase' }
    },
    required: ['tipo', 'tema', 'dificultad', 'cantidad', 'objetivo']
};

router.post('/sorpresa', soloDocente, async (req, res) => {
    const materiaId = Number(req.body?.materia_id);
    const cursoId = req.body?.curso_id ? Number(req.body.curso_id) : null;
    if (!esIdValido(materiaId)) {
        return res.status(400).json({ error: 'Se requiere materia_id' });
    }
    try {
        if (!await puedeGestionarMateria(req.user, materiaId)) {
            return res.status(403).json({ error: 'No tienes asignada esta materia' });
        }
        const base = await construirContexto({ materiaId, cursoId });
        if (!base) return res.status(404).json({ error: 'Materia no encontrada' });

        // 1) La IA decide qué actividad crear, conociendo el aula real.
        const tipos = Object.keys(ACTIVIDADES_IA);
        const decision = await generarJSON({
            prompt:
                `Eres un docente experto de educación básica. Elige UNA actividad sorpresa para el aula descrita abajo.\n` +
                `Tipos de juego disponibles (elige exactamente uno de estos slugs): ${tipos.join(', ')}.\n` +
                `Elige también un tema concreto y apropiado del currículo de la materia para ese nivel, la dificultad ` +
                `(facil, media o dificil), la cantidad de ítems (entre 3 y 8) y el objetivo pedagógico.\n` +
                `Varía tus elecciones: no elijas siempre quiz.\n\n` +
                `Materia: ${base.materia.nombre}${base.materia.nivel ? ` (nivel: ${base.materia.nivel})` : ''}.` +
                (base.materia.descripcion ? `\nDescripción: ${base.materia.descripcion}.` : '') +
                (base.materia.competencias ? `\nCompetencias: ${base.materia.competencias}.` : '') +
                (base.curso ? `\nCurso: ${base.curso.nombre} ${base.curso.paralelo}${base.curso.nivel ? ` (${base.curso.nivel})` : ''}.` : '') +
                (base.institucion?.nombre ? `\nInstitución: ${base.institucion.nombre}.` : ''),
            schema: SORPRESA_SCHEMA
        });

        const tipo = tipos.includes(decision?.tipo) ? decision.tipo : 'quiz';
        const ctx = await construirContexto({
            materiaId,
            cursoId,
            tema: String(decision?.tema || '').trim().slice(0, 200) || base.materia.nombre,
            tematica: String(decision?.tematica || '').trim().slice(0, 60) || null,
            dificultad: DIFICULTADES.includes(decision?.dificultad) ? decision.dificultad : 'media',
            cantidad: Number(decision?.cantidad) || undefined
        });

        // 2) Se genera el contenido completo con el registro común.
        const resultado = await generarActividad(generarJSON, tipo, ctx);
        if (decision?.objetivo) {
            resultado.descripcion = `${resultado.descripcion} · Objetivo: ${String(decision.objetivo).trim()}`.slice(0, 500);
        }

        // 3) Se guarda como BORRADOR: el docente edita, publica o elimina.
        const reto = await guardarBorradorIA({
            user: req.user,
            materiaId,
            cursoId,
            tipo,
            dificultad: ctx.dificultad,
            resultado,
            accion: 'sorpresa-ia',
            descripcionAuditoria: `Generó una actividad sorpresa con IA (${ACTIVIDADES_IA[tipo].etiqueta}):`
        });
        res.status(201).json({ reto, objetivo: decision?.objetivo || null });
    } catch (err) {
        if (err.status === 409) return res.status(409).json({ error: err.message });
        responderErrorIA(res, 'sorpresa', err);
    }
});

// ---- POST /api/ia/adaptar ----
// Body: { reto_id, cambios: { materia_id?, curso_id?, dificultad?, tematica?, tema? } }
// Reutiliza la actividad existente como insumo (mantiene el formato) y guarda
// la versión adaptada como una COPIA en borrador; el original no se toca.
router.post('/adaptar', soloDocente, async (req, res) => {
    const retoId = Number(req.body?.reto_id);
    const cambios = req.body?.cambios || {};
    if (!esIdValido(retoId)) {
        return res.status(400).json({ error: 'Se requiere reto_id' });
    }
    try {
        const [[reto]] = await pool.query(
            `SELECT r.*, m.nombre AS materia_nombre FROM retos r
             JOIN materias m ON m.id = r.materia_id
             WHERE r.id = ? AND r.eliminado_en IS NULL`,
            [retoId]
        );
        if (!reto) return res.status(404).json({ error: 'Actividad no encontrada' });
        if (!ACTIVIDADES_IA[reto.tipo]) {
            return res.status(400).json({ error: `Este tipo de actividad (${reto.tipo}) no se puede adaptar con IA` });
        }
        const configOriginal = typeof reto.configuracion_json === 'string'
            ? JSON.parse(reto.configuracion_json)
            : reto.configuracion_json;
        if (!configOriginal) {
            return res.status(400).json({ error: 'La actividad no tiene contenido que adaptar' });
        }
        // Permisos: materia de origen Y de destino asignadas al docente.
        const materiaDestino = cambios.materia_id ? Number(cambios.materia_id) : reto.materia_id;
        if (!await puedeGestionarMateria(req.user, reto.materia_id) ||
            !await puedeGestionarMateria(req.user, materiaDestino)) {
            return res.status(403).json({ error: 'No tienes asignada esta materia' });
        }

        const ctx = await construirContexto({
            materiaId: materiaDestino,
            cursoId: cambios.curso_id ? Number(cambios.curso_id) : reto.curso_id,
            tema: String(cambios.tema || '').trim().slice(0, 200) || reto.titulo,
            tematica: String(cambios.tematica || '').trim().slice(0, 60) || null,
            dificultad: DIFICULTADES.includes(cambios.dificultad) ? cambios.dificultad : (reto.dificultad || 'media'),
            cantidad: undefined
        });
        if (!ctx) return res.status(404).json({ error: 'Materia de destino no encontrada' });

        const def = ACTIVIDADES_IA[reto.tipo];
        const instrucciones = [];
        if (cambios.materia_id && Number(cambios.materia_id) !== reto.materia_id) {
            instrucciones.push(`convierte el contenido de la materia "${reto.materia_nombre}" a la materia "${ctx.materia.nombre}"`);
        }
        if (cambios.dificultad && cambios.dificultad !== reto.dificultad) {
            instrucciones.push(`ajusta la dificultad a "${cambios.dificultad}"`);
        }
        if (cambios.curso_id) instrucciones.push('adecúa el vocabulario y la exigencia al curso indicado');
        if (cambios.tematica) instrucciones.push(`cambia la temática/ambientación a "${ctx.tematica}"`);
        if (cambios.tema) instrucciones.push(`cambia el tema a '${ctx.tema}'`);
        if (!instrucciones.length) {
            return res.status(400).json({ error: 'Indica al menos un cambio (materia, curso, dificultad, temática o tema)' });
        }

        const data = await generarJSON({
            prompt:
                `Eres un docente experto. ADAPTA la siguiente actividad existente manteniendo EXACTAMENTE su formato ` +
                `y una cantidad de ítems similar. Cambios pedidos: ${instrucciones.join('; ')}.\n\n` +
                `ACTIVIDAD ORIGINAL (JSON):\n${JSON.stringify(configOriginal)}\n\n` +
                `CONTEXTO DEL AULA DESTINO:\n` +
                `Materia: ${ctx.materia.nombre}${ctx.materia.nivel ? ` (nivel: ${ctx.materia.nivel})` : ''}.` +
                (ctx.curso ? ` Curso: ${ctx.curso.nombre} ${ctx.curso.paralelo}.` : '') +
                ` Dificultad: ${ctx.dificultad}.\n\n` +
                `REGLAS: información verificada y factual; español sencillo para niños de 6 a 9 años; ` +
                `distractores plausibles; conserva la estructura del JSON pedido.`,
            schema: def.schema
        });
        // Cantidad esperada = la que tenga la respuesta (validador exige rangos).
        ctx.cantidad = def.rango[1];
        const resultado = def.normalizar(data, ctx);
        const errorConfig = VALIDADORES_CONFIG[reto.tipo]?.(resultado.configuracion);
        if (errorConfig) {
            return res.status(502).json({ error: `La IA no devolvió la adaptación en el formato esperado (${errorConfig})` });
        }

        resultado.titulo = `${resultado.titulo} (adaptada)`;
        const creado = await guardarBorradorIA({
            user: req.user,
            materiaId: materiaDestino,
            cursoId: cambios.curso_id ? Number(cambios.curso_id) : reto.curso_id,
            tipo: reto.tipo,
            dificultad: ctx.dificultad,
            resultado,
            accion: 'adapto-reto',
            descripcionAuditoria: `Adaptó con IA la actividad "${reto.titulo}" como`
        });
        res.status(201).json({ reto: creado });
    } catch (err) {
        if (err.status === 409) return res.status(409).json({ error: err.message });
        responderErrorIA(res, 'adaptar', err);
    }
});

// ---- Compatibilidad: POST /api/ia/quiz ----
// Body: { materia (nombre), tema, cantidad, existentes? } → { preguntas }
router.post('/quiz', soloDocente, async (req, res) => {
    const materiaNombre = String(req.body?.materia || '').trim().slice(0, 60);
    const tema = String(req.body?.tema || '').trim().slice(0, 200);
    const cantidad = Math.min(Math.max(Number(req.body?.cantidad) || 3, 1), 10);
    if (!materiaNombre || !tema) {
        return res.status(400).json({ error: 'Se requieren materia y tema' });
    }
    try {
        const [[materia]] = await pool.query(
            'SELECT id FROM materias WHERE nombre = ? AND eliminado_en IS NULL',
            [materiaNombre]
        );
        const ctx = materia
            ? await construirContexto({ materiaId: materia.id, tema, cantidad })
            : { materia: { nombre: materiaNombre }, curso: null, institucion: null, tema, tematica: null, dificultad: 'media', cantidad };
        if (Array.isArray(req.body?.existentes)) {
            ctx.existentes = req.body.existentes.map((p) => String(p).trim()).filter(Boolean).slice(0, 50);
        }
        const resultado = await generarActividad(generarJSON, 'quiz', ctx);
        res.json({ preguntas: resultado.configuracion.preguntas });
    } catch (err) {
        responderErrorIA(res, 'quiz', err);
    }
});

// ---- Compatibilidad: POST /api/ia/mision ----
// Body: { materia (nombre), tema, tematica, cantidad } → { mision }
// Con `mision_actual` (la configuración ya en el editor) + `cantidad`, en vez
// de crear una aventura nueva CONTINÚA esa historia y devuelve solo los
// desafíos nuevos → { desafios }.
router.post('/mision', soloDocente, async (req, res) => {
    const materiaNombre = String(req.body?.materia || '').trim().slice(0, 60);
    const tema = String(req.body?.tema || '').trim().slice(0, 200);
    const tematica = String(req.body?.tematica || '').trim().slice(0, 60);
    const cantidad = Math.min(Math.max(Number(req.body?.cantidad) || 3, 3), 5);
    if (!materiaNombre || !tema || !tematica) {
        return res.status(400).json({ error: 'Se requieren materia, tema y temática de la aventura' });
    }
    try {
        const [[materia]] = await pool.query(
            'SELECT id FROM materias WHERE nombre = ? AND eliminado_en IS NULL',
            [materiaNombre]
        );
        const ctx = materia
            ? await construirContexto({ materiaId: materia.id, tema, tematica, cantidad })
            : { materia: { nombre: materiaNombre }, curso: null, institucion: null, tema, tematica, dificultad: 'media', cantidad };
        const misionActual = req.body?.mision_actual;
        if (misionActual && Array.isArray(misionActual.desafios) && misionActual.desafios.length) {
            const desafios = await continuarMision(generarJSON, ctx, misionActual, req.body?.cantidad);
            if (!desafios.length) throw new Error('La IA no devolvió desafíos nuevos');
            return res.json({ desafios });
        }
        const resultado = await generarActividad(generarJSON, 'mision', ctx);
        res.json({ mision: resultado.configuracion });
    } catch (err) {
        responderErrorIA(res, 'mision', err);
    }
});

// ---- POST /api/ia/asistente ----
// Body: { mensaje } → { texto }
router.post('/asistente', soloDocente, async (req, res) => {
    const mensaje = String(req.body?.mensaje || '').trim().slice(0, 4000);
    if (!mensaje) return res.status(400).json({ error: 'Escribe un mensaje' });

    try {
        const respuesta = await generarConReintentos({ contents: mensaje });
        res.json({ texto: respuesta.text });
    } catch (err) {
        console.error('IA/asistente:', err.message);
        res.status(502).json({ error: 'No se pudo obtener la respuesta de la IA. Inténtalo de nuevo.' });
    }
});

export default router;
