// SPEC-026 — Frontera de curso: qué contenido publicado alcanza a un estudiante.
//
// Criterio ÚNICO, al estilo de `sqlAulaDocente()` (SPEC-014 F6): la frontera se
// define AQUÍ y la consumen `GET /api/retos`, `POST /api/progreso` y
// `GET /api/materias/:id/material`, para que no exista nada listable que no sea
// jugable ni viceversa.
import pool from '../db.js';

// Curso (cursos.id) del estudiante, o null si su ficha no lo tiene registrado.
// `conn` permite consultarlo DENTRO de la transacción de POST /api/progreso.
export const cursoDelEstudiante = async (estudianteId, conn = pool) => {
    if (!Number.isInteger(estudianteId) || estudianteId <= 0) return null;
    const [[fila]] = await conn.query(
        'SELECT curso_id FROM estudiantes WHERE id = ?',
        [estudianteId]
    );
    return fila?.curso_id ?? null;
};

// Fragmento SQL: ¿este contenido alcanza al estudiante?
//
//   1. Va dirigido explícitamente a su curso, o
//   2. no va dirigido a ninguno (curso_id NULL, el valor por defecto del
//      editor) y su AUTOR da clase en el curso del estudiante — «todos los
//      cursos» significa «todos MIS cursos», y el selector del editor solo
//      lista los cursos del propio docente, o
//   3. no va dirigido a ninguno y su autor no tiene NINGÚN curso asignado:
//      contenido institucional (el admin, un autor legacy con docente_id NULL,
//      o un docente al que aún no le asignaron curso).
//
// El punto 3 es un fail-open deliberado (SPEC-026 §2.3): el filtro solo puede
// QUITAR contenido de quien tiene un curso distinto, nunca vaciar un panel que
// hoy tiene cosas. SPEC-009 §5 ya avisó de que en producción hay docentes que
// pueden quedarse sin cursos asignados.
//
// `tabla` es la tabla o alias (confiable, nunca input del usuario) con las
// columnas `curso_id` y `docente_id`. Consume DOS parámetros posicionales:
// [cursoId, cursoId].
export const sqlAlcanceCurso = (tabla) => `(
    ${tabla}.curso_id = ?
    OR (${tabla}.curso_id IS NULL AND (
        EXISTS (SELECT 1 FROM docente_curso dcAlcance
                WHERE dcAlcance.docente_id = ${tabla}.docente_id
                  AND dcAlcance.curso_id = ?)
        OR NOT EXISTS (SELECT 1 FROM docente_curso dcAutor
                       WHERE dcAutor.docente_id = ${tabla}.docente_id)
    ))
)`;

// ¿Puede este usuario dirigir contenido a este curso? El docente, solo a los
// cursos que el admin le asignó (docente_curso); el admin, a cualquier curso
// vivo. Se comprueba porque `curso_id` ya no es un metadato decorativo: decide
// acceso, así que aceptarlo sin validar dejaría a un docente publicar dentro
// del aula de otro (SPEC-026 §2.4).
export const puedeDirigirACurso = async (user, cursoId) => {
    if (!Number.isInteger(cursoId) || cursoId <= 0) return false;
    const [filas] = user?.rol === 'admin'
        ? await pool.query(
            'SELECT 1 FROM cursos WHERE id = ? AND eliminado_en IS NULL',
            [cursoId]
        )
        : await pool.query(
            `SELECT 1 FROM docente_curso dc
             JOIN cursos c ON c.id = dc.curso_id AND c.eliminado_en IS NULL
             WHERE dc.docente_id = ? AND dc.curso_id = ?`,
            [user.id, cursoId]
        );
    return filas.length > 0;
};

export default { cursoDelEstudiante, sqlAlcanceCurso, puedeDirigirACurso };
