import { Router } from 'express';
import pool from '../db.js';
import { cursoDelEstudiante, sqlAlcanceCurso } from '../lib/alcanceCurso.js';
import { tiposJugables } from '../lib/juegos/estados.js';

const router = Router();

// SPEC-027 §2.4 — ¿Hay algo en esta materia PARA ESTE estudiante? Desde que el
// curso delimita el contenido (SPEC-026), el catálogo completo le mostraba
// "mundos" vacíos: seis materias de la institución y actividades solo en dos.
// Una materia se le lista si le alcanza una actividad jugable, le alcanza
// material, o ya tiene progreso en ella.
//
// La tercera condición es la que evita que una materia desaparezca CON su
// historial cuando el docente archiva su contenido: lo ya jugado nunca se
// esconde (mismo principio que SPEC-026 §2.3 punto 3).
//
// Devuelve { sql, params } o null si no hay con qué filtrar.
const filtroMateriasConContenido = async (estudianteId) => {
    const cursoId = await cursoDelEstudiante(estudianteId);
    // Sin curso en su ficha no se le acota nada (fail-open de SPEC-026 §2.3):
    // el alcance no se aplica, pero la materia sigue teniendo que tener algo.
    const alcanceRetos = cursoId === null ? '' : `AND ${sqlAlcanceCurso('r')}`;
    const alcanceMaterial = cursoId === null ? '' : `AND ${sqlAlcanceCurso('mat')}`;
    const paramsCurso = cursoId === null ? [] : [cursoId, cursoId];

    // Mismo criterio que GET /api/retos: un tipo deshabilitado no cuenta como
    // contenido, porque el estudiante no puede iniciar partidas de ese tipo.
    const jugables = await tiposJugables();
    const condRetos = jugables.length
        ? [`EXISTS (SELECT 1 FROM retos r
                    WHERE r.materia_id = materias.id AND r.estado = 'publicado'
                      AND r.eliminado_en IS NULL
                      AND r.tipo IN (${jugables.map(() => '?').join(', ')})
                      ${alcanceRetos})`]
        : [];
    const params = jugables.length ? [...jugables, ...paramsCurso] : [];

    const condiciones = [
        ...condRetos,
        `EXISTS (SELECT 1 FROM materiales mat
                 WHERE mat.materia_id = materias.id AND mat.is_private = FALSE
                   ${alcanceMaterial})`,
        `EXISTS (SELECT 1 FROM progreso_estudiante p
                 JOIN retos rp ON rp.id = p.reto_id AND rp.eliminado_en IS NULL
                 WHERE p.estudiante_id = ? AND rp.materia_id = materias.id)`
    ];
    params.push(...paramsCurso, estudianteId);
    return { sql: `AND (${condiciones.join(' OR ')})`, params };
};

// GET /api/materias — catálogo dinámico (SPEC-002). El admin recibe todas
// (gestiona también las desactivadas); docentes y estudiantes solo las
// activas. `color` e `icono` pintan la identidad visual en el frontend.
router.get('/', async (req, res, next) => {
    try {
        // Las materias en la Papelera (SPEC-003) no se listan para nadie;
        // solo aparecen en el módulo Papelera del admin.
        const soloActivas = req.user?.rol !== 'admin';
        // SPEC-027 §2.4: al estudiante, además, solo las que tienen algo suyo.
        const filtro = req.user?.rol === 'estudiante' && req.user.estudiante_id
            ? await filtroMateriasConContenido(req.user.estudiante_id)
            : { sql: '', params: [] };
        const [materias] = await pool.query(
            `SELECT id, nombre, color, icono, activa, orden, descripcion,
                    banner_data, competencias, nivel, protegida
             FROM materias
             WHERE eliminado_en IS NULL ${soloActivas ? 'AND activa = TRUE' : ''}
             ${filtro.sql}
             ORDER BY orden, id`,
            filtro.params
        );
        res.json(materias);
    } catch (err) {
        next(err);
    }
});

export default router;
