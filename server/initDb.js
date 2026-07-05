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
    } finally {
        await conn.end();
    }
};

export default inicializarEsquema;
