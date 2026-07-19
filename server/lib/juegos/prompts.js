// Piezas de prompt COMPARTIDAS por todos los tipos de juego (SPEC-017, Fase 1).
// Movidas sin cambios desde lib/actividadesIA.js: el contexto institucional y
// las reglas comunes encabezan el prompt de TODOS los tipos, así que viven
// fuera de los archivos de tipo para no duplicarse.

export const DIFICULTADES = ['facil', 'media', 'dificil'];

const ETIQUETA_DIFICULTAD = {
    facil: 'fácil (conceptos introductorios, vocabulario muy simple)',
    media: 'media (aplicación de lo aprendido, retos alcanzables)',
    dificil: 'difícil (razonamiento en varios pasos, pero siempre alcanzable para el curso)'
};

// Bloque de contexto común que encabeza el prompt de TODOS los tipos.
export const bloqueContexto = (ctx) => {
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
export const bloqueExistentes = (ctx) => {
    if (!ctx?.existentes?.length) return '';
    return `\n\nCONTENIDO QUE LA ACTIVIDAD YA TIENE (el docente está AMPLIANDO una actividad existente):\n` +
        ctx.existentes.map((t, i) => `${i + 1}. ${t}`).join('\n') +
        `\nGenera contenido NUEVO y COMPLEMENTARIO sobre el mismo tema: NO repitas, reformules ni ` +
        `parafrasees nada de lo anterior; cubre aspectos del tema que aún no estén tratados y ` +
        `mantén el mismo estilo y nivel del contenido existente.`;
};

export const REGLAS_COMUNES =
    `REGLAS ESTRICTAS:\n` +
    `1. Veracidad: usa únicamente información verificada y factual; si no tienes certeza de un dato, no lo inventes.\n` +
    `2. Lenguaje: español sencillo, comprensible por un niño de 6 años; frases cortas y amables.\n` +
    `3. Adecuación: el contenido debe corresponder a la materia y al nivel del curso indicado.\n` +
    `4. Los distractores deben ser plausibles (errores típicos de niños), nunca absurdos ni repetidos.`;
