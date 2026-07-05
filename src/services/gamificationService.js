// Servicio central de gamificación (XP y Logros).
//
// La fuente de verdad del progreso es el backend (MySQL); localStorage se
// mantiene como caché local para que la UI responda al instante y siga
// funcionando si la red falla (se resincroniza en la próxima lectura).

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const KEY_XP = 'edu_xpTotal';
const KEY_LOGROS = 'edu_logrosObtenidos';
const KEY_ACTIVIDADES = 'edu_actividades';

// Cada nivel cuesta esta cantidad de XP. El nivel se deriva del XP total.
export const XP_POR_NIVEL = 1000;
// XP que otorga cada respuesta correcta en un quiz.
export const PUNTOS_POR_ACIERTO = 100;

// Catálogo único de logros. Los componentes mapean el icono por `id`.
export const CATALOGO_LOGROS = [
    { id: 'primer-quiz', titulo: 'Primer Quiz', desc: 'Completaste tu primer quiz' },
    { id: 'maestro-materia', titulo: 'Maestro de la Materia', desc: 'Lograste 100% en un quiz' },
    { id: 'racha-7', titulo: 'Racha de 7 días', desc: 'Estudiaste una semana seguida' },
    { id: 'estrella-aula', titulo: 'Estrella del aula', desc: 'Top 3 del ranking semanal' },
    { id: 'explorador', titulo: 'Explorador', desc: 'Revisa material de 5 materias' }
];

const logroPorId = (id) => CATALOGO_LOGROS.find((l) => l.id === id);

// ---- Lectura/escritura segura de localStorage ----
const leer = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
};

const escribir = (key, valor) => {
    try {
        localStorage.setItem(key, JSON.stringify(valor));
    } catch {
        // Ignorar errores de cuota/persistencia.
    }
};

// ---- XP y niveles ----
export const getXP = () => {
    const xp = Number(leer(KEY_XP, 0));
    return Number.isFinite(xp) ? xp : 0;
};

export const sumarXP = (cantidad) => {
    const suma = Number(cantidad) || 0;
    const total = Math.max(0, getXP() + suma);
    escribir(KEY_XP, total);
    return total;
};

export const getNivel = () => Math.floor(getXP() / XP_POR_NIVEL) + 1;

// Resumen del progreso de nivel, listo para pintar barras de XP.
export const getProgresoNivel = () => {
    const xp = getXP();
    const xpActual = xp % XP_POR_NIVEL;
    return {
        xp,
        nivel: Math.floor(xp / XP_POR_NIVEL) + 1,
        xpActual,
        xpNecesario: XP_POR_NIVEL,
        porcentaje: Math.round((xpActual / XP_POR_NIVEL) * 100)
    };
};

// ---- Logros ----
export const getLogros = () => {
    const logros = leer(KEY_LOGROS, []);
    return Array.isArray(logros) ? logros : [];
};

export const tieneLogro = (id) => getLogros().includes(id);

const otorgarLogro = (obtenidos, nuevos, id) => {
    if (!obtenidos.includes(id) && logroPorId(id)) {
        obtenidos.push(id);
        nuevos.push(logroPorId(id));
    }
};

// Contador de actividades por tipo (p. ej. cuántos quizzes ha resuelto).
const getActividades = (tipo) => {
    const data = leer(KEY_ACTIVIDADES, {});
    return Number(data?.[tipo]) || 0;
};

const registrarActividad = (tipo) => {
    const data = leer(KEY_ACTIVIDADES, {}) || {};
    const total = (Number(data[tipo]) || 0) + 1;
    escribir(KEY_ACTIVIDADES, { ...data, [tipo]: total });
    return total;
};

// Evalúa qué logros desbloquea una actividad completada, los persiste y
// devuelve SOLO los nuevos (para mostrarlos en pantalla).
// Es genérico: funciona para CUALQUIER tipo de reto, presente o futuro.
// actividad: { tipo: string, aciertos: number, total: number }
export const verificarLogros = (actividad = {}) => {
    const { tipo, aciertos, total } = actividad;
    if (!tipo) return [];

    const obtenidos = getLogros();
    const nuevos = [];

    const completadosDelTipo = registrarActividad(tipo);

    // Primer quiz completado (logro histórico del catálogo).
    if (tipo === 'quiz' && completadosDelTipo === 1) {
        otorgarLogro(obtenidos, nuevos, 'primer-quiz');
    }

    // Un resultado perfecto acredita 'maestro-materia' en cualquier mecánica.
    if (total > 0 && aciertos === total) {
        otorgarLogro(obtenidos, nuevos, 'maestro-materia');
    }

    if (nuevos.length) escribir(KEY_LOGROS, obtenidos);
    return nuevos;
};

// ---- Sincronización con el backend ----

// Identidad del estudiante en sesión (la fija el login al entrar como
// estudiante). Devuelve null si no hay sesión de estudiante activa.
export const getEstudianteId = () => {
    const id = Number(localStorage.getItem('edu_estudianteId'));
    return Number.isInteger(id) && id > 0 ? id : null;
};

// POST /api/progreso — guarda en la BD central el resultado de un reto.
// El reto se identifica por `retoId`, o por `materiaId` + `retoTitulo` si
// nació como quiz en el panel del docente (el backend lo crea si no existe).
// Devuelve la respuesta del servidor (incluye xp_total oficial) o null si
// la red falló; en ese caso la UI sigue con el valor local en caché.
export const guardarProgreso = async ({ estudianteId, retoId, materiaId, retoTitulo, xpRecompensa, puntosObtenidos }) => {
    try {
        const res = await fetch(`${API_URL}/api/progreso`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                estudiante_id: estudianteId,
                reto_id: retoId,
                materia_id: materiaId,
                reto_titulo: retoTitulo,
                xp_recompensa: xpRecompensa,
                puntos_obtenidos: puntosObtenidos
            })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        // El servidor es la fuente de verdad: alinea la caché local.
        if (Number.isFinite(data?.xp_total)) escribir(KEY_XP, data.xp_total);
        return data;
    } catch (err) {
        console.warn('No se pudo guardar el progreso en el servidor:', err.message);
        return null;
    }
};

// GET /api/progreso/:id — trae el avance completo desde la BD y actualiza
// la caché local de XP. Devuelve { estudiante, progreso } o null si falla.
export const obtenerProgreso = async (estudianteId) => {
    try {
        const res = await fetch(`${API_URL}/api/progreso/${estudianteId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (Number.isFinite(data?.estudiante?.xp_total)) {
            escribir(KEY_XP, data.estudiante.xp_total);
        }
        return data;
    } catch (err) {
        console.warn('No se pudo obtener el progreso del servidor:', err.message);
        return null;
    }
};

// Puente ÚNICO para reportar un reto completado, sea cual sea su mecánica
// (quiz, clasificador, lectura o cualquier juego futuro). Ningún componente
// necesita hablar con XP, logros o el backend por separado.
//
// Parámetros: { estudianteId, reto, tipo?, aciertos, total, puntosObtenidos? }
//   · reto: objeto de la BD ({ id, tipo, xp_recompensa, ... }) o al menos
//     { materiaId, titulo } para retos que aún no existen en la BD.
//   · puntosObtenidos: si se omite, se calculan como aciertos * PUNTOS_POR_ACIERTO.
// Devuelve { puntos, nuevosLogros, servidor } — `servidor` es la promesa de
// guardarProgreso (resuelve null si no hay sesión o la red falla).
export const completarReto = ({ estudianteId, reto, tipo, aciertos = 0, total = 0, puntosObtenidos }) => {
    const puntos = Number.isFinite(puntosObtenidos)
        ? puntosObtenidos
        : aciertos * PUNTOS_POR_ACIERTO;

    sumarXP(puntos);
    const nuevosLogros = verificarLogros({ tipo: tipo || reto?.tipo || 'quiz', aciertos, total });

    const retoIdentificable = reto && (reto.id || ((reto.materiaId || reto.materia_id) && reto.titulo));
    const servidor = estudianteId && retoIdentificable
        ? guardarProgreso({
            estudianteId,
            retoId: reto.id,
            materiaId: reto.materiaId ?? reto.materia_id,
            retoTitulo: reto.titulo,
            xpRecompensa: reto.xpRecompensa ?? reto.xp_recompensa,
            puntosObtenidos: puntos
        })
        : Promise.resolve(null);

    return { puntos, nuevosLogros, servidor };
};

// GET /api/ranking — Top N de estudiantes por XP acumulado (por defecto 10).
// Devuelve [] si la red falla, para que las vistas muestren su estado vacío.
export const obtenerRanking = async (limite = 10) => {
    try {
        const res = await fetch(`${API_URL}/api/ranking?limite=${limite}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn('No se pudo obtener el ranking del servidor:', err.message);
        return [];
    }
};

// Snapshot completo para los dashboards.
export const getResumen = () => ({
    ...getProgresoNivel(),
    logros: getLogros(),
    totalLogros: getLogros().length
});

const gamificationService = {
    XP_POR_NIVEL,
    PUNTOS_POR_ACIERTO,
    CATALOGO_LOGROS,
    getXP,
    sumarXP,
    getNivel,
    getProgresoNivel,
    getLogros,
    tieneLogro,
    verificarLogros,
    getEstudianteId,
    guardarProgreso,
    completarReto,
    obtenerRanking,
    obtenerProgreso,
    getResumen
};

export default gamificationService;
