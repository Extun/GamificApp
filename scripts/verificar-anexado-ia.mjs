// Anexado de ítems con IA / desde el banco — comprobación automática.
//
// POR QUÉ: "Añadir con IA" duplicaba el contenido en memorama y completar
// espacios y reventaba en línea del tiempo ("e.forEach is not a function")
// porque el editor llamaba al hook `alAnexar` del tipo con un argumento de más.
// Ningún error de compilación lo delata: el hook recibía la lista equivocada y
// devolvía basura. Esta prueba ejercita el anexado REAL de los 7 juegos con
// escenarios reales (parejas de matemáticas, pasos de una suma, frases con ___)
// para que no vuelva a pasar inadvertido.
//
// CÓMO: el registro del frontend son archivos .jsx que Node no sabe cargar, así
// que se empaquetan con rolldown (ya está instalado, lo usa Vite) y se importa
// el bundle. Se escribe en node_modules/.cache/ (fuera de git) porque desde ahí
// Node sí resuelve `react` y los demás paquetes externos.
//
// Uso: node scripts/verificar-anexado-ia.mjs
import { rolldown } from 'rolldown';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(aqui, '..');

// ---- Carga del registro real (JSX → ESM importable) -------------------------
const TMP = join(RAIZ, 'node_modules', '.cache', 'gamificapp-anexado');
mkdirSync(TMP, { recursive: true });
const STUB_CSS = join(TMP, 'stub-css.js');
writeFileSync(STUB_CSS, 'export default {};\n');

const empaquetar = async (entrada, nombre) => {
    const bundle = await rolldown({
        input: join(RAIZ, entrada),
        platform: 'node',
        // Los reproductores importan React y MUI; no se renderizan aquí, basta
        // con que resuelvan. El CSS se sustituye por un módulo vacío.
        external: [/^react/, /^react-dom/, /^@mui/, /^@emotion/],
        plugins: [{ name: 'stub-css', resolveId: (id) => (id.endsWith('.css') ? STUB_CSS : null) }],
        onwarn() { /* silencio: el bundle es de usar y tirar */ }
    });
    const { output } = await bundle.generate({ format: 'esm' });
    // `import.meta.env` es de Vite y en Node no existe (services/ lo lee).
    const codigo = output.map((c) => c.code || '').join('\n').replaceAll('import.meta.env', '({})');
    const destino = join(TMP, nombre);
    writeFileSync(destino, codigo);
    return import(pathToFileURL(destino).href);
};

const { JUEGOS, TIPOS_VALIDOS } = await empaquetar('src/components/juegos/registro/index.js', 'registro.mjs');
const { seleccionarParaAnexar, anexarItems } = await import(
    pathToFileURL(join(RAIZ, 'src/components/juegos/anexarItems.js')).href
);

// ---- Mini arnés de aserciones ----------------------------------------------
let fallos = 0;
let pasadas = 0;
const comprobar = (nombre, condicion, detalle = '') => {
    if (condicion) {
        pasadas += 1;
        console.log(`   ✅ ${nombre}`);
    } else {
        fallos += 1;
        console.error(`   ❌ ${nombre}${detalle ? `\n      ${detalle}` : ''}`);
    }
};

// Simula lo que hace el editor al pulsar "Añadir con IA" o "Reutilizar":
// seleccionar lo que no está y cabe, y anexarlo aplicando el hook del tipo.
const anexar = (tipo, actuales, nuevos, cantidad) => {
    const edicion = JUEGOS[tipo].edicion;
    const { seleccion, repetidos, sinEspacio } = seleccionarParaAnexar({ edicion, actuales, nuevos, cantidad });
    const { anexados, lista } = anexarItems({ edicion, actuales, nuevos: seleccion });
    return { anexados, lista, repetidos, sinEspacio };
};

const textos = (tipo, lista) => {
    const clave = JUEGOS[tipo].edicion.claveItems;
    return `${clave}: ${JSON.stringify(lista)}`;
};

// ---- Escenario 1: memorama (el bug reportado) -------------------------------
// Contenido calcado del caso real: un memorama de sumas y restas al que el
// docente le pide 3 parejas más con IA.
console.log('\n🃏 Memorama — "Añadir con IA" sobre un memorama de sumas y restas');
{
    const actuales = [
        { a: '3 + 2', b: '5' },
        { a: '4 - 1', b: '3' },
        { a: '5 + 4', b: '9' }
    ];
    const deLaIA = [
        { a: '6 + 1', b: '7' },
        { a: '8 - 2', b: '6' },
        { a: '2 + 2', b: '4' }
    ];
    const { anexados, lista } = anexar('memorama', actuales, deLaIA, 3);

    comprobar('anexa las 3 parejas NUEVAS (no las que ya estaban)',
        anexados.length === 3 && anexados.every((p) => deLaIA.some((n) => n.a === p.a && n.b === p.b)),
        textos('memorama', anexados));
    comprobar('la lista final tiene 6 parejas y conserva las originales',
        lista.length === 6 && actuales.every((p, i) => lista[i].a === p.a && lista[i].b === p.b),
        textos('memorama', lista));
    comprobar('ninguna cara se repite en el tablero',
        new Set(lista.flatMap((p) => [p.a, p.b])).size === lista.length * 2,
        textos('memorama', lista));
}

// El fallo exacto que reportó el docente: la IA devuelve lo mismo que ya hay.
console.log('\n🃏 Memorama — la IA devuelve parejas que ya existen');
{
    const actuales = [{ a: '3 + 2', b: '5' }, { a: '4 - 1', b: '3' }];
    const { anexados, repetidos } = anexar('memorama', actuales, [
        { a: '3 + 2', b: '5' },        // idéntica
        { a: '4 - 1', b: '3' }         // idéntica
    ], 2);
    comprobar('no duplica nada y las cuenta como repetidas',
        anexados.length === 0 && repetidos === 2, `anexados=${anexados.length} repetidos=${repetidos}`);
}

console.log('\n🃏 Memorama — una pareja nueva reutiliza una cara ya usada');
{
    const actuales = [{ a: '3 + 2', b: '5' }];
    // "4 + 1 ↔ 5" es correcta, pero pondría DOS cartas con "5" que no casan
    // entre sí (el reproductor empareja por índice de pareja, no por texto).
    const { anexados } = anexar('memorama', actuales, [{ a: '4 + 1', b: '5' }, { a: '7 - 1', b: '6' }], 2);
    comprobar('descarta la pareja ambigua y acepta la limpia',
        anexados.length === 1 && anexados[0].b === '6', textos('memorama', anexados));
}

console.log('\n🃏 Memorama — la IA repite una pareja DENTRO de la misma tanda');
{
    const { anexados } = anexar('memorama', [], [
        { a: 'perro', b: 'dog' },
        { a: 'Perro', b: 'Dog' },      // la misma con otra capitalización
        { a: 'gato', b: 'cat' }
    ], 3);
    comprobar('solo entra una de las dos copias',
        anexados.length === 2, textos('memorama', anexados));
}

// ---- Escenario 2: línea del tiempo (el "e.forEach is not a function") -------
console.log('\n⏳ Línea del tiempo — "Añadir con IA" sobre los pasos de una suma');
{
    const actuales = [
        { texto: 'Leer el problema con atención.', etiqueta: 'Paso 1' },
        { texto: 'Colocar los números alineados por las unidades.', etiqueta: 'Paso 2' },
        { texto: 'Sumar primero las unidades.', etiqueta: 'Paso 3' }
    ];
    const deLaIA = [
        { texto: 'Sumar después las decenas.', etiqueta: 'Paso 1' },
        { texto: 'Escribir el resultado final.', etiqueta: 'Paso 2' }
    ];
    let resultado;
    let excepcion = null;
    try {
        resultado = anexar('linea-tiempo', actuales, deLaIA, 2);
    } catch (err) {
        excepcion = err;
    }
    comprobar('no lanza excepción (antes: "e.forEach is not a function")',
        !excepcion, excepcion?.message);
    if (!excepcion) {
        comprobar('anexa los 2 eventos NUEVOS',
            resultado.anexados.length === 2 &&
            resultado.anexados[0].texto === 'Sumar después las decenas.',
            textos('linea-tiempo', resultado.anexados));
        comprobar('continúa la numeración: Paso 4 y Paso 5, no Paso 1 y 2',
            resultado.anexados[0]?.etiqueta === 'Paso 4' && resultado.anexados[1]?.etiqueta === 'Paso 5',
            textos('linea-tiempo', resultado.anexados));
        comprobar('la lista final tiene 5 eventos en orden',
            resultado.lista.length === 5 &&
            resultado.lista.map((e) => e.etiqueta).join(',') === 'Paso 1,Paso 2,Paso 3,Paso 4,Paso 5',
            textos('linea-tiempo', resultado.lista));
    }
}

console.log('\n⏳ Línea del tiempo — etiquetas que NO son ordinales se respetan');
{
    const actuales = [{ texto: 'Llegan los españoles.', etiqueta: '1492' }];
    const { anexados } = anexar('linea-tiempo', actuales, [{ texto: 'Independencia de Guayaquil.', etiqueta: '1820' }], 1);
    comprobar('una fecha no se renumera',
        anexados[0]?.etiqueta === '1820', textos('linea-tiempo', anexados));
}

// ---- Escenario 3: completar espacios ---------------------------------------
console.log('\n✏️  Completar espacios — "Añadir con IA" sobre los animales');
{
    const actuales = [
        { texto: 'El sol sale por el ___.', opciones: ['este', 'oeste', 'norte'], correcta: 'este' },
        { texto: 'La vaca vive en la ___.', opciones: ['granja', 'ciudad', 'playa'], correcta: 'granja' }
    ];
    const deLaIA = [
        { texto: 'El pez vive en el ___.', opciones: ['agua', 'aire', 'árbol'], correcta: 'agua' },
        { texto: 'La vaca vive en la ___.', opciones: ['granja', 'ciudad', 'playa'], correcta: 'granja' },
        { texto: 'El pájaro vuela por el ___.', opciones: ['cielo', 'mar', 'suelo'], correcta: 'cielo' }
    ];
    const { anexados, lista, repetidos } = anexar('completar', actuales, deLaIA, 2);

    comprobar('anexa las 2 frases nuevas y descarta la repetida',
        anexados.length === 2 && repetidos === 1 &&
        anexados.every((f) => f.texto !== 'La vaca vive en la ___.'),
        textos('completar', anexados));
    comprobar('la lista final tiene 4 frases y conserva las originales',
        lista.length === 4 && lista[0].texto === actuales[0].texto,
        textos('completar', lista));
    comprobar('las frases anexadas siguen siendo válidas para el servidor',
        anexados.every((f) => f.texto.includes('___') && f.opciones.includes(f.correcta)),
        textos('completar', anexados));
}

// ---- Escenario 4: el tope de cada tipo -------------------------------------
console.log('\n📏 Tope de ítems por tipo (nunca se pasa del máximo del validador)');
for (const tipo of TIPOS_VALIDOS) {
    const edicion = JUEGOS[tipo].edicion;
    // Solo los tipos que usan el editor genérico (misión y clasificador tienen
    // el suyo propio y no declaran la plantilla de ítem vacío).
    if (!edicion?.claveItems || typeof edicion.itemVacio !== 'function') continue;
    const max = edicion.maxItems || 10;
    const actuales = Array.from({ length: max - 1 }, (_, i) => ({
        ...edicion.itemVacio(), texto: `existente ${i}`, a: `A${i}`, b: `B${i}`
    }));
    const nuevos = Array.from({ length: 5 }, (_, i) => ({
        ...edicion.itemVacio(), texto: `nuevo ${i}`, a: `X${i}`, b: `Y${i}`
    }));
    const { lista, sinEspacio } = anexar(tipo, actuales, nuevos, 5);
    comprobar(`${tipo}: llena hasta ${max} y deja fuera el resto`,
        lista.length === max && sinEspacio === 4,
        `lista=${lista.length} sinEspacio=${sinEspacio}`);
}

// ---- Escenario 5: contrato del hook alAnexar --------------------------------
// La causa raíz fue una llamada con la aridad equivocada. Aquí se comprueba que
// cada tipo que declara `alAnexar` respeta el contrato (actuales, nuevos).
console.log('\n🔌 Contrato de `alAnexar(actuales, nuevos)` en todos los tipos');
for (const tipo of TIPOS_VALIDOS) {
    const hook = JUEGOS[tipo].edicion?.alAnexar;
    if (!hook) continue;
    comprobar(`${tipo}: declara exactamente 2 parámetros`, hook.length === 2,
        `recibe ${hook.length}`);
    const nuevos = [{ texto: 'nuevo', etiqueta: 'Paso 1' }];
    const salida = hook([], nuevos);
    comprobar(`${tipo}: sin ítems previos devuelve los nuevos tal cual`,
        Array.isArray(salida) && salida.length === nuevos.length,
        JSON.stringify(salida));
}

// ---- Resultado --------------------------------------------------------------
console.log(`\n${fallos ? '❌' : '✅'} ${pasadas} comprobaciones correctas, ${fallos} con error.`);
process.exit(fallos ? 1 : 0);
