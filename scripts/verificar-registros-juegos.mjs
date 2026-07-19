// Consistencia entre los dos registros de tipos de juego (SPEC-017 §4.3-ter).
//
// Backend y frontend tienen registros separados a propósito: uno necesita
// `pool`, prompts y validación de seguridad; el otro, componentes React.
// Comparten los identificadores `tipo`, y este script comprueba que no
// divergen.
//
// NO crea dependencias cruzadas entre server/ y src/: el registro del servidor
// se importa (es Node puro) y el del frontend se LEE COMO TEXTO, porque
// importarlo arrastraría JSX y componentes que Node no sabe cargar.
//
// Uso: node scripts/verificar-registros-juegos.mjs
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(aqui, '..');
const DIR_FRONT = join(RAIZ, 'src', 'components', 'juegos', 'registro');

const { TIPOS_VALIDOS: BACKEND } = await import(
    new URL('../server/lib/juegos/registro.js', import.meta.url)
);

// Extrae los `tipo: '...'` declarados en los archivos de tipo del frontend.
// El índice va en .js (sin JSX) por la regla react-refresh del proyecto; los
// archivos de tipo son .jsx porque contienen su vista de lectura.
// `editores.js` no es un tipo: mapea tipo → editor del docente y vive aparte
// para evitar un ciclo de imports (ver su cabecera).
const NO_SON_TIPOS = ['index.js', 'index.jsx', 'editores.js', 'editores.jsx'];
const archivos = (await readdir(DIR_FRONT))
    .filter((f) => /\.jsx?$/.test(f) && !NO_SON_TIPOS.includes(f));
const FRONTEND = [];
for (const archivo of archivos) {
    const texto = await readFile(join(DIR_FRONT, archivo), 'utf8');
    const encontrado = texto.match(/^\s*tipo:\s*'([^']+)'/m);
    if (!encontrado) {
        console.error(`❌ ${archivo}: no declara un campo \`tipo\``);
        process.exit(1);
    }
    FRONTEND.push(encontrado[1]);
}

// El índice debe registrar todos los archivos de tipo (no basta con crearlos).
let indice = '';
for (const nombre of ['index.js', 'index.jsx']) {
    try { indice = await readFile(join(DIR_FRONT, nombre), 'utf8'); break; } catch { /* siguiente */ }
}
if (!indice) {
    console.error(`❌ No se encontró el índice del registro frontend en ${DIR_FRONT}`);
    process.exit(1);
}
const noRegistrados = archivos
    .map((f) => f.replace(/\.jsx?$/, ''))
    .filter((nombre) => !new RegExp(`from '\\./${nombre}'`).test(indice));

const soloBackend = BACKEND.filter((t) => !FRONTEND.includes(t));
const soloFrontend = FRONTEND.filter((t) => !BACKEND.includes(t));

console.log(`backend  (${BACKEND.length}): ${[...BACKEND].sort().join(', ')}`);
console.log(`frontend (${FRONTEND.length}): ${[...FRONTEND].sort().join(', ')}`);

const problemas = [];
if (soloBackend.length) {
    problemas.push(`Solo en BACKEND: ${soloBackend.join(', ')} — falta su archivo en src/components/juegos/registro/`);
}
if (soloFrontend.length) {
    problemas.push(`Solo en FRONTEND: ${soloFrontend.join(', ')} — falta su archivo en server/lib/juegos/tipos/`);
}
if (noRegistrados.length) {
    problemas.push(`Archivos de tipo no importados en registro/index.jsx: ${noRegistrados.join(', ')}`);
}

if (problemas.length) {
    console.error('\n❌ Los registros de juegos DIVERGEN:');
    for (const p of problemas) console.error(`   - ${p}`);
    process.exit(1);
}

console.log('\n✅ Los dos registros declaran exactamente los mismos tipos.');
