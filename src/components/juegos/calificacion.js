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

// Rangos OFICIALES del revisor (0–40 / 41–70 / 71–100). Los casos especiales
// (0, 100, "a un paso del perfecto") son variantes de mensaje DENTRO de su
// rango: nunca alteran los límites ni el emoji/título del rango.
export const RANGOS_RETROALIMENTACION = [
    {
        rango: 'bajo',
        desde: 0,
        hasta: 40,
        emoji: '🌱',
        titulo: '¡Sigue intentándolo!',
        // {a} = aciertos, {t} = total evaluado (se interpolan si hay contexto).
        mensajes: [
            '¡Ya tienes un punto de partida! Acertaste {a} de {t}. Revisa las demás respuestas y en el próximo intento podrás superar tu resultado.',
            '¡Vas avanzando! Ya resolviste una parte del reto. Revisa lo que faltó y vuelve a intentarlo para mejorar tu marca.'
        ],
        mensajeCero: 'Esta vez estuvo difícil, pero ya conoces mejor el reto. Revisa las respuestas con calma y vuelve a intentarlo cuando quieras.'
    },
    {
        rango: 'medio',
        desde: 41,
        hasta: 70,
        emoji: '💪',
        titulo: '¡Buen esfuerzo!',
        mensajes: [
            '¡Buen avance! Acertaste {a} de {t} y estás cada vez más cerca de dominar este tema. Revisa las que se complicaron y sigue practicando.',
            '¡Vas por buen camino! Tu esfuerzo está dando resultados. Un repaso más puede ayudarte a superar tu mejor marca.'
        ]
    },
    {
        rango: 'alto',
        desde: 71,
        hasta: 100,
        emoji: '🏆',
        titulo: '¡Excelente trabajo!',
        mensajes: [
            '¡Muy buen trabajo! Demostraste que comprendes gran parte del tema. Revisa esos últimos detalles y podrás llegar aún más lejos.',
            '¡Excelente esfuerzo! Dominas casi todo el tema. Un repaso rápido y podrás alcanzar el resultado perfecto.'
        ],
        mensajeCasiPerfecto: '¡Muy buen trabajo! Acertaste {a} de {t}: ¡estuviste muy cerca del resultado perfecto! Revisa ese último detalle y lo lograrás.',
        mensajePerfecto: 'Respondiste todo correctamente. Excelente trabajo: sigue manteniendo ese nivel.'
    }
];

const interpolar = (texto, aciertos, total) =>
    texto.replace('{a}', String(aciertos)).replace('{t}', String(total));

// Retroalimentación por rango. `contexto` ({ aciertos, total }) es opcional:
// sin él se devuelve la primera variante del rango sin interpolar datos
// (uso del Libro de Calificaciones, que solo necesita emoji/rango).
// La variante se elige de forma DETERMINISTA a partir de aciertos/total, así
// un re-render nunca cambia el mensaje a mitad de pantalla; intentos con
// resultados distintos pueden ver variantes distintas.
export const retroalimentacionDe = (calificacion, contexto = {}) => {
    const nota = Math.max(0, Math.min(100, Number(calificacion) || 0));
    const rango = RANGOS_RETROALIMENTACION.find((r) => nota >= r.desde && nota <= r.hasta)
        || RANGOS_RETROALIMENTACION[0];

    const a = Number(contexto.aciertos);
    const t = Number(contexto.total);
    const conContexto = Number.isFinite(a) && t > 0;

    let mensaje;
    if (nota === 100 && rango.mensajePerfecto) {
        mensaje = rango.mensajePerfecto;
    } else if (nota === 0 && rango.mensajeCero) {
        mensaje = rango.mensajeCero;
    } else if (conContexto && rango.mensajeCasiPerfecto && a === t - 1) {
        mensaje = rango.mensajeCasiPerfecto;
    } else {
        const indice = conContexto ? (a * 7 + t) % rango.mensajes.length : 0;
        mensaje = rango.mensajes[indice];
    }
    // Sin contexto no se interpolan datos: solo variantes que no los usan.
    if (!conContexto && mensaje.includes('{a}')) mensaje = rango.mensajes[rango.mensajes.length - 1];

    return {
        rango: rango.rango,
        emoji: rango.emoji,
        titulo: nota === 100 ? '¡Resultado perfecto!' : rango.titulo,
        mensaje: conContexto ? interpolar(mensaje, a, t) : mensaje
    };
};
