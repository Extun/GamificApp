// ============================================================
// Pone contraseña al usuario root de la instancia MySQL portable.
//
// Se ejecuta UNA sola vez, en los segundos siguientes a
// `mysqld --initialize-insecure`, que deja root@localhost sin contraseña.
// A partir de aquí la instancia queda protegida.
//
// La contraseña llega por variable de entorno (GA_ROOT_NUEVA) y se aplica
// como PARÁMETRO de la sentencia, nunca concatenada al SQL ni pasada como
// argumento de línea de comandos: los argumentos de cualquier proceso son
// visibles para todo el sistema, su entorno no.
//
// Salida: una única línea JSON por stdout. Siempre termina con código 0;
// quien decide es el instalador leyendo el campo `ok`.
// ============================================================
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
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

const nueva = process.env.GA_ROOT_NUEVA || '';
if (nueva.length < 12) {
    responder({ ok: false, codigo: 'CLAVE_DEBIL', error: 'La contraseña de root recibida es demasiado corta.' });
}

let conn;
try {
    conn = await mysql.createConnection({
        host: process.env.GA_DB_HOST || '127.0.0.1',
        port: Number(process.env.GA_DB_PORT) || 3308,
        user: 'root',
        password: process.env.GA_DB_PASSWORD || '',
        connectTimeout: 10000
    });

    // --initialize-insecure crea exactamente esta cuenta y ninguna más.
    await conn.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [nueva]);

    // Comprobación real de que la contraseña quedó puesta: una conexión
    // NUEVA con la clave nueva. Sin esto solo sabríamos que el ALTER no dio
    // error, no que la instancia esté realmente protegida.
    const prueba = await mysql.createConnection({
        host: process.env.GA_DB_HOST || '127.0.0.1',
        port: Number(process.env.GA_DB_PORT) || 3308,
        user: 'root',
        password: nueva,
        connectTimeout: 10000
    });
    await prueba.query('SELECT 1');
    await prueba.end();

    await conn.end();
    responder({ ok: true });
} catch (err) {
    if (conn) { try { await conn.end(); } catch { /* ya cerrada */ } }
    // err.message de mysql2 nunca incluye la contraseña.
    responder({ ok: false, codigo: err.code || '', error: err.message || 'No se pudo proteger root.' });
}
