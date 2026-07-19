// Generación de actividades con IA (SPEC-006 → SPEC-017 Fase 1).
//
// Los esquemas, prompts y normalizadores POR TIPO ya no viven aquí: son parte
// del contrato de cada juego en lib/juegos/tipos/*.js. Este módulo conserva lo
// que es común a todos los tipos:
//   · construcción del contexto institucional desde la BD;
//   · orquestación de la generación + validación;
//   · continuación de una misión existente.
//
// `ACTIVIDADES_IA` se re-exporta desde el registro para no romper a sus
// consumidores (routes/ia.js). Cero prompts duplicados, como antes.
//
// Agregar un juego nuevo = un archivo en lib/juegos/tipos/ (ver
// docs/COMO-AGREGAR-UN-JUEGO.md). Este archivo NO se toca.
import pool from '../db.js';
import { ACTIVIDADES_IA, VALIDADORES_CONFIG } from './juegos/registro.js';
import { MISION_SCHEMA } from './juegos/tipos/mision.js';
import { DIFICULTADES, bloqueContexto, bloqueExistentes, REGLAS_COMUNES } from './juegos/prompts.js';

export { ACTIVIDADES_IA, DIFICULTADES };

// ---- Contexto institucional -------------------------------------------------
// Todo lo que la IA "sabe" viene de la BD: materia (nombre, nivel, descripción,
// competencias del catálogo inteligente), curso e institución. Nada hardcodeado.
export const construirContexto = async ({ materiaId, cursoId, tema, tematica, dificultad, cantidad }) => {
    const [[materia]] = await pool.query(
        `SELECT id, nombre, nivel, descripcion, competencias
         FROM materias WHERE id = ? AND eliminado_en IS NULL`,
        [materiaId]
    );
    if (!materia) return null;

    let curso = null;
    if (cursoId) {
        [[curso]] = await pool.query(
            `SELECT id, nombre, paralelo, nivel FROM cursos
             WHERE id = ? AND eliminado_en IS NULL`,
            [cursoId]
        );
    }
    const [[institucion]] = await pool.query(
        'SELECT nombre, anio_lectivo FROM institucion WHERE id = 1'
    );

    return {
        materia,
        curso,
        institucion: institucion || null,
        tema: tema || null,
        tematica: tematica || null,
        dificultad: DIFICULTADES.includes(dificultad) ? dificultad : 'media',
        cantidad
    };
};

// Continúa una misión narrativa existente: genera `cantidad` desafíos NUEVOS
// que siguen la historia después del último capítulo (sin repetir preguntas ni
// escenas). Devuelve el arreglo de desafíos listos para anexar.
export const continuarMision = async (generarJSON, ctx, misionActual, cantidad) => {
    const n = Math.min(Math.max(Number(cantidad) || 1, 1), 3);
    const resumen = {
        titulo: misionActual?.titulo,
        introduccion: misionActual?.introduccion,
        desafios: (misionActual?.desafios || []).map((d) => ({
            narrativa: d?.narrativa, pregunta: d?.pregunta, exito: d?.exito
        })),
        final: misionActual?.final
    };
    const data = await generarJSON({
        prompt:
            `Eres un escritor de cuentos infantiles y docente experto en ${ctx.materia.nombre} para niños de 6 a 9 años. ` +
            `CONTINÚA la misión narrativa existente que verás abajo: escribe EXACTAMENTE ${n} desafíos NUEVOS ` +
            `sobre '${ctx.tema}'${ctx.tematica ? ` con la temática "${ctx.tematica}"` : ''} que sigan la historia ` +
            `justo después del último desafío y antes del final.\n\n` +
            `MISIÓN ACTUAL (JSON):\n${JSON.stringify(resumen)}\n\n` +
            `${bloqueContexto(ctx)}\n\n${REGLAS_COMUNES}\n` +
            `5. Continuidad: los desafíos nuevos retoman la escena donde quedó el último 'exito' y mantienen a los mismos personajes y mundo.\n` +
            `6. NO repitas ni reformules preguntas, escenas o contenidos que ya aparecen en la misión actual.\n` +
            `7. Devuelve la misión con SOLO los ${n} desafíos nuevos en 'desafios' (conserva titulo, introduccion y final tal cual).`,
        schema: MISION_SCHEMA
    });
    return (Array.isArray(data?.desafios) ? data.desafios : []).slice(0, n);
};

// Genera y valida la configuración de un tipo. Devuelve
// { titulo, descripcion, configuracion, items } o lanza con mensaje claro.
export const generarActividad = async (generarJSON, tipo, ctx) => {
    const def = ACTIVIDADES_IA[tipo];
    if (!def) throw new Error(`Tipo de actividad no soportado por la IA: ${tipo}`);

    const [min, max] = def.rango;
    ctx.cantidad = Math.min(Math.max(Number(ctx.cantidad) || min, min), max);

    const data = await generarJSON({ prompt: def.construirPrompt(ctx) + bloqueExistentes(ctx), schema: def.schema });
    const resultado = def.normalizar(data, ctx);

    const validar = VALIDADORES_CONFIG[tipo];
    const errorConfig = validar ? validar(resultado.configuracion) : null;
    if (errorConfig) {
        throw new Error(`La IA no devolvió la actividad en el formato esperado (${errorConfig}).`);
    }
    return resultado;
};

export default ACTIVIDADES_IA;
