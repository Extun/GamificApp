// Anexado de ítems al editor genérico de actividades (SPEC-017).
//
// POR QUÉ EXISTE ESTE ARCHIVO: el editor anexa ítems desde dos sitios (la IA y
// el banco) y ambos tenían que repetir a mano las mismas tres reglas —quitar
// repetidos, respetar el máximo del tipo y aplicar el hook `alAnexar` del
// juego—. Una de las dos copias llamaba a `alAnexar` con un argumento de más y
// el hook recibía la lista equivocada: el memorama y completar espacios
// duplicaban lo que ya había en vez de sumar lo nuevo, y la línea del tiempo
// reventaba con «e.forEach is not a function». Con una sola función pura hay un
// único punto donde se invoca el hook, y `scripts/verificar-anexado-ia.mjs` lo
// comprueba contra el registro real de los 7 juegos.
//
// Es JS puro (sin React ni JSX) a propósito: así el script de verificación lo
// importa tal cual en Node.

// Valores por defecto para un tipo que no declare los suyos en el registro.
const MAX_POR_DEFECTO = 10;
const firmaPorDefecto = (item) => JSON.stringify(item);
const anexarPorDefecto = (_actuales, entrantes) => entrantes;

// `firmaItem` puede devolver UNA clave (lo normal: el texto del ítem) o VARIAS
// cuando el juego necesita que sean únicos varios campos a la vez. El memorama
// devuelve sus dos caras: dos parejas que compartan una cara le pondrían al
// niño dos cartas con el mismo texto que NO casan entre sí (el reproductor
// empareja por índice de pareja, no por texto), y el tablero se vuelve
// imposible de entender. Un ítem se descarta si CUALQUIERA de sus claves ya
// está tomada.
const clavesDe = (firmaItem, item) => {
    const firma = firmaItem(item);
    return (Array.isArray(firma) ? firma : [firma]).filter((c) => c !== '' && c != null);
};

// Elige, de los ítems `nuevos`, los que aún NO están en `actuales` y caben en
// la actividad. `cantidad` (opcional) limita además cuántos se aceptan.
// Devuelve también por qué quedó fuera cada uno, para poder avisar al docente
// con precisión en vez de un mensaje genérico.
export const seleccionarParaAnexar = ({ edicion = {}, actuales = [], nuevos = [], cantidad }) => {
    const firmaItem = edicion.firmaItem || firmaPorDefecto;
    const maxItems = edicion.maxItems || MAX_POR_DEFECTO;
    const espacio = Math.max(maxItems - actuales.length, 0);
    const tope = Number.isFinite(cantidad) ? Math.min(Math.max(cantidad, 0), espacio) : espacio;

    // Las claves acumulan también las de los ítems ya aceptados de esta misma
    // tanda: si la IA devuelve dos veces lo mismo, solo entra uno.
    const tomadas = new Set(actuales.flatMap((item) => clavesDe(firmaItem, item)));
    const distintos = [];
    let repetidos = 0;
    for (const item of nuevos) {
        const claves = clavesDe(firmaItem, item);
        if (claves.some((clave) => tomadas.has(clave))) {
            repetidos += 1;
            continue;
        }
        for (const clave of claves) tomadas.add(clave);
        distintos.push(item);
    }
    const seleccion = distintos.slice(0, tope);
    return {
        seleccion,
        repetidos,
        sinEspacio: distintos.length - seleccion.length,
        espacio,
        maxItems
    };
};

// Anexa `nuevos` al final de `actuales` aplicando el hook `alAnexar` del tipo
// (la línea del tiempo lo usa para continuar la numeración de «Paso 1, 2…» en
// vez de reiniciarla). Único sitio del código donde se llama a ese hook.
export const anexarItems = ({ edicion = {}, actuales = [], nuevos = [] }) => {
    const alAnexar = edicion.alAnexar || anexarPorDefecto;
    const anexados = alAnexar(actuales, nuevos) || [];
    return { anexados, lista: [...actuales, ...anexados] };
};
