// Calificación académica sobre 100 (requisito nº 4 del revisor de tesis).
//
// Concepto SEPARADO del XP: la nota se calcula SIEMPRE desde los aciertos y el
// total realmente evaluado en el intento (en el quiz con banco, la muestra
// presentada, nunca el pool completo), y la retroalimentación depende SOLO de
// esta nota. Cambiar las reglas de XP en el futuro no debe cambiar la nota.

// calificacion = round((aciertos / total_evaluado) * 100), acotada a 0–100.
export const calificacionDe = (aciertos, total) => {
    const t = Number(total);
    const a = Number(aciertos);
    if (!(t > 0) || !Number.isFinite(a)) return 0;
    return Math.max(0, Math.min(100, Math.round((a / t) * 100)));
};

// Retroalimentación estándar por rango (una por rango, tono para niños de
// 6–9 años, lenguaje neutral). Rangos del revisor: 0–40 / 41–70 / 71–100.
export const RANGOS_RETROALIMENTACION = [
    {
        rango: 'bajo',
        desde: 0,
        hasta: 40,
        emoji: '🌱',
        titulo: '¡Sigue intentándolo!',
        mensaje: 'Cada partida te ayuda a aprender. Repasa el tema con calma y vuelve a jugar: ¡seguro lo harás mejor!'
    },
    {
        rango: 'medio',
        desde: 41,
        hasta: 70,
        emoji: '💪',
        titulo: '¡Buen esfuerzo!',
        mensaje: 'Vas por buen camino. Revisa las respuestas que te costaron más y sigue practicando para mejorar.'
    },
    {
        rango: 'alto',
        desde: 71,
        hasta: 100,
        emoji: '🏆',
        titulo: '¡Excelente trabajo!',
        mensaje: 'Has demostrado un gran dominio del tema. Sigue así y continúa aprendiendo.'
    }
];

export const retroalimentacionDe = (calificacion) => {
    const nota = Math.max(0, Math.min(100, Number(calificacion) || 0));
    return RANGOS_RETROALIMENTACION.find((r) => nota >= r.desde && nota <= r.hasta)
        || RANGOS_RETROALIMENTACION[0];
};
