// Tipo de juego: Clasificador (SPEC-017, Fase 1).
// Código movido SIN cambios desde los módulos originales.
import { Tipo } from '../../ia/esquema.js';
import { bloqueContexto, REGLAS_COMUNES } from '../prompts.js';

const schema = {
    type: Tipo.OBJECT,
    properties: {
        titulo: { type: Tipo.STRING, description: 'Título corto del juego' },
        categorias: {
            type: Tipo.ARRAY,
            items: {
                type: Tipo.OBJECT,
                properties: {
                    nombre: { type: Tipo.STRING },
                    elementos: {
                        type: Tipo.ARRAY,
                        items: { type: Tipo.STRING, description: 'Elemento que empieza con un emoji, ej. "🐬 Delfín"' }
                    }
                },
                required: ['nombre', 'elementos']
            }
        }
    },
    required: ['titulo', 'categorias']
};

export const clasificador = {
    tipo: 'clasificador',
    etiqueta: 'Clasificador',
    emoji: '🧩',
    descripcion: 'Arrastra cada elemento a la categoría que le corresponde.',
    // Banco diferido a post-tesis (SPEC-013 §3 / MASTER_PLAN §3.18): la unidad
    // reutilizable sería el grupo de categorías completo, no elementos sueltos.
    capacidades: { ia: true, banco: false, reutilizar: false, automatico: false },
    verboAuditoria: 'Jugó el clasificador',

    // Forma esperada: { categorias: [{ nombre, elementos: [string, ...] }, ...] }
    validarConfig: (config) => {
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
    },

    // Todos los elementos repartidos entre las canastas.
    totalEsperado: (config) => {
        if (!Array.isArray(config?.categorias) || !config.categorias.length) return null;
        let n = 0;
        for (const cat of config.categorias) {
            if (!Array.isArray(cat?.elementos)) return null;
            n += cat.elementos.length;
        }
        return Number.isInteger(n) && n > 0 ? n : null;
    },

    banco: null,

    ia: {
        schema,
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
    }
};

export default clasificador;
