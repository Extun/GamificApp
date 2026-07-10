// Motor de misiones (SPEC-007, Fase 5.5) — ÚNICO lugar con lógica de misiones.
//
// Toda misión se calcula desde datos REALES (progreso_estudiante / retos /
// estudiantes): cero datos ficticios. El progreso se recalcula en cada
// evaluación, así un estudiante con historial previo recupera sus misiones
// automáticamente (no se migran los logros viejos de localStorage).
//
// Se evalúa en dos momentos (ver SPEC-007 §2.3):
//   · al ESCRIBIR (POST /api/progreso), dentro de su transacción → toast inmediato.
//   · al LEER (GET /api/misiones), en su propia transacción → cubre misiones que
//     dependen de terceros (ranking) y garantiza consistencia del panel.
//
// Idempotente: reevaluar no vuelve a otorgar XP ni a notificar lo ya completado.

import pool from '../db.js';

// Cada nivel cuesta 1000 XP (mismo valor que el frontend, gamificationService).
const XP_POR_NIVEL = 1000;

// Registro de evaluadores: tipo_objetivo -> (metricas, filtro) => valor actual.
// Agregar un tipo nuevo = una entrada aquí (sin migrar la BD). Un tipo
// desconocido se ignora de forma segura (valor 0), nunca rompe el request.
const EVALUADORES = {
    actividades_completadas: (mtr, f) => {
        if (f?.tipo) return mtr.completadasPorTipo[f.tipo] || 0;
        if (f?.materia) return mtr.completadasPorMateria[f.materia] || 0;
        return mtr.totalCompletadas;
    },
    actividades_perfectas: (mtr) => mtr.perfectas,
    actividades_ia: (mtr) => mtr.completadasIA,
    mision_narrativa: (mtr) => mtr.completadasPorTipo.mision || 0,
    tipos_jugados: (mtr) => mtr.tiposDistintos,
    materias_distintas: (mtr) => mtr.materiasDistintas,
    xp_total: (mtr) => mtr.xp,
    nivel_alcanzado: (mtr) => mtr.nivel,
    racha_dias: (mtr) => mtr.rachaMaxima,
    // Posición en el ranking: valor = "estás dentro del Top N". Devolvemos la
    // meta cuando la posición real es <= meta (así progreso >= meta = cumplida),
    // y 0 en caso contrario (aún no entras al Top N).
    ranking_top: (mtr, _f, meta) => (mtr.posicionRanking > 0 && mtr.posicionRanking <= meta ? meta : 0),
    // Colección: cuántas insignias ya obtenidas en una categoría.
    insignias_categoria: (mtr, f) => (f?.categoria ? (mtr.insigniasPorCategoria[f.categoria] || 0) : 0)
};

// Tipos de objetivo válidos (para validar misiones creadas/editadas por el
// admin). Coincide exactamente con los evaluadores disponibles.
export const TIPOS_OBJETIVO = Object.keys(EVALUADORES);

// Reúne todas las métricas del estudiante en pocas consultas agregadas.
const reunirMetricas = async (conn, estudianteId) => {
    // Una fila por reto con progreso registrado (vivo). Deriva casi todo en JS.
    const [filas] = await conn.query(
        `SELECT r.tipo, r.origen, r.materia_id, p.porcentaje, p.completado
         FROM progreso_estudiante p
         JOIN retos    r ON r.id = p.reto_id AND r.eliminado_en IS NULL
         JOIN materias m ON m.id = r.materia_id AND m.eliminado_en IS NULL
         WHERE p.estudiante_id = ?`,
        [estudianteId]
    );

    const completadasPorTipo = {};
    const completadasPorMateria = {};
    const tiposSet = new Set();
    const materiasSet = new Set();
    let totalCompletadas = 0;
    let perfectas = 0;
    let completadasIA = 0;
    for (const f of filas) {
        if (!f.completado) continue;
        totalCompletadas += 1;
        completadasPorTipo[f.tipo] = (completadasPorTipo[f.tipo] || 0) + 1;
        completadasPorMateria[f.materia_id] = (completadasPorMateria[f.materia_id] || 0) + 1;
        tiposSet.add(f.tipo);
        materiasSet.add(f.materia_id);
        if (Number(f.porcentaje) === 100) perfectas += 1;
        if (f.origen === 'ia') completadasIA += 1;
    }

    const [[est]] = await conn.query(
        'SELECT xp_total, racha_actual, racha_maxima FROM estudiantes WHERE id = ?',
        [estudianteId]
    );
    const xp = Number(est?.xp_total) || 0;

    // Posición en el ranking = cuántos estudiantes tienen MÁS XP, + 1.
    const [[rk]] = await conn.query(
        'SELECT COUNT(*) AS mejores FROM estudiantes WHERE xp_total > ?',
        [xp]
    );

    // Insignias ya obtenidas por categoría (misiones completadas con insignia).
    const [insig] = await conn.query(
        `SELECT mi.categoria, COUNT(*) AS n
         FROM mision_estudiante me
         JOIN misiones mi ON mi.id = me.mision_id
         WHERE me.estudiante_id = ? AND me.completada = TRUE
           AND mi.recompensa_insignia IS NOT NULL
         GROUP BY mi.categoria`,
        [estudianteId]
    );
    const insigniasPorCategoria = {};
    for (const row of insig) insigniasPorCategoria[row.categoria] = Number(row.n);

    return {
        totalCompletadas,
        completadasPorTipo,
        completadasPorMateria,
        tiposDistintos: tiposSet.size,
        materiasDistintas: materiasSet.size,
        perfectas,
        completadasIA,
        xp,
        nivel: Math.floor(xp / XP_POR_NIVEL) + 1,
        rachaMaxima: Number(est?.racha_maxima) || 0,
        posicionRanking: Number(rk?.mejores || 0) + 1,
        insigniasPorCategoria
    };
};

// Evalúa TODAS las misiones activas para un estudiante, persiste el progreso,
// otorga XP de las recién completadas (una sola vez) y devuelve las nuevas.
// `conn` debe estar dentro de una transacción con la fila del estudiante
// disponible; el llamador la gestiona (POST /api/progreso ya la tiene con
// FOR UPDATE; GET abre la suya).
export const evaluarMisiones = async (conn, estudianteId) => {
    const metricas = await reunirMetricas(conn, estudianteId);

    // Catálogo activo + estado previo del estudiante, ordenado por dependencia
    // aproximada (orden dentro de categoría; los requisitos apuntan a menor orden).
    const [misiones] = await conn.query(
        `SELECT m.id, m.tipo_objetivo, m.objetivo_meta, m.objetivo_filtro,
                m.requiere_mision_id, m.recompensa_xp,
                me.completada AS ya_completada
         FROM misiones m
         LEFT JOIN mision_estudiante me
                ON me.mision_id = m.id AND me.estudiante_id = ?
         WHERE m.activa = TRUE
         ORDER BY m.categoria, m.orden`,
        [estudianteId]
    );

    const completadas = new Set(
        misiones.filter((mi) => mi.ya_completada).map((mi) => mi.id)
    );
    const nuevas = [];
    let xpBonus = 0;

    for (const mi of misiones) {
        const filtro = mi.objetivo_filtro
            ? (typeof mi.objetivo_filtro === 'string' ? JSON.parse(mi.objetivo_filtro) : mi.objetivo_filtro)
            : null;
        const evaluador = EVALUADORES[mi.tipo_objetivo];
        const valor = evaluador ? Number(evaluador(metricas, filtro, mi.objetivo_meta)) || 0 : 0;

        const desbloqueada = !mi.requiere_mision_id || completadas.has(mi.requiere_mision_id);
        const progreso = Math.min(valor, mi.objetivo_meta);
        const cumpleMeta = desbloqueada && valor >= mi.objetivo_meta;
        const yaCompletada = Boolean(mi.ya_completada);
        const completada = yaCompletada || cumpleMeta;

        await conn.query(
            `INSERT INTO mision_estudiante
                (estudiante_id, mision_id, progreso_actual, completada, completada_en)
             VALUES (?, ?, ?, ?, ${cumpleMeta && !yaCompletada ? 'NOW()' : 'NULL'})
             ON DUPLICATE KEY UPDATE
                progreso_actual = VALUES(progreso_actual),
                completada      = ${completada ? 'TRUE' : 'completada'},
                completada_en   = ${cumpleMeta && !yaCompletada ? 'IFNULL(completada_en, NOW())' : 'completada_en'}`,
            [estudianteId, mi.id, progreso, completada]
        );

        if (completada) completadas.add(mi.id);
        if (cumpleMeta && !yaCompletada) {
            nuevas.push(mi.id);
            xpBonus += Number(mi.recompensa_xp) || 0;
        }
    }

    // XP de recompensa de las misiones recién completadas (bonus, una sola vez).
    if (xpBonus > 0) {
        await conn.query(
            'UPDATE estudiantes SET xp_total = xp_total + ? WHERE id = ?',
            [xpBonus, estudianteId]
        );
    }

    if (!nuevas.length) return [];
    // Devuelve la info de las nuevas para el LogroToast del frontend.
    const [detalle] = await conn.query(
        `SELECT clave, titulo, categoria, tier, recompensa_xp, recompensa_insignia, recompensa_banner
         FROM misiones WHERE id IN (?)`,
        [nuevas]
    );
    return detalle;
};

// Actualiza la racha diaria del estudiante DENTRO de la transacción de progreso.
// Usa la fecha local institucional (Guayaquil, UTC-5) para no cortar rachas a
// medianoche UTC. La fila del estudiante debe estar bloqueada (FOR UPDATE).
export const actualizarRacha = async (conn, estudianteId) => {
    const [[est]] = await conn.query(
        `SELECT racha_actual, racha_maxima,
                ultima_fecha_actividad AS ultima,
                DATE(CONVERT_TZ(NOW(), '+00:00', '-05:00')) AS hoy
         FROM estudiantes WHERE id = ? FOR UPDATE`,
        [estudianteId]
    );
    if (!est) return;

    const hoy = est.hoy; // 'YYYY-MM-DD' (o Date, según driver)
    const hoyStr = hoy instanceof Date ? hoy.toISOString().slice(0, 10) : String(hoy);
    const ultimaStr = est.ultima
        ? (est.ultima instanceof Date ? est.ultima.toISOString().slice(0, 10) : String(est.ultima))
        : null;

    if (ultimaStr === hoyStr) return; // ya registró actividad hoy: nada cambia.

    let nuevaRacha = 1;
    if (ultimaStr) {
        const difDias = Math.round(
            (Date.parse(`${hoyStr}T00:00:00Z`) - Date.parse(`${ultimaStr}T00:00:00Z`)) / 86400000
        );
        if (difDias === 1) nuevaRacha = (Number(est.racha_actual) || 0) + 1;
    }
    const nuevaMaxima = Math.max(Number(est.racha_maxima) || 0, nuevaRacha);

    await conn.query(
        `UPDATE estudiantes
         SET racha_actual = ?, racha_maxima = ?, ultima_fecha_actividad = ?
         WHERE id = ?`,
        [nuevaRacha, nuevaMaxima, hoyStr, estudianteId]
    );
};

// Catálogo + progreso del estudiante para el panel (GET /api/misiones).
// Evalúa primero (en su propia transacción) y luego lee el estado consolidado.
export const obtenerMisionesEstudiante = async (estudianteId) => {
    const conn = await pool.getConnection();
    let nuevas = [];
    try {
        await conn.beginTransaction();
        nuevas = await evaluarMisiones(conn, estudianteId);
        await conn.commit();
    } catch (err) {
        await conn.rollback().catch(() => {});
        conn.release();
        throw err;
    }
    conn.release();

    const [filas] = await pool.query(
        `SELECT m.id, m.clave, m.categoria, m.tier, m.titulo, m.descripcion, m.icono,
                m.tipo_objetivo, m.objetivo_meta, m.recompensa_xp,
                m.recompensa_insignia, m.recompensa_banner, m.horizonte, m.orden,
                req.titulo AS requiere_titulo,
                COALESCE(me.progreso_actual, 0) AS progreso_actual,
                COALESCE(me.completada, FALSE)  AS completada,
                me.completada_en,
                me.completada AS _req_marca
         FROM misiones m
         LEFT JOIN misiones req ON req.id = m.requiere_mision_id
         LEFT JOIN mision_estudiante me
                ON me.mision_id = m.id AND me.estudiante_id = ?
         WHERE m.activa = TRUE
         ORDER BY m.categoria, m.orden`,
        [estudianteId]
    );

    // Estado por misión: bloqueada | disponible | completada. Una misión con
    // requisito está bloqueada mientras ese requisito no esté completado.
    const completadasReq = new Map();
    const [reqRows] = await pool.query(
        `SELECT m.id, m.requiere_mision_id,
                COALESCE(pre.completada, FALSE) AS requisito_ok
         FROM misiones m
         LEFT JOIN mision_estudiante pre
                ON pre.mision_id = m.requiere_mision_id AND pre.estudiante_id = ?
         WHERE m.activa = TRUE`,
        [estudianteId]
    );
    for (const r of reqRows) {
        completadasReq.set(r.id, !r.requiere_mision_id || Boolean(r.requisito_ok));
    }

    const misiones = filas.map((f) => {
        const desbloqueada = completadasReq.get(f.id);
        const estado = f.completada ? 'completada' : (desbloqueada ? 'disponible' : 'bloqueada');
        const porcentaje = f.objetivo_meta > 0
            ? Math.min(100, Math.round((f.progreso_actual / f.objetivo_meta) * 100))
            : 100;
        return {
            id: f.id,
            clave: f.clave,
            categoria: f.categoria,
            tier: f.tier,
            titulo: f.titulo,
            descripcion: f.descripcion,
            icono: f.icono,
            objetivo_meta: f.objetivo_meta,
            progreso_actual: f.progreso_actual,
            porcentaje,
            estado,
            horizonte: f.horizonte,
            recompensa: {
                xp: f.recompensa_xp,
                insignia: f.recompensa_insignia,
                banner: f.recompensa_banner
            },
            requiere_titulo: estado === 'bloqueada' ? f.requiere_titulo : null,
            completada_en: f.completada_en
        };
    });

    // Resumen para la cabecera del panel (datos reales del estudiante).
    const [[est]] = await pool.query(
        'SELECT xp_total, racha_actual, racha_maxima FROM estudiantes WHERE id = ?',
        [estudianteId]
    );
    const xp = Number(est?.xp_total) || 0;
    const resumen = {
        xp,
        nivel: Math.floor(xp / XP_POR_NIVEL) + 1,
        racha_actual: Number(est?.racha_actual) || 0,
        racha_maxima: Number(est?.racha_maxima) || 0,
        completadas: misiones.filter((mi) => mi.estado === 'completada').length,
        total: misiones.length
    };

    return { misiones, nuevas, resumen };
};

export default { evaluarMisiones, actualizarRacha, obtenerMisionesEstudiante };
