// Tipo de juego: Memorama (SPEC-017, Fase 1).
// Código movido SIN cambios desde los módulos originales.
import { Tipo } from '../../ia/esquema.js';
import { bloqueContexto, REGLAS_COMUNES } from '../prompts.js';

// Memorama: el cliente transmite la NOTA de eficiencia como `aciertos` sobre
// una base normalizada de 100 (ver calificacionMemorama.js), porque con tan
// pocas parejas la nota quedaría cuantizada en muy pocos escalones.
export const BASE_MEMORAMA = 100;

const schema = {
    type: Tipo.OBJECT,
    properties: {
        titulo: { type: Tipo.STRING, description: 'Título corto del memorama' },
        instruccion: { type: Tipo.STRING, description: 'Instrucción para el niño en una frase' },
        parejas: {
            type: Tipo.ARRAY,
            items: {
                type: Tipo.OBJECT,
                properties: {
                    a: { type: Tipo.STRING, description: 'Primera cara de la pareja (término, operación, palabra…)' },
                    b: { type: Tipo.STRING, description: 'Segunda cara que le corresponde (definición, resultado, traducción…)' }
                },
                required: ['a', 'b']
            }
        }
    },
    required: ['titulo', 'instruccion', 'parejas']
};

export const memorama = {
    tipo: 'memorama',
    etiqueta: 'Memorama',
    emoji: '🃏',
    descripcion: 'Encuentra las parejas que se corresponden entre sí.',
    capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },
    verboAuditoria: 'Jugó el memorama',

    // Forma esperada: { instruccion, parejas: [{ a, b }, ...] }
    validarConfig: (config) => {
        if (!config || !Array.isArray(config.parejas)) {
            return 'El memorama debe incluir un arreglo "parejas"';
        }
        if (config.parejas.length < 3 || config.parejas.length > 10) {
            return 'El memorama necesita entre 3 y 10 parejas';
        }
        for (const [i, p] of config.parejas.entries()) {
            if (typeof p?.a !== 'string' || !p.a.trim() || typeof p?.b !== 'string' || !p.b.trim()) {
                return `La pareja ${i + 1} necesita sus dos caras (a y b) con texto`;
            }
        }
        return null;
    },

    // Base normalizada; la configuración solo se comprueba para no aceptar
    // progreso contra un memorama sin parejas.
    totalEsperado: (config) =>
        (Array.isArray(config?.parejas) && config.parejas.length ? BASE_MEMORAMA : null),

    banco: {
        claveItems: 'parejas',
        validarItem: (item) => {
            if (typeof item?.a !== 'string' || !item.a.trim() ||
                typeof item?.b !== 'string' || !item.b.trim()) {
                return 'La pareja necesita sus dos caras (a y b) con texto';
            }
            return null;
        },
        resumenItem: (item) => (item?.a && item?.b ? `${item.a} ↔ ${item.b}` : '')
    },

    ia: {
        schema,
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
    }
};

export default memorama;
