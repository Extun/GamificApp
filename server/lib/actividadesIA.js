// Registro de actividades generables con IA (SPEC-006, Fase 2).
// Una entrada por tipo de reto: esquema JSON que se le exige a la IA, prompt
// construido desde el contexto institucional REAL (BD) y normalización de la
// respuesta. Cero prompts duplicados: /api/ia/generar, la actividad sorpresa
// y "adaptar" consumen este registro.
//
// Agregar un juego nuevo = una entrada aquí + su validador en
// validadoresRetos.js + su reproductor en el frontend.
//
// SPEC-016 Fase 1: los tipos de esquema ya NO vienen del SDK de Gemini sino de
// lib/ia/esquema.js (mismos valores en mayúscula). Se importa con el alias
// `Type` para no reescribir los esquemas de abajo: este archivo describe QUÉ
// generar, nunca CON QUÉ proveedor.
import { Tipo as Type } from './ia/esquema.js';
import pool from '../db.js';
import { VALIDADORES_CONFIG } from './validadoresRetos.js';

export const DIFICULTADES = ['facil', 'media', 'dificil'];

const ETIQUETA_DIFICULTAD = {
    facil: 'fácil (conceptos introductorios, vocabulario muy simple)',
    media: 'media (aplicación de lo aprendido, retos alcanzables)',
    dificil: 'difícil (razonamiento en varios pasos, pero siempre alcanzable para el curso)'
};

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

// Bloque de contexto común que encabeza el prompt de TODOS los tipos.
const bloqueContexto = (ctx) => {
    const partes = [
        `Materia: ${ctx.materia.nombre}${ctx.materia.nivel ? ` (nivel: ${ctx.materia.nivel})` : ''}.`
    ];
    if (ctx.materia.descripcion) partes.push(`Descripción de la materia: ${ctx.materia.descripcion}.`);
    if (ctx.materia.competencias) partes.push(`Competencias que trabaja: ${ctx.materia.competencias}.`);
    if (ctx.curso) {
        partes.push(`Curso destino: ${ctx.curso.nombre} ${ctx.curso.paralelo}${ctx.curso.nivel ? ` (${ctx.curso.nivel})` : ''}.`);
    }
    if (ctx.institucion?.nombre) partes.push(`Institución: ${ctx.institucion.nombre}.`);
    partes.push(`Dificultad pedida: ${ETIQUETA_DIFICULTAD[ctx.dificultad]}.`);
    if (ctx.tema) partes.push(`Tema: '${ctx.tema}'.`);
    return `CONTEXTO REAL DEL AULA (educación básica, niños de 6 a 9 años):\n- ${partes.join('\n- ')}`;
};

// Cuando el docente AMPLÍA una actividad existente, ctx.existentes trae el
// contenido actual como textos. Se anexa a CUALQUIER prompt del registro para
// que la IA complemente lo que ya hay en vez de generar desde cero.
const bloqueExistentes = (ctx) => {
    if (!ctx?.existentes?.length) return '';
    return `\n\nCONTENIDO QUE LA ACTIVIDAD YA TIENE (el docente está AMPLIANDO una actividad existente):\n` +
        ctx.existentes.map((t, i) => `${i + 1}. ${t}`).join('\n') +
        `\nGenera contenido NUEVO y COMPLEMENTARIO sobre el mismo tema: NO repitas, reformules ni ` +
        `parafrasees nada de lo anterior; cubre aspectos del tema que aún no estén tratados y ` +
        `mantén el mismo estilo y nivel del contenido existente.`;
};

const REGLAS_COMUNES =
    `REGLAS ESTRICTAS:\n` +
    `1. Veracidad: usa únicamente información verificada y factual; si no tienes certeza de un dato, no lo inventes.\n` +
    `2. Lenguaje: español sencillo, comprensible por un niño de 6 años; frases cortas y amables.\n` +
    `3. Adecuación: el contenido debe corresponder a la materia y al nivel del curso indicado.\n` +
    `4. Los distractores deben ser plausibles (errores típicos de niños), nunca absurdos ni repetidos.`;

// ---- Esquemas por tipo ------------------------------------------------------
const QUIZ_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            pregunta: { type: Type.STRING },
            alternativas: {
                type: Type.OBJECT,
                properties: {
                    A: { type: Type.STRING }, B: { type: Type.STRING },
                    C: { type: Type.STRING }, D: { type: Type.STRING }
                },
                required: ['A', 'B', 'C', 'D']
            },
            correcta: { type: Type.STRING, description: 'Letra de la alternativa correcta: A, B, C o D' },
            justificacion: { type: Type.STRING }
        },
        required: ['pregunta', 'alternativas', 'correcta', 'justificacion']
    }
};

const MISION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        titulo: { type: Type.STRING, description: 'Título corto y atractivo de la aventura' },
        introduccion: { type: Type.STRING, description: 'Apertura narrativa que presenta el mundo y al héroe (3-4 frases, segunda persona)' },
        desafios: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    narrativa: { type: Type.STRING, description: 'Escena de la historia que plantea el problema (2-3 frases)' },
                    pregunta: { type: Type.STRING, description: 'El desafío concreto de la materia' },
                    alternativas: {
                        type: Type.OBJECT,
                        properties: { A: { type: Type.STRING }, B: { type: Type.STRING }, C: { type: Type.STRING } },
                        required: ['A', 'B', 'C']
                    },
                    correcta: { type: Type.STRING, description: 'Letra de la alternativa correcta: A, B o C' },
                    pista: { type: Type.STRING, description: 'Pista amable si el niño se equivoca, sin dar la respuesta' },
                    exito: { type: Type.STRING, description: 'Frase narrativa que celebra el acierto y empuja la historia (1-2 frases)' }
                },
                required: ['narrativa', 'pregunta', 'alternativas', 'correcta', 'pista', 'exito']
            }
        },
        final: { type: Type.STRING, description: 'Cierre triunfal de la aventura (2-3 frases)' }
    },
    required: ['titulo', 'introduccion', 'desafios', 'final']
};

const CLASIFICADOR_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        titulo: { type: Type.STRING, description: 'Título corto del juego' },
        categorias: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    nombre: { type: Type.STRING },
                    elementos: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING, description: 'Elemento que empieza con un emoji, ej. "🐬 Delfín"' }
                    }
                },
                required: ['nombre', 'elementos']
            }
        }
    },
    required: ['titulo', 'categorias']
};

const MEMORAMA_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        titulo: { type: Type.STRING, description: 'Título corto del memorama' },
        instruccion: { type: Type.STRING, description: 'Instrucción para el niño en una frase' },
        parejas: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    a: { type: Type.STRING, description: 'Primera cara de la pareja (término, operación, palabra…)' },
                    b: { type: Type.STRING, description: 'Segunda cara que le corresponde (definición, resultado, traducción…)' }
                },
                required: ['a', 'b']
            }
        }
    },
    required: ['titulo', 'instruccion', 'parejas']
};

const LINEA_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        titulo: { type: Type.STRING, description: 'Título corto de la secuencia' },
        instruccion: { type: Type.STRING, description: 'Instrucción para el niño en una frase' },
        titulo_secuencia: { type: Type.STRING, description: 'Qué representa la secuencia (proceso, historia, algoritmo…)' },
        eventos: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    texto: { type: Type.STRING, description: 'El evento o paso, en una frase corta' },
                    etiqueta: { type: Type.STRING, description: 'Fecha, número de paso u otra pista corta (opcional)' }
                },
                required: ['texto']
            },
            description: 'Los eventos EN SU ORDEN CORRECTO (el juego los desordena al mostrarse)'
        }
    },
    required: ['titulo', 'instruccion', 'eventos']
};

const COMPLETAR_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        titulo: { type: Type.STRING, description: 'Título corto de la actividad' },
        instruccion: { type: Type.STRING, description: 'Instrucción para el niño en una frase' },
        frases: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    texto: { type: Type.STRING, description: 'Frase con EXACTAMENTE un espacio a completar marcado como ___' },
                    opciones: { type: Type.ARRAY, items: { type: Type.STRING }, description: '3 o 4 opciones, incluida la correcta' },
                    correcta: { type: Type.STRING, description: 'La opción correcta, copiada tal cual de "opciones"' }
                },
                required: ['texto', 'opciones', 'correcta']
            }
        }
    },
    required: ['titulo', 'instruccion', 'frases']
};

// ---- Registro ---------------------------------------------------------------
// `normalizar` recibe la respuesta cruda de la IA y devuelve
// { titulo, descripcion, configuracion, items } ya con la forma que guarda
// `retos.configuracion_json` (items = unidades puntuables, para calcular XP).
export const ACTIVIDADES_IA = {
    quiz: {
        etiqueta: 'Quiz',
        schema: QUIZ_SCHEMA,
        rango: [3, 10],
        construirPrompt: (ctx) =>
            `Eres un docente experto en ${ctx.materia.nombre}. Genera un quiz de opción múltiple ` +
            `sobre el tema '${ctx.tema}' con EXACTAMENTE ${ctx.cantidad} preguntas. Cada pregunta debe tener ` +
            `4 alternativas (A–D), indicar la letra de la respuesta correcta y una justificación. ` +
            `Devuelve EXACTAMENTE ${ctx.cantidad} preguntas, ni más ni menos.\n\n` +
            `${bloqueContexto(ctx)}\n\n${REGLAS_COMUNES}`,
        normalizar: (data, ctx) => {
            const preguntas = Array.isArray(data) ? data : data?.preguntas;
            return {
                titulo: ctx.tema,
                descripcion: `Quiz de ${ctx.materia.nombre} sobre ${ctx.tema}`,
                configuracion: { preguntas },
                items: preguntas?.length || 0
            };
        }
    },

    mision: {
        etiqueta: 'Misión Narrativa',
        schema: MISION_SCHEMA,
        rango: [3, 5],
        construirPrompt: (ctx) =>
            `Eres un escritor de cuentos infantiles y docente experto en ${ctx.materia.nombre} para niños de 6 a 9 años. ` +
            `Crea una MISIÓN NARRATIVA: una mini-aventura de temática "${ctx.tematica || 'aventura mágica'}" donde el estudiante es el héroe ` +
            `(nárrala en segunda persona) y debe superar EXACTAMENTE ${ctx.cantidad} desafíos secuenciales sobre '${ctx.tema}'.\n\n` +
            `${bloqueContexto(ctx)}\n\n${REGLAS_COMUNES}\n` +
            `5. Continuidad: los desafíos son capítulos de UNA MISMA historia; cada 'narrativa' continúa la escena anterior y cada 'exito' conecta con el siguiente capítulo.\n` +
            `6. Integración: el desafío debe nacer de la historia, nunca ser un ejercicio suelto.\n` +
            `7. La 'pista' guía el razonamiento sin revelar la respuesta.`,
        normalizar: (data, ctx) => {
            const desafios = Array.isArray(data?.desafios) ? data.desafios.slice(0, ctx.cantidad) : [];
            return {
                titulo: data?.titulo || ctx.tema,
                descripcion: `Misión narrativa de ${ctx.materia.nombre} sobre ${ctx.tema}`,
                configuracion: { ...data, desafios },
                items: desafios.length
            };
        }
    },

    clasificador: {
        etiqueta: 'Clasificador',
        schema: CLASIFICADOR_SCHEMA,
        rango: [6, 16], // cantidad = elementos totales aproximados
        construirPrompt: (ctx) =>
            `Eres un docente experto en ${ctx.materia.nombre}. Diseña un juego de CLASIFICAR sobre el tema '${ctx.tema}': ` +
            `de 2 a 4 categorías con nombre claro y, entre todas, unos ${ctx.cantidad} elementos para arrastrar a su categoría correcta. ` +
            `Cada elemento debe empezar con un emoji que lo represente (ej. "🐬 Delfín"). ` +
            `Cada elemento pertenece SIN ambigüedad a UNA sola categoría.\n\n` +
            `${bloqueContexto(ctx)}\n\n${REGLAS_COMUNES}`,
        normalizar: (data, ctx) => {
            const categorias = (data?.categorias || []).map((c) => ({
                nombre: String(c?.nombre || '').trim(),
                elementos: (c?.elementos || []).map((e) => String(e).trim()).filter(Boolean)
            }));
            return {
                titulo: data?.titulo || ctx.tema,
                descripcion: `Juego de clasificación: ${categorias.map((c) => c.nombre).join(' vs ')}`,
                configuracion: { categorias },
                items: categorias.reduce((n, c) => n + c.elementos.length, 0)
            };
        }
    },

    memorama: {
        etiqueta: 'Memorama',
        schema: MEMORAMA_SCHEMA,
        rango: [3, 10],
        construirPrompt: (ctx) =>
            `Eres un docente experto en ${ctx.materia.nombre}. Diseña un MEMORAMA (juego de memoria por parejas) ` +
            `sobre el tema '${ctx.tema}' con EXACTAMENTE ${ctx.cantidad} parejas. Cada pareja tiene dos caras que se ` +
            `corresponden entre sí: término↔definición, operación↔resultado, palabra↔traducción, imagen (emoji)↔nombre, ` +
            `según lo que mejor sirva al tema. Las caras deben ser TEXTOS CORTOS (máximo 6 palabras) y puedes usar emojis. ` +
            `Ninguna cara puede corresponder a dos parejas distintas (sin ambigüedad al emparejar).\n\n` +
            `${bloqueContexto(ctx)}\n\n${REGLAS_COMUNES}`,
        normalizar: (data, ctx) => {
            const parejas = (data?.parejas || []).slice(0, ctx.cantidad).map((p) => ({
                a: String(p?.a || '').trim(),
                b: String(p?.b || '').trim()
            }));
            return {
                titulo: data?.titulo || ctx.tema,
                descripcion: `Memorama de ${ctx.materia.nombre} sobre ${ctx.tema}`,
                configuracion: { instruccion: data?.instruccion || 'Encuentra las parejas que se corresponden.', parejas },
                items: parejas.length
            };
        }
    },

    'linea-tiempo': {
        etiqueta: 'Línea del tiempo',
        schema: LINEA_SCHEMA,
        rango: [3, 8],
        construirPrompt: (ctx) =>
            `Eres un docente experto en ${ctx.materia.nombre}. Diseña una actividad de ORDENAR UNA SECUENCIA ` +
            `sobre el tema '${ctx.tema}' con EXACTAMENTE ${ctx.cantidad} eventos o pasos. La secuencia puede ser ` +
            `histórica (fechas), un proceso natural, los pasos para resolver un problema, un procedimiento o un algoritmo: ` +
            `elige lo que corresponda al tema. Entrega los eventos EN SU ORDEN CORRECTO (el juego los desordenará). ` +
            `Cada evento es una frase corta; usa 'etiqueta' para la fecha o el número de paso solo si aporta.\n\n` +
            `${bloqueContexto(ctx)}\n\n${REGLAS_COMUNES}\n` +
            `5. El orden correcto debe ser INDISCUTIBLE (sin dos eventos intercambiables).`,
        normalizar: (data, ctx) => {
            const eventos = (data?.eventos || []).slice(0, ctx.cantidad).map((e) => ({
                texto: String(e?.texto || '').trim(),
                ...(e?.etiqueta ? { etiqueta: String(e.etiqueta).trim() } : {})
            }));
            return {
                titulo: data?.titulo || ctx.tema,
                descripcion: `Línea del tiempo de ${ctx.materia.nombre} sobre ${ctx.tema}`,
                configuracion: {
                    instruccion: data?.instruccion || 'Ordena los eventos: arriba el primero, abajo el último.',
                    ...(data?.titulo_secuencia ? { titulo_secuencia: String(data.titulo_secuencia).trim() } : {}),
                    eventos
                },
                items: eventos.length
            };
        }
    },

    completar: {
        etiqueta: 'Completar espacios',
        schema: COMPLETAR_SCHEMA,
        rango: [2, 8],
        construirPrompt: (ctx) =>
            `Eres un docente experto en ${ctx.materia.nombre}. Diseña una actividad de COMPLETAR ESPACIOS ` +
            `sobre el tema '${ctx.tema}' con EXACTAMENTE ${ctx.cantidad} frases. Cada frase tiene EXACTAMENTE UN ` +
            `espacio en blanco marcado con ___ y de 3 a 4 opciones para llenarlo (una correcta y el resto ` +
            `distractores plausibles). La frase completa debe ser verdadera y natural en español.\n\n` +
            `${bloqueContexto(ctx)}\n\n${REGLAS_COMUNES}`,
        normalizar: (data, ctx) => {
            const frases = (data?.frases || []).slice(0, ctx.cantidad).map((f) => ({
                texto: String(f?.texto || '').trim(),
                opciones: (f?.opciones || []).map((o) => String(o).trim()).filter(Boolean),
                correcta: String(f?.correcta || '').trim()
            }));
            return {
                titulo: data?.titulo || ctx.tema,
                descripcion: `Completar espacios de ${ctx.materia.nombre} sobre ${ctx.tema}`,
                configuracion: { instruccion: data?.instruccion || 'Elige la palabra que completa cada frase.', frases },
                items: frases.length
            };
        }
    }
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
