// Total de ítems evaluables que un intento LEGÍTIMO puede reportar, derivado
// del `tipo` + `configuracion_json` persistidos del reto (cierre de seguridad
// del payload de progreso, SPEC-015 §Modelo de confianza).
//
// Función PURA y sin dependencias: el servidor no reimplementa la mecánica de
// cada juego, solo comprueba que el `total` recibido es estructuralmente
// posible para ese reto. Debe mantenerse en paralelo con lo que el cliente
// cuenta como `total` en cada reproductor.
//
// Devuelve un entero positivo, o `null` si el total no es derivable
// (configuración ausente, malformada o tipo desconocido).

const esArrayConItems = (v) => Array.isArray(v) && v.length > 0;
const entero = (v) => (Number.isInteger(v) && v > 0 ? v : null);

// Memorama: el cliente transmite la NOTA de eficiencia como `aciertos` sobre
// una base normalizada de 100 (ver calificacionMemorama.js), porque con tan
// pocas parejas la nota quedaría cuantizada en muy pocos escalones.
export const BASE_MEMORAMA = 100;

const DERIVADORES = {
    // Preguntas realmente jugables en UN intento: si el quiz define una muestra
    // por intento (`preguntas_por_intento`), esa es la referencia — nunca el
    // pool completo. Espeja `muestrear()` de QuizInteractivo.jsx.
    quiz: (config) => {
        if (!esArrayConItems(config?.preguntas)) return null;
        const pool = config.preguntas.length;
        const porIntento = Number(config.preguntas_por_intento) || 0;
        return porIntento > 0 ? Math.min(porIntento, pool) : pool;
    },

    // Todos los elementos repartidos entre las canastas.
    clasificador: (config) => {
        if (!esArrayConItems(config?.categorias)) return null;
        let n = 0;
        for (const cat of config.categorias) {
            if (!Array.isArray(cat?.elementos)) return null;
            n += cat.elementos.length;
        }
        return entero(n);
    },

    completar: (config) => (esArrayConItems(config?.frases) ? config.frases.length : null),

    mision: (config) => (esArrayConItems(config?.desafios) ? config.desafios.length : null),

    // Métrica Kendall: pares de eventos cuyo orden relativo se evalúa.
    // Espeja evaluarOrden() de ordenSecuencia.js, INCLUIDO su borde (con menos
    // de 2 eventos no hay pares y el total degenera a 1).
    'linea-tiempo': (config) => {
        if (!esArrayConItems(config?.eventos)) return null;
        const n = config.eventos.length;
        return n < 2 ? 1 : (n * (n - 1)) / 2;
    },

    // Base normalizada; la configuración solo se comprueba para no aceptar
    // progreso contra un memorama sin parejas.
    memorama: (config) => (esArrayConItems(config?.parejas) ? BASE_MEMORAMA : null)
};

export const totalEsperado = (tipo, configuracion) => {
    const derivar = DERIVADORES[tipo];
    if (!derivar || !configuracion || typeof configuracion !== 'object') return null;
    try {
        return entero(derivar(configuracion));
    } catch {
        return null;
    }
};

export default totalEsperado;
