// Servicio central de gamificación (XP).
//
// La fuente de verdad del progreso es el backend (MySQL); localStorage se
// mantiene como caché local para que la UI responda al instante y siga
// funcionando si la red falla (se resincroniza en la próxima lectura).
// SPEC-011 Fase 2: el sistema viejo de logros de localStorage se retiró —
// las recompensas reales son las Misiones del servidor (SPEC-007), que
// llegan en `nuevas_misiones` al guardar el progreso.

import { authFetch } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const KEY_XP = 'edu_xpTotal';

// Cada nivel cuesta esta cantidad de XP. El nivel se deriva del XP total.
export const XP_POR_NIVEL = 1000;
// XP que otorga cada respuesta correcta en un quiz.
export const PUNTOS_POR_ACIERTO = 100;

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
export const guardarProgreso = async ({ estudianteId, retoId, materiaId, retoTitulo, xpRecompensa, puntosObtenidos, aciertos, total }) => {
    try {
        const res = await authFetch(`${API_URL}/api/progreso`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                estudiante_id: estudianteId,
                reto_id: retoId,
                materia_id: materiaId,
                reto_titulo: retoTitulo,
                xp_recompensa: xpRecompensa,
                puntos_obtenidos: puntosObtenidos,
                // SPEC-015: datos objetivos del intento — el servidor calcula
                // la calificación /100 y el XP proporcional con ellos.
                aciertos,
                total
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
        const res = await authFetch(`${API_URL}/api/progreso/${estudianteId}`);
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
// necesita hablar con XP o el backend por separado; las misiones desbloqueadas
// llegan en `nuevas_misiones` dentro de la respuesta del servidor.
//
// Parámetros: { estudianteId, reto, aciertos, total, puntosObtenidos? }
//   · reto: objeto de la BD ({ id, tipo, xp_recompensa, ... }) o al menos
//     { materiaId, titulo } para retos que aún no existen en la BD.
//   · puntosObtenidos: si se omite, se calculan como aciertos * PUNTOS_POR_ACIERTO.
//   · total (SPEC-015): ítems realmente evaluados en el intento. Si llega,
//     el servidor calcula la calificación /100 y el XP proporcional al
//     desempeño con aciertos/total (fuente de verdad); sin él, el flujo
//     histórico (XP = min(puntos, recompensa)) sigue intacto.
// Devuelve { puntos, servidor } — `servidor` es la promesa de guardarProgreso
// (resuelve null si no hay sesión o la red falla).
export const completarReto = ({ estudianteId, reto, aciertos = 0, total, puntosObtenidos }) => {
    const puntos = Number.isFinite(puntosObtenidos)
        ? puntosObtenidos
        : aciertos * PUNTOS_POR_ACIERTO;

    sumarXP(puntos);

    const retoIdentificable = reto && (reto.id || ((reto.materiaId || reto.materia_id) && reto.titulo));
    const servidor = estudianteId && retoIdentificable
        ? guardarProgreso({
            estudianteId,
            retoId: reto.id,
            materiaId: reto.materiaId ?? reto.materia_id,
            retoTitulo: reto.titulo,
            xpRecompensa: reto.xpRecompensa ?? reto.xp_recompensa,
            puntosObtenidos: puntos,
            aciertos,
            total
        })
        : Promise.resolve(null);

    return { puntos, servidor };
};

// GET /api/ranking — Top N de estudiantes por XP acumulado (por defecto 10).
// Devuelve [] si la red falla, para que las vistas muestren su estado vacío.
export const obtenerRanking = async (limite = 10) => {
    try {
        const res = await authFetch(`${API_URL}/api/ranking?limite=${limite}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn('No se pudo obtener el ranking del servidor:', err.message);
        return [];
    }
};

// Snapshot de XP/nivel para los dashboards (caché alineada con el servidor).
export const getResumen = () => getProgresoNivel();

const gamificationService = {
    XP_POR_NIVEL,
    PUNTOS_POR_ACIERTO,
    getXP,
    sumarXP,
    getNivel,
    getProgresoNivel,
    getEstudianteId,
    guardarProgreso,
    completarReto,
    obtenerRanking,
    obtenerProgreso,
    getResumen
};

export default gamificationService;
