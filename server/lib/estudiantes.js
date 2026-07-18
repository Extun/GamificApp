// Utilidades compartidas sobre cuentas de estudiante.
import bcrypt from 'bcryptjs';
import pool from '../db.js';

// ---- Ámbito ("aula") de un docente — criterio ÚNICO (SPEC-014 F6) ----
// Un estudiante pertenece al docente si:
//   a) su curso está asignado al docente (docente_curso) — cubre altas por
//      importación Excel y alta manual, o
//   b) se registró con una invitación usada de ese docente (legacy) — así
//      nadie desaparece aunque cambien las asignaciones de cursos.
//
// `colEstudianteId` es la columna/expresión (confiable, nunca input del
// usuario) que contiene el estudiantes.id a evaluar. El fragmento consume
// DOS parámetros posicionales: [docenteId, docenteId].
export const sqlAulaDocente = (colEstudianteId) => `(
    EXISTS (SELECT 1 FROM estudiantes ea
            JOIN docente_curso dca ON dca.curso_id = ea.curso_id
            WHERE ea.id = ${colEstudianteId} AND dca.docente_id = ?)
    OR EXISTS (SELECT 1 FROM invitaciones_estudiante ia
               JOIN usuarios uia ON uia.id = ia.usuario_id
               WHERE uia.estudiante_id = ${colEstudianteId}
                 AND ia.docente_id = ? AND ia.estado = 'usado'))`;

// ¿Este estudiantes.id está en el aula del docente? (chequeo puntual)
export const esDelAulaDocente = async (docenteId, estudianteId) => {
    const [filas] = await pool.query(
        `SELECT 1 FROM estudiantes e
         WHERE e.id = ? AND ${sqlAulaDocente('e.id')}`,
        [estudianteId, docenteId, docenteId]
    );
    return filas.length > 0;
};

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
