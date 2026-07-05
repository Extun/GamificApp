// Inicialización automática del esquema: al arrancar, el servidor crea las
// tablas y los datos semilla si aún no existen. Ejecuta el mismo script que
// se usaría a mano (database/produccion_defaultdb.sql), que es idempotente
// (CREATE TABLE IF NOT EXISTS + upserts): correrlo en cada arranque no daña
// datos existentes ni los duplica.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const aquí = dirname(fileURLToPath(import.meta.url));
const RUTA_ESQUEMA = join(aquí, '..', 'database', 'produccion_defaultdb.sql');

export const inicializarEsquema = async () => {
    const sql = await readFile(RUTA_ESQUEMA, 'utf8');

    // Conexión de un solo uso con multipleStatements: el pool normal de la app
    // NO lo habilita (defensa contra inyección), así que el script completo se
    // ejecuta aquí, aislado, y esta conexión se cierra al terminar. El resto de
    // opciones replica el pool de db.js, que ya conecta a la BD de producción.
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'gamificapp',
        multipleStatements: true
    });

    try {
        await conn.query(sql);
        console.log('✅ Esquema verificado/creado en la base de datos.');
        await asegurarAdmin(conn);
    } finally {
        await conn.end();
    }
};

// Garantiza que exista la cuenta admin SIN claves públicas en el repositorio:
// la contraseña viene de la variable de entorno ADMIN_PASSWORD.
//   · Con ADMIN_PASSWORD definida: crea el admin o actualiza su contraseña
//     (cambiarla en Render + redesplegar = rotar la clave).
//   · Sin la variable y sin admin en la BD: crea uno con clave temporal
//     'admin123' y lo avisa a gritos en los logs (mejor que dejarte fuera).
const asegurarAdmin = async (conn) => {
    const passwordEnv = process.env.ADMIN_PASSWORD;

    if (passwordEnv) {
        await conn.query(
            `INSERT INTO usuarios (username, password_hash, rol)
             VALUES ('admin', ?, 'admin')
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), rol = 'admin'`,
            [bcrypt.hashSync(String(passwordEnv), 10)]
        );
        console.log('✅ Cuenta admin sincronizada con ADMIN_PASSWORD.');
        return;
    }

    const [[admin]] = await conn.query(
        "SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1"
    );
    if (!admin) {
        await conn.query(
            `INSERT INTO usuarios (username, password_hash, rol)
             VALUES ('admin', ?, 'admin')`,
            [bcrypt.hashSync('admin123', 10)]
        );
        console.warn('⚠️  ADMIN_PASSWORD no está definida: se creó admin/admin123 TEMPORAL.');
        console.warn('   Define ADMIN_PASSWORD en las variables de entorno y redespliega.');
    }
};

export default inicializarEsquema;
