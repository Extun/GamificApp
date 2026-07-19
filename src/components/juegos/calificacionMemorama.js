// Calificación del MEMORAMA (opción C, aprobada sobre SPEC-015).
//
// Un juego de memoria se juega necesariamente a ciegas al principio: descubrir
// dónde está cada carta ES la mecánica. El criterio anterior (una pareja solo
// puntuaba si se encontraba sin ningún fallo previo) castigaba justo eso, así
// que el alumno empezaba con casi todas las parejas ya descalificadas.
//
// Criterio nuevo, en una frase:
//   «Una vuelta completa de exploración es gratis; a partir de ahí la nota
//    mide la eficiencia con que el estudiante recordó lo que ya había visto.»
//
//   f <= n  →  100
//   f >  n  →  100 · n / (n + (f - n))
//
// donde n = nº de parejas del tablero y f = INTENTOS FALLIDOS de formar pareja
// (dos cartas reveladas juntas que no casan). f cuenta intentos, NO cartas
// sueltas, y emparejar no suma nada: los fallos previos ya se contaron una vez
// cada uno cuando ocurrieron, así que encontrar una pareja cuyas cartas ya se
// habían visto no distorsiona la fórmula.
//
// La tolerancia escala sola con el tablero (4 parejas → 4 fallos gratis;
// 10 parejas → 10), porque un tablero más grande exige más exploración.

// Devuelve { nota, aciertos, total } listo para SPEC-015.
//
// SPEC-015 calcula la calificación como round(aciertos/total × 100) y el XP
// como round(aciertos/total × xp_recompensa). Para que la curva llegue intacta
// al servidor se envía la nota sobre una base de 100 (`aciertos` = nota,
// `total` = 100): con `total` = nº de parejas, la nota quedaría cuantizada en
// pocos escalones (con 6 parejas solo 0/17/33/50/67/83/100) y la curva se
// perdería. El contrato de SPEC-015 no cambia: sigue siendo aciertos/total.
export const BASE_CALIFICACION = 100;

export const evaluarMemorama = ({ parejas, fallos }) => {
    const n = Number(parejas) || 0;
    const f = Math.max(0, Number(fallos) || 0);
    if (n <= 0) return { nota: 0, aciertos: 0, total: BASE_CALIFICACION };

    const tolerados = n; // fase de exploración gratuita
    const bruta = f <= tolerados
        ? 100
        : (100 * n) / (n + (f - tolerados));
    const nota = Math.max(0, Math.min(100, Math.round(bruta)));

    return { nota, aciertos: nota, total: BASE_CALIFICACION };
};

export default evaluarMemorama;
