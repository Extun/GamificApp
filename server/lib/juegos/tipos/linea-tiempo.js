// Tipo de juego: Línea del tiempo (SPEC-017, Fase 1).
// Código movido SIN cambios desde los módulos originales.
import { Tipo } from '../../ia/esquema.js';
import { bloqueContexto, REGLAS_COMUNES } from '../prompts.js';

const schema = {
    type: Tipo.OBJECT,
    properties: {
        titulo: { type: Tipo.STRING, description: 'Título corto de la secuencia' },
        instruccion: { type: Tipo.STRING, description: 'Instrucción para el niño en una frase' },
        titulo_secuencia: { type: Tipo.STRING, description: 'Qué representa la secuencia (proceso, historia, algoritmo…)' },
        eventos: {
            type: Tipo.ARRAY,
            items: {
                type: Tipo.OBJECT,
                properties: {
                    texto: { type: Tipo.STRING, description: 'El evento o paso, en una frase corta' },
                    etiqueta: { type: Tipo.STRING, description: 'Fecha, número de paso u otra pista corta (opcional)' }
                },
                required: ['texto']
            },
            description: 'Los eventos EN SU ORDEN CORRECTO (el juego los desordena al mostrarse)'
        }
    },
    required: ['titulo', 'instruccion', 'eventos']
};

export const lineaTiempo = {
    tipo: 'linea-tiempo',
    etiqueta: 'Línea del tiempo',
    emoji: '⏳',
    descripcion: 'Ordena los eventos o pasos en su secuencia correcta.',
    capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },
    verboAuditoria: 'Ordenó la línea del tiempo',

    // Forma esperada: { instruccion, titulo_secuencia?, eventos: [{ texto, etiqueta? }, ...] }
    // Los eventos se guardan EN ORDEN CORRECTO; el reproductor los baraja al jugar.
    validarConfig: (config) => {
        if (!config || !Array.isArray(config.eventos)) {
            return 'La línea del tiempo debe incluir un arreglo "eventos"';
        }
        if (config.eventos.length < 3 || config.eventos.length > 8) {
            return 'La línea del tiempo necesita entre 3 y 8 eventos';
        }
        for (const [i, e] of config.eventos.entries()) {
            if (typeof e?.texto !== 'string' || !e.texto.trim()) {
                return `El evento ${i + 1} necesita un texto`;
            }
        }
        return null;
    },

    // Métrica Kendall: pares de eventos cuyo orden relativo se evalúa.
    // Espeja evaluarOrden() de ordenSecuencia.js, INCLUIDO su borde (con menos
    // de 2 eventos no hay pares y el total degenera a 1).
    totalEsperado: (config) => {
        if (!Array.isArray(config?.eventos) || !config.eventos.length) return null;
        const n = config.eventos.length;
        return n < 2 ? 1 : (n * (n - 1)) / 2;
    },

    banco: {
        claveItems: 'eventos',
        validarItem: (item) => {
            if (typeof item?.texto !== 'string' || !item.texto.trim()) {
                return 'El evento necesita un texto';
            }
            return null;
        },
        resumenItem: (item) => (item?.etiqueta ? `${item.etiqueta}: ${item.texto}` : item?.texto)
    },

    ia: {
        schema,
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
    }
};

export default lineaTiempo;
