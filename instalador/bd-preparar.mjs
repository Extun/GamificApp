// ============================================================
// Prepara la base de datos local de GamificApp. Idempotente: se puede
// ejecutar tantas veces como haga falta sin perder datos.
//
// Qué hace, en orden:
//   1. CREATE DATABASE IF NOT EXISTS <base>  (utf8mb4 / utf8mb4_spanish_ci)
//   2. (opcional) crea el usuario de aplicación y le concede permisos SOLO
//      sobre esa base; si el usuario que ejecuta no tiene privilegios para
//      crear cuentas, lo informa y el instalador reutiliza las credenciales
//      que ya le dio el usuario.
//   3. Carga `database/produccion_defaultdb.sql` — el MISMO script que usa
//      producción — sobre la base.
//
// Por qué el paso 3 es imprescindible: `server/initDb.js` ejecuta
// `migrarColumnasMaterias` (un ALTER TABLE materias) ANTES de crear las
// tablas, así que sobre una base COMPLETAMENTE VACÍA falla con
// "Table 'materias' doesn't exist". initDb NO puede inicializar una base
// desde cero; asume que el esquema base ya existe (igual que en producción,
// donde el .sql se cargó a mano la primera vez).
// Verificado en initDb.js:36-37 y documentado en docs/DEV-ENTORNO-LOCAL.md §8-bis.
//
// Credenciales por variables de entorno (GA_*), nunca por argumentos.
// Salida: una línea JSON por stdout; siempre termina con código 0.
// ============================================================
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const requerir = createRequire(join(raiz, 'server', 'package.json'));

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

const base = process.env.GA_BASE || '';
// El nombre de la base se interpola como identificador: solo se acepta un
// nombre simple para que no haya forma de inyectar SQL por esta vía.
if (!/^[A-Za-z0-9_]+$/.test(base)) {
    responder({ ok: false, codigo: 'BASE_INVALIDA', error: `Nombre de base no válido: "${base}"` });
}

const admin = {
    host: process.env.GA_DB_HOST || 'localhost',
    port: Number(process.env.GA_DB_PORT) || 3306,
    user: process.env.GA_DB_USER || 'root',
    password: process.env.GA_DB_PASSWORD || '',
    connectTimeout: 10000
};
const usuarioApp = process.env.GA_APP_USER || '';
const claveApp = process.env.GA_APP_PASSWORD || '';

const resultado = {
    ok: false,
    baseCreada: false,
    tablasAntes: 0,
    tablasDespues: 0,
    esquemaCargado: false,
    usuarioApp: null,
    usuarioAppCreado: false,
    motivoUsuario: ''
};

let conn;
try {
    conn = await mysql.createConnection(admin);

    // ---- 1. La base ----
    const [[existe]] = await conn.query(
        'SELECT COUNT(*) AS n FROM information_schema.schemata WHERE schema_name = ?', [base]
    );
    if (!existe.n) {
        await conn.query(
            `CREATE DATABASE \`${base}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci`
        );
        resultado.baseCreada = true;
    }

    // ---- 2. Usuario de aplicación (opcional) ----
    if (usuarioApp && claveApp) {
        resultado.usuarioApp = usuarioApp;
        try {
            // Host '%' a propósito: si MySQL corre en un contenedor, las
            // conexiones del equipo llegan desde su red interna y 'localhost'
            // nunca coincidiría. La instancia solo escucha en local.
            const cuenta = `${mysql.escape(usuarioApp)}@'%'`;
            await conn.query(`CREATE USER IF NOT EXISTS ${cuenta} IDENTIFIED BY ${mysql.escape(claveApp)}`);
            // ALTER porque CREATE USER IF NOT EXISTS no cambia la clave de una
            // cuenta que ya existiera de una instalación anterior.
            await conn.query(`ALTER USER ${cuenta} IDENTIFIED BY ${mysql.escape(claveApp)}`);
            await conn.query(`GRANT ALL PRIVILEGES ON \`${base}\`.* TO ${cuenta}`);
            await conn.query('FLUSH PRIVILEGES');

            // No basta con crearlo: comprobamos que de verdad puede entrar,
            // porque esas credenciales son las que acabarán en server/.env.
            const prueba = await mysql.createConnection({
                host: admin.host, port: admin.port, user: usuarioApp,
                password: claveApp, database: base, connectTimeout: 8000
            });
            await prueba.query('SELECT 1');
            await prueba.end();
            resultado.usuarioAppCreado = true;
        } catch (err) {
            resultado.usuarioApp = null;
            resultado.motivoUsuario = err.message;
        }
    }

    await conn.end();
    conn = null;

    // ---- 3. Esquema base ----
    const sql = await readFile(join(raiz, 'database', 'produccion_defaultdb.sql'), 'utf8');
    const carga = await mysql.createConnection({
        ...admin, database: base, multipleStatements: true
    });
    const [[antes]] = await carga.query(
        'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?', [base]
    );
    resultado.tablasAntes = antes.n;

    // El script es idempotente (CREATE TABLE IF NOT EXISTS + INSERT IGNORE):
    // cargarlo de nuevo sobre una base con datos no los pisa. Es exactamente
    // lo que hace initDb.js en cada arranque.
    await carga.query(sql);
    resultado.esquemaCargado = true;

    const [[despues]] = await carga.query(
        'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?', [base]
    );
    resultado.tablasDespues = despues.n;

    const [[materias]] = await carga.query(
        "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'materias'",
        [base]
    );
    await carga.end();

    if (!materias.n) {
        responder({ ...resultado, ok: false, codigo: 'SIN_ESQUEMA', error: 'La tabla materias no existe tras cargar el esquema base.' });
    }

    resultado.ok = true;
    responder(resultado);
} catch (err) {
    if (conn) { try { await conn.end(); } catch { /* ya cerrada */ } }
    responder({ ...resultado, ok: false, codigo: err.code || '', error: err.message });
}
