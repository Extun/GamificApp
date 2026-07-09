// Servicio de retos configurables (juegos creados por el docente).
//
// El editor no-code del docente publica aquí su configuración como objeto JS;
// el backend la persiste en `retos.configuracion_json` y el estudiante la
// recibe ya parseada. Añadir un juego nuevo = añadir su `tipo` y sus
// componentes de editor/reproductor; esta capa no cambia.

import { authFetch } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// POST /api/retos — publica (o republica) un reto con su configuración.
// Lanza Error con el mensaje del servidor si la publicación falla, para que
// el editor pueda mostrárselo al docente.
export const publicarReto = async ({ materiaId, titulo, tipo, configuracion, xpRecompensa, descripcion }) => {
    const res = await authFetch(`${API_URL}/api/retos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            materia_id: materiaId,
            titulo,
            tipo,
            configuracion,
            xp_recompensa: xpRecompensa,
            descripcion
        })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
};

// GET /api/retos — retos publicados, filtrables por materia y tipo.
// Devuelve [] si la red falla: las vistas muestran su estado vacío sin romperse.
export const obtenerRetosPublicados = async ({ materiaId, tipo } = {}) => {
    try {
        const params = new URLSearchParams();
        if (materiaId) params.set('materia_id', materiaId);
        if (tipo) params.set('tipo', tipo);
        const query = params.toString();
        const res = await authFetch(`${API_URL}/api/retos${query ? `?${query}` : ''}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn('No se pudieron obtener los retos del servidor:', err.message);
        return [];
    }
};

// ---- SPEC-004: Biblioteca de Actividades del docente ----

const pedir = async (ruta, options = {}) => {
    const res = await authFetch(`${API_URL}${ruta}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
};

// Todos los retos de las materias del docente, en cualquier estado.
export const obtenerRetosGestion = () => pedir('/api/retos/gestion');

// Archivar / restaurar / publicar borradores y ajustar descripción o XP.
export const actualizarReto = (id, cambios) =>
    pedir(`/api/retos/${id}`, { method: 'PATCH', body: JSON.stringify(cambios) });

// Copia de trabajo en borrador ("Título (copia)").
export const duplicarReto = (id) =>
    pedir(`/api/retos/${id}/duplicar`, { method: 'POST' });

export default { publicarReto, obtenerRetosPublicados, obtenerRetosGestion, actualizarReto, duplicarReto };
