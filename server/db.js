// Conexión central a MySQL. Toda la app usa este pool: las credenciales
// viven en server/.env (nunca en el código ni en el repositorio).
import 'dotenv/config';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gamificapp',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4_spanish_ci'
});

// Comprobación al arrancar: avisa en consola si la BD no está disponible,
// sin tumbar el servidor (útil durante el desarrollo).
export const verificarConexion = async () => {
    try {
        const conn = await pool.getConnection();
        conn.release();
        console.log(`✅ MySQL conectado (${process.env.DB_NAME || 'gamificapp'})`);
        return true;
    } catch (err) {
        console.warn(`⚠️  MySQL no disponible: ${err.message}`);
        console.warn('   Ejecuta database/gamificapp.sql y revisa server/.env');
        return false;
    }
};

export default pool;
