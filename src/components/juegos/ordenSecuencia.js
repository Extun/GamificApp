// Evaluación de la LÍNEA DEL TIEMPO (A2, aprobado sobre SPEC-015).
//
// La actividad se evalúa UNA sola vez, al enviar: durante el intento el
// estudiante reordena libremente y nada se marca como correcto.
//
// Criterio: NO se puntúa la posición absoluta sino cuántos PARES DE EVENTOS
// quedaron en el orden relativo correcto — para cada par (i, j), si el que
// debía ir antes quedó antes. Es el coeficiente de concordancia de rangos de
// Kendall expresado sobre 100, fácil de justificar académicamente.
//
// Por qué NO posición absoluta: mover un evento desplaza a todos los que le
// siguen, así que un único error puede dar 0 aunque el alumno entendiera la
// secuencia.
// Por qué NO adyacencia (pares consecutivos): se probó y da resultados
// absurdos — intercambiar dos vecinos rompe TRES pares consecutivos a la vez
// y hunde la nota a 0/100 con 3 eventos, castigando más el error más leve y
// más típico a los 6-9 años. Kendall no tiene ese punto ciego.
//
// Encaja en SPEC-015 sin cambiarla: sigue siendo aciertos/total → /100, con
// total = n(n-1)/2 pares (no n posiciones). El XP proporcional, la
// calificación y los reintentos incrementales funcionan igual, sin tocar
// el servidor.

// `orden` = índices de los eventos como los dejó el estudiante.
// El orden correcto es siempre [0, 1, 2, … n-1] (los eventos llegan ordenados
// desde la configuración y el juego los baraja al empezar).
export const evaluarOrden = (orden) => {
    const n = Array.isArray(orden) ? orden.length : 0;
    // Una secuencia de un solo evento no tiene pares que evaluar: se da por
    // acertada (evita total = 0, que el servidor rechazaría).
    if (n < 2) return { aciertos: n, total: Math.max(n, 1) };

    let aciertos = 0;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (orden[i] < orden[j]) aciertos++;
        }
    }
    return { aciertos, total: (n * (n - 1)) / 2 };
};

export default evaluarOrden;
