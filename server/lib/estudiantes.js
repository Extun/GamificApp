// Utilidades compartidas sobre cuentas de estudiante.
import bcrypt from 'bcryptjs';
import pool from '../db.js';

// Vuelve el PIN de un estudiante a su valor por defecto (fecha de
// nacimiento DDMMAA). Lo usan el panel del docente y el del admin cuando
// un niño olvidó su PIN personalizado. Devuelve el PIN nuevo o null si la
// cuenta no existe o no tiene fecha de nacimiento registrada.
export const resetearPinADefault = async (usuarioId) => {
    const [[fila]] = await pool.query(
        `SELECT u.id, e.fecha_nacimiento FROM usuarios u
         JOIN estudiantes e ON e.id = u.estudiante_id
         WHERE u.id = ? AND u.rol = 'estudiante'`,
        [usuarioId]
    );
    if (!fila?.fecha_nacimiento) return null;

    const iso = fila.fecha_nacimiento instanceof Date
        ? fila.fecha_nacimiento.toISOString()
        : String(fila.fecha_nacimiento);
    const [anio, mes, dia] = iso.slice(0, 10).split('-');
    const pin = `${dia}${mes}${anio.slice(2)}`;

    await pool.query(
        'UPDATE usuarios SET pin_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?',
        [bcrypt.hashSync(pin, 10), usuarioId]
    );
    return pin;
};
