// Contenido inicial de misiones (SPEC-007, Fase 5.5) — FUENTE ÚNICA DE VERDAD.
//
// initDb.js aplica este arreglo de forma idempotente (INSERT ... ON DUPLICATE
// KEY UPDATE por `clave`) en cada arranque, también contra la BD de producción.
// Ajustar textos/umbrales/recompensas aquí y redesplegar basta; NO hay misiones
// hardcodeadas en el frontend. Agregar cientos más = agregar filas aquí (o desde
// el módulo admin de la Fase 2), sin tocar el motor ni migrar la BD, siempre que
// el `tipo_objetivo` exista en el registro de evaluadores (server/lib/misiones.js).
//
// Campos:
//   clave        slug estable y único (no cambiar una vez desplegado).
//   categoria    aprendizaje|competencia|constancia|colaboracion|precision|
//                exploracion|especiales|ia  (identidad visual en el frontend).
//   tier         bronce|plata|oro|platino|diamante  (dificultad).
//   objetivo     { tipo, meta, filtro? }  tipo = clave del evaluador.
//   requiere     clave de la misión previa de la cadena (null = disponible ya).
//   xp/insignia/banner  recompensas. Toda misión da MÁS que XP (insignia siempre;
//                banner en tiers altos y en Especiales). Desbloquea a su sucesora.
//   horizonte    corto|mediano|largo  (para "tiempo estimado" en la UI).

// Helper para no repetir: la insignia por defecto es la propia clave.
const m = (clave, categoria, tier, titulo, descripcion, tipo, meta, opts = {}) => ({
    clave,
    categoria,
    tier,
    titulo,
    descripcion,
    tipo_objetivo: tipo,
    objetivo_meta: meta,
    objetivo_filtro: opts.filtro || null,
    requiere: opts.requiere || null,
    recompensa_xp: opts.xp || 0,
    recompensa_insignia: opts.insignia || clave,
    recompensa_banner: opts.banner || null,
    horizonte: opts.horizonte || 'corto',
    icono: opts.icono || null
});

const MISIONES = [
    // 📚 APRENDIZAJE — cantidad de actividades completadas (cualquier tipo).
    m('aprendizaje-1', 'aprendizaje', 'bronce', 'Primeros pasos', 'Completa tu primera actividad', 'actividades_completadas', 1, { xp: 50, horizonte: 'corto' }),
    m('aprendizaje-2', 'aprendizaje', 'bronce', 'Aprendiz curioso', 'Completa 5 actividades', 'actividades_completadas', 5, { xp: 100, horizonte: 'corto', requiere: 'aprendizaje-1' }),
    m('aprendizaje-3', 'aprendizaje', 'plata', 'Estudiante dedicado', 'Completa 25 actividades', 'actividades_completadas', 25, { xp: 250, horizonte: 'mediano', requiere: 'aprendizaje-2' }),
    m('aprendizaje-4', 'aprendizaje', 'oro', 'Maestro del estudio', 'Completa 100 actividades', 'actividades_completadas', 100, { xp: 600, horizonte: 'largo', requiere: 'aprendizaje-3' }),
    m('aprendizaje-5', 'aprendizaje', 'platino', 'Erudito', 'Completa 250 actividades', 'actividades_completadas', 250, { xp: 1200, horizonte: 'largo', requiere: 'aprendizaje-4', banner: 'aprendizaje-5' }),
    m('aprendizaje-6', 'aprendizaje', 'diamante', 'Leyenda del aula', 'Completa 500 actividades', 'actividades_completadas', 500, { xp: 2500, horizonte: 'largo', requiere: 'aprendizaje-5', banner: 'aprendizaje-6' }),
    // Sub-cadena de quiz (mismo evaluador, con filtro por tipo).
    m('aprendizaje-quiz-1', 'aprendizaje', 'plata', 'Experto en quiz', 'Completa 10 quiz', 'actividades_completadas', 10, { filtro: { tipo: 'quiz' }, xp: 250, horizonte: 'mediano' }),
    m('aprendizaje-quiz-2', 'aprendizaje', 'oro', 'Rey del quiz', 'Completa 30 quiz', 'actividades_completadas', 30, { filtro: { tipo: 'quiz' }, xp: 500, horizonte: 'largo', requiere: 'aprendizaje-quiz-1' }),

    // 🏆 COMPETENCIA — nivel alcanzado y posición en el ranking.
    m('competencia-1', 'competencia', 'bronce', 'En ascenso', 'Sube al nivel 2', 'nivel_alcanzado', 2, { xp: 80, horizonte: 'corto' }),
    m('competencia-2', 'competencia', 'plata', 'Nivel 5', 'Alcanza el nivel 5', 'nivel_alcanzado', 5, { xp: 300, horizonte: 'mediano', requiere: 'competencia-1' }),
    m('competencia-3', 'competencia', 'oro', 'Nivel 10', 'Alcanza el nivel 10', 'nivel_alcanzado', 10, { xp: 700, horizonte: 'largo', requiere: 'competencia-2' }),
    m('competencia-top10', 'competencia', 'plata', 'Entre los mejores', 'Entra al Top 10 del ranking', 'ranking_top', 10, { xp: 400, horizonte: 'mediano', requiere: 'competencia-1' }),
    m('competencia-4', 'competencia', 'platino', 'Podio', 'Llega al Top 3 del ranking', 'ranking_top', 3, { xp: 1000, horizonte: 'largo', requiere: 'competencia-top10', banner: 'competencia-4' }),
    m('competencia-5', 'competencia', 'diamante', 'Campeón del aula', 'Sé el primer lugar del ranking', 'ranking_top', 1, { xp: 2000, horizonte: 'largo', requiere: 'competencia-4', banner: 'competencia-5' }),

    // 🔥 CONSTANCIA — racha de días seguidos con actividad.
    m('constancia-1', 'constancia', 'bronce', 'Buen ritmo', 'Mantén una racha de 3 días', 'racha_dias', 3, { xp: 150, horizonte: 'corto' }),
    m('constancia-2', 'constancia', 'plata', 'Semana completa', 'Mantén una racha de 7 días', 'racha_dias', 7, { xp: 400, horizonte: 'mediano', requiere: 'constancia-1' }),
    m('constancia-3', 'constancia', 'oro', 'Imparable', 'Mantén una racha de 14 días', 'racha_dias', 14, { xp: 800, horizonte: 'largo', requiere: 'constancia-2' }),
    m('constancia-4', 'constancia', 'platino', 'Mes perfecto', 'Mantén una racha de 30 días', 'racha_dias', 30, { xp: 1500, horizonte: 'largo', requiere: 'constancia-3', banner: 'constancia-4' }),
    m('constancia-5', 'constancia', 'diamante', 'Constancia de acero', 'Mantén una racha de 60 días', 'racha_dias', 60, { xp: 3000, horizonte: 'largo', requiere: 'constancia-4', banner: 'constancia-5' }),

    // 🤝 COLABORACIÓN — participar en varias materias distintas.
    m('colaboracion-1', 'colaboracion', 'bronce', 'Curioso', 'Juega en 2 materias distintas', 'materias_distintas', 2, { xp: 120, horizonte: 'corto' }),
    m('colaboracion-2', 'colaboracion', 'plata', 'Todoterreno', 'Juega en 3 materias distintas', 'materias_distintas', 3, { xp: 250, horizonte: 'mediano', requiere: 'colaboracion-1' }),
    m('colaboracion-3', 'colaboracion', 'oro', 'Polivalente', 'Juega en 4 materias distintas', 'materias_distintas', 4, { xp: 450, horizonte: 'largo', requiere: 'colaboracion-2' }),
    m('colaboracion-4', 'colaboracion', 'platino', 'Sin fronteras', 'Juega en 5 materias distintas', 'materias_distintas', 5, { xp: 800, horizonte: 'largo', requiere: 'colaboracion-3', banner: 'colaboracion-4' }),
    m('colaboracion-5', 'colaboracion', 'diamante', 'Aventurero total', 'Juega en 6 materias distintas', 'materias_distintas', 6, { xp: 1400, horizonte: 'largo', requiere: 'colaboracion-4', banner: 'colaboracion-5' }),

    // 🎯 PRECISIÓN — actividades resueltas al 100% (perfectas).
    m('precision-1', 'precision', 'bronce', 'Puntería', 'Consigue tu primera actividad perfecta', 'actividades_perfectas', 1, { xp: 120, horizonte: 'corto' }),
    m('precision-2', 'precision', 'plata', 'Ojo de halcón', 'Consigue 10 actividades perfectas', 'actividades_perfectas', 10, { xp: 300, horizonte: 'mediano', requiere: 'precision-1' }),
    m('precision-3', 'precision', 'oro', 'Certero', 'Consigue 25 actividades perfectas', 'actividades_perfectas', 25, { xp: 600, horizonte: 'largo', requiere: 'precision-2' }),
    m('precision-4', 'precision', 'platino', 'Impecable', 'Consigue 50 actividades perfectas', 'actividades_perfectas', 50, { xp: 1200, horizonte: 'largo', requiere: 'precision-3', banner: 'precision-4' }),
    m('precision-5', 'precision', 'diamante', 'Perfección absoluta', 'Consigue 100 actividades perfectas', 'actividades_perfectas', 100, { xp: 2400, horizonte: 'largo', requiere: 'precision-4', banner: 'precision-5' }),

    // 🚀 EXPLORACIÓN — variedad de juegos y misiones narrativas.
    m('exploracion-tipos-1', 'exploracion', 'bronce', 'Explorador', 'Juega 3 tipos de juego distintos', 'tipos_jugados', 3, { xp: 150, horizonte: 'corto' }),
    m('exploracion-tipos-2', 'exploracion', 'oro', 'Todo un jugador', 'Juega todos los tipos de juego', 'tipos_jugados', 6, { xp: 500, horizonte: 'largo', requiere: 'exploracion-tipos-1' }),
    m('exploracion-narrativa-1', 'exploracion', 'bronce', 'Aventura empieza', 'Completa una misión narrativa', 'mision_narrativa', 1, { xp: 150, horizonte: 'corto' }),
    m('exploracion-narrativa-2', 'exploracion', 'oro', 'Gran narrador', 'Completa 5 misiones narrativas', 'mision_narrativa', 5, { xp: 600, horizonte: 'largo', requiere: 'exploracion-narrativa-1' }),

    // ⭐ ESPECIALES — hitos de XP y colección de medallas.
    m('especiales-xp-1', 'especiales', 'bronce', 'Primeros 500', 'Acumula 500 XP', 'xp_total', 500, { xp: 100, horizonte: 'corto' }),
    m('especiales-xp-2', 'especiales', 'plata', 'Dos mil', 'Acumula 2.000 XP', 'xp_total', 2000, { xp: 300, horizonte: 'mediano', requiere: 'especiales-xp-1' }),
    m('especiales-xp-3', 'especiales', 'oro', 'Cinco mil', 'Acumula 5.000 XP', 'xp_total', 5000, { xp: 700, horizonte: 'largo', requiere: 'especiales-xp-2' }),
    m('especiales-xp-4', 'especiales', 'platino', 'Diez mil', 'Acumula 10.000 XP', 'xp_total', 10000, { xp: 1500, horizonte: 'largo', requiere: 'especiales-xp-3', banner: 'especiales-xp-4' }),
    m('especiales-xp-5', 'especiales', 'diamante', 'Veinte mil', 'Acumula 20.000 XP', 'xp_total', 20000, { xp: 3000, horizonte: 'largo', requiere: 'especiales-xp-4', banner: 'especiales-xp-5' }),
    m('especiales-col-precision', 'especiales', 'oro', 'Coleccionista certero', 'Consigue todas las medallas de Precisión', 'insignias_categoria', 5, { filtro: { categoria: 'precision' }, xp: 1000, horizonte: 'largo', banner: 'especiales-col-precision' }),
    m('especiales-col-constancia', 'especiales', 'oro', 'Coleccionista constante', 'Consigue todas las medallas de Constancia', 'insignias_categoria', 5, { filtro: { categoria: 'constancia' }, xp: 1000, horizonte: 'largo', banner: 'especiales-col-constancia' }),
    m('especiales-col-aprendizaje', 'especiales', 'diamante', 'Coleccionista sabio', 'Consigue todas las medallas de Aprendizaje', 'insignias_categoria', 8, { filtro: { categoria: 'aprendizaje' }, xp: 1800, horizonte: 'largo', banner: 'especiales-col-aprendizaje' }),

    // 🤖 IA — actividades creadas con IA (retos.origen = 'ia').
    m('ia-1', 'ia', 'bronce', 'Amigo de la IA', 'Juega una actividad creada con IA', 'actividades_ia', 1, { xp: 120, horizonte: 'corto' }),
    m('ia-2', 'ia', 'plata', 'Curioso digital', 'Juega 5 actividades creadas con IA', 'actividades_ia', 5, { xp: 300, horizonte: 'mediano', requiere: 'ia-1' }),
    m('ia-3', 'ia', 'oro', 'Explorador de IA', 'Juega 15 actividades creadas con IA', 'actividades_ia', 15, { xp: 600, horizonte: 'largo', requiere: 'ia-2' }),
    m('ia-4', 'ia', 'platino', 'Maestro de la IA', 'Juega 30 actividades creadas con IA', 'actividades_ia', 30, { xp: 1200, horizonte: 'largo', requiere: 'ia-3', banner: 'ia-4' }),
    m('ia-5', 'ia', 'diamante', 'Aliado de la IA', 'Juega 50 actividades creadas con IA', 'actividades_ia', 50, { xp: 2500, horizonte: 'largo', requiere: 'ia-4', banner: 'ia-5' })
];

// `orden` se deriva de la posición dentro de su categoría (pasos de 10, deja
// hueco para intercalar misiones futuras sin renumerar todo).
const ordenPorCategoria = {};
for (const mis of MISIONES) {
    ordenPorCategoria[mis.categoria] = (ordenPorCategoria[mis.categoria] || 0) + 10;
    mis.orden = ordenPorCategoria[mis.categoria];
}

export default MISIONES;
