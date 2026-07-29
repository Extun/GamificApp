// ============================================================
// Comprobación SOLO LECTURA del MySQL local.
//
// El instalador lo llama para saber si la instancia responde de verdad
// (handshake completo, no solo un puerto abierto), qué versión es y —si se
// indica una base— cuántas tablas tiene ya.
//
// Modo espera (GA_ESPERAR_TABLAS / GA_ESPERAR_ADMIN): repite la consulta
// hasta que el esquema esté COMPLETO. Hace falta porque `server.js` empieza
// a escuchar ANTES de terminar `inicializarEsquema()`: que /api/health
// responda no significa que las migraciones hayan acabado.
//
// Modo cuentas (GA_CUENTAS): dice cuáles de los identificadores indicados
// siguen correspondiendo a una cuenta con la que se puede entrar HOY. Lo usa
// el instalador para no reescribir en CREDENCIALES.txt cuentas de
// demostración que el usuario ya borró. Solo lee; nunca crea ni modifica.
//
// Las credenciales llegan por variables de entorno (GA_DB_*), nunca por
// argumentos de línea de comandos: los argumentos son visibles en la lista
// de procesos del sistema.
//
// Salida: una única línea JSON por stdout. Siempre termina con código 0;
// quien decide es el instalador leyendo el campo `ok`.
// ============================================================
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
// mysql2 vive en server/node_modules (es dependencia del backend, no del
// frontend): resolvemos desde ahí en vez de asumir una instalación global.
const requerir = createRequire(join(aqui, '..', 'server', 'package.json'));

const responder = (obj) => {
    process.stdout.write(JSON.stringify(obj));
    process.exit(0);
};

let mysql;
try {
    mysql = requerir('mysql2/promise');
} catch {
    responder({ ok: false, codigo: 'FALTA_MYSQL2', error: 'mysql2 no está instalado en server/node_modules' });
}

const config = {
    host: process.env.GA_DB_HOST || 'localhost',
    port: Number(process.env.GA_DB_PORT) || 3306,
    user: process.env.GA_DB_USER || 'root',
    password: process.env.GA_DB_PASSWORD || '',
    connectTimeout: 8000
};
const base = process.env.GA_DB_NAME || '';
if (base) config.database = base;

const esperarTablas = (process.env.GA_ESPERAR_TABLAS || '')
    .split(',').map((t) => t.trim()).filter(Boolean);
const esperarAdmin = process.env.GA_ESPERAR_ADMIN === '1';
const segundosMax = Number(process.env.GA_ESPERAR_SEGUNDOS) || 60;

// Identificadores a comprobar, uno por línea. Pueden ser un `username`
// (admin, docente) o el nombre visible de un estudiante.
const cuentasPedidas = (process.env.GA_CUENTAS || '')
    .split('\n').map((c) => c.trim()).filter(Boolean);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Misma normalización que `normalizarNombre` de server/routes/auth.js: es la
// que decide si el nombre que teclea un niño encuentra su cuenta.
const normalizar = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

const existeColumna = async (conn, base, tabla, columna) => {
    const [[fila]] = await conn.query(
        `SELECT COUNT(*) AS n FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
        [base, tabla, columna]
    );
    return fila.n > 0;
};

// Devuelve los identificadores que HOY permiten iniciar sesión, aplicando el
// mismo criterio que el login: la cuenta existe, no está en la papelera
// (`eliminado_en`) y no está desactivada (`activo`). Las dos columnas se
// consultan solo si existen, para no romper en un esquema a medio migrar.
const comprobarCuentas = async (conn, base, identificadores) => {
    const vivas = [];
    const tieneEliminado = await existeColumna(conn, base, 'usuarios', 'eliminado_en');
    const tieneActivo = await existeColumna(conn, base, 'usuarios', 'activo');
    const tieneNombreNorm = await existeColumna(conn, base, 'usuarios', 'nombre_norm');

    const condiciones = ['(username = ?' + (tieneNombreNorm ? ' OR nombre_norm = ?)' : ')')];
    if (tieneEliminado) condiciones.push('eliminado_en IS NULL');
    if (tieneActivo) condiciones.push('activo = 1');
    const sql = `SELECT COUNT(*) AS n FROM usuarios WHERE ${condiciones.join(' AND ')}`;

    for (const id of identificadores) {
        const args = tieneNombreNorm ? [id, normalizar(id)] : [id];
        try {
            const [[fila]] = await conn.query(sql, args);
            if (fila.n > 0) vivas.push(id);
        } catch { /* un identificador problemático no invalida el resto */ }
    }
    return vivas;
};

try {
    const conn = await mysql.createConnection(config);
    const [[version]] = await conn.query('SELECT VERSION() AS v');
    const [[usuario]] = await conn.query('SELECT CURRENT_USER() AS u');
    // `datadir` y `puerto` los usa instalador/mysql.ps1 para saber si la
    // instancia que atiende un puerto es LA NUESTRA: comparar @@datadir con
    // el nuestro es una prueba que no depende de PID ni de procesos, y por
    // eso es inmune al desdoblamiento padre/hijo de mysqld en Windows.
    let datadir = '';
    let puerto = 0;
    try {
        const [[ajustes]] = await conn.query('SELECT @@datadir AS d, @@port AS p');
        datadir = ajustes.d || '';
        puerto = Number(ajustes.p) || 0;
    } catch { /* un usuario sin permiso para leerlas no invalida el resto */ }

    let tablas = null;
    let faltan = [];
    let adminListo = !esperarAdmin;

    if (base) {
        const limite = Date.now() + segundosMax * 1000;
        // Con la lista vacía esto es una única pasada: mismo código para
        // "cuéntame las tablas" y para "espera a que el esquema esté listo".
        for (;;) {
            const [[fila]] = await conn.query(
                'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?',
                [base]
            );
            tablas = fila.n;

            if (esperarTablas.length) {
                const [presentes] = await conn.query(
                    'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_name IN (?)',
                    [base, esperarTablas]
                );
                const encontradas = presentes.map((f) => String(f.t || f.TABLE_NAME));
                faltan = esperarTablas.filter((t) => !encontradas.includes(t));
            }
            if (esperarAdmin && !faltan.length) {
                const [[admin]] = await conn.query(
                    "SELECT COUNT(*) AS n FROM usuarios WHERE username = 'admin'"
                );
                adminListo = admin.n > 0;
            }

            if (!faltan.length && adminListo) break;
            if (Date.now() >= limite) break;
            await dormir(700);
        }
    }
    // Vigencia de cuentas: no altera `ok`, que sigue significando "el esquema
    // está completo". Es una respuesta informativa aparte.
    let cuentasVivas = [];
    if (base && cuentasPedidas.length) {
        cuentasVivas = await comprobarCuentas(conn, base, cuentasPedidas);
    }

    await conn.end();

    const mayor = Number(String(version.v).split('.')[0]) || 0;
    const completo = (faltan.length === 0) && adminListo;
    responder({
        ok: completo, version: version.v, mayor, usuario: usuario.u,
        tablas, faltan, adminListo, datadir, puerto, cuentasVivas
    });
} catch (err) {
    // err.message de mysql2 nunca incluye la contraseña (sí el usuario/host).
    // Algunos fallos de red llegan con message vacío: caemos al código.
    responder({ ok: false, codigo: err.code || '', error: err.message || err.code || 'No se pudo conectar.' });
}
