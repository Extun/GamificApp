// Crea o actualiza un usuario con contraseña hasheada (bcrypt).
// Uso:  node scripts/crearUsuario.js <username> <password> <rol> [estudiante_id]
//   p. ej.  node scripts/crearUsuario.js profe1 MiClaveSegura docente
//           node scripts/crearUsuario.js ana2doA Clave123 estudiante 1
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../db.js';

const [username, password, rol = 'estudiante', estudianteId] = process.argv.slice(2);

if (!username || !password || !['docente', 'estudiante'].includes(rol)) {
    console.error('Uso: node scripts/crearUsuario.js <username> <password> <docente|estudiante> [estudiante_id]');
    process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);

const [resultado] = await pool.query(
    `INSERT INTO usuarios (username, password_hash, rol, estudiante_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash),
                             rol = VALUES(rol),
                             estudiante_id = VALUES(estudiante_id)`,
    [username, hash, rol, estudianteId ? Number(estudianteId) : null]
);

console.log(`✅ Usuario '${username}' (${rol}) guardado. id afectado: ${resultado.insertId || 'actualizado'}`);
process.exit(0);
