// Auditoría de acciones (SPEC-003). Registro "fire-and-forget": un fallo al
// auditar JAMÁS rompe la acción original (se loguea y la vida sigue), y si la
// tabla aún no existe (deploy a medias) simplemente no se registra.
//
// Convención de `accion`: slug corto en kebab-case ('creo-quiz',
// 'inicio-sesion', 'gano-xp'…). `descripcion` es la frase en español que ve
// el administrador. `detalle` guarda todo lo demás realmente registrado
// (sin datos inventados): el modal "Más detalles" lo muestra tal cual.
import pool from '../db.js';

export const registrarAuditoria = ({ usuario, rol, nombre, accion, descripcion, materia = null, detalle = null }) => {
    const usuarioId = usuario?.id ?? null;
    const quien = nombre || usuario?.nombre_completo || usuario?.username || 'desconocido';
    const queRol = rol || usuario?.rol || 'desconocido';
    pool.query(
        `INSERT INTO auditoria (usuario_id, rol, nombre, accion, descripcion, materia, detalle_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            usuarioId,
            String(queRol).slice(0, 15),
            String(quien).slice(0, 160),
            String(accion).slice(0, 60),
            String(descripcion).slice(0, 255),
            materia ? String(materia).slice(0, 60) : null,
            detalle ? JSON.stringify(detalle) : null
        ]
    ).catch((err) => {
        if (err.code !== 'ER_NO_SUCH_TABLE') {
            console.error('Auditoría no registrada:', err.message);
        }
    });
};

export default registrarAuditoria;
