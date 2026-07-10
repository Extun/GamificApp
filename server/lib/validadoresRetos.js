// Validadores de `configuracion_json` por tipo de reto (SPEC-006).
// Única fuente de verdad: los usan retos.js (al publicar/guardar borrador)
// y los endpoints de IA (antes de entregar/guardar lo generado).
// Cada validador devuelve un mensaje de error o null si la config es válida.
//
// Registrar un juego nuevo = agregar aquí su validador (y su entrada en
// server/lib/actividadesIA.js si se genera con IA). La API de retos acepta
// cualquier slug válido aunque no tenga validador (compatibilidad histórica).

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

// Forma esperada: { titulo, introduccion, final,
//   desafios: [{ narrativa, pregunta, alternativas: {A,B,C}, correcta, pista, exito }] }
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

// Forma esperada: { preguntas: [{ pregunta, alternativas: {A,B,C,D}, correcta, justificacion }] }
const validarConfigQuiz = (config) => {
    if (!config || !Array.isArray(config.preguntas) || !config.preguntas.length) {
        return 'El quiz necesita al menos una pregunta';
    }
    for (const [i, p] of config.preguntas.entries()) {
        const etiqueta = `La pregunta ${i + 1}`;
        if (typeof p?.pregunta !== 'string' || !p.pregunta.trim()) {
            return `${etiqueta} necesita un enunciado`;
        }
        if (!p?.alternativas?.A || !p?.alternativas?.B) {
            return `${etiqueta} necesita al menos las alternativas A y B`;
        }
        const correcta = String(p?.correcta || '').trim().toUpperCase().charAt(0);
        if (!p?.alternativas?.[correcta]) {
            return `${etiqueta} necesita una respuesta correcta que exista entre sus alternativas`;
        }
    }
    return null;
};

// Forma esperada: { instruccion, parejas: [{ a, b }, ...] } (memorama).
const validarConfigMemorama = (config) => {
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
};

// Forma esperada: { instruccion, titulo_secuencia?, eventos: [{ texto, etiqueta? }, ...] }
// Los eventos se guardan EN ORDEN CORRECTO; el reproductor los baraja al jugar.
const validarConfigLineaTiempo = (config) => {
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
};

// Forma esperada: { instruccion, frases: [{ texto (con ___), opciones: [3-4], correcta }, ...] }
const validarConfigCompletar = (config) => {
    if (!config || !Array.isArray(config.frases)) {
        return 'La actividad de completar debe incluir un arreglo "frases"';
    }
    if (config.frases.length < 2 || config.frases.length > 8) {
        return 'La actividad de completar necesita entre 2 y 8 frases';
    }
    for (const [i, f] of config.frases.entries()) {
        const etiqueta = `La frase ${i + 1}`;
        if (typeof f?.texto !== 'string' || !f.texto.includes('___')) {
            return `${etiqueta} necesita un espacio a completar marcado con ___`;
        }
        if (!Array.isArray(f.opciones) || f.opciones.length < 2 ||
            f.opciones.some((o) => typeof o !== 'string' || !o.trim())) {
            return `${etiqueta} necesita al menos 2 opciones con texto`;
        }
        if (typeof f?.correcta !== 'string' || !f.opciones.includes(f.correcta)) {
            return `${etiqueta} necesita que "correcta" sea una de sus opciones`;
        }
    }
    return null;
};

export const VALIDADORES_CONFIG = {
    quiz: validarConfigQuiz,
    clasificador: validarConfigClasificador,
    mision: validarConfigMision,
    memorama: validarConfigMemorama,
    'linea-tiempo': validarConfigLineaTiempo,
    completar: validarConfigCompletar
};

export default VALIDADORES_CONFIG;
