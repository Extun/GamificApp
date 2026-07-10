// Servicio de IA (SPEC-006) — habla con los endpoints genéricos del servidor.
// La API key de Gemini vive SOLO en el backend; aquí solo viajan ids y textos.
import { authFetch } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const pedir = async (ruta, body) => {
    const res = await authFetch(`${API_URL}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
};

// POST /api/ia/generar — cualquier tipo del registro (quiz, mision,
// clasificador, memorama, linea-tiempo, completar). NO guarda nada: devuelve
// { titulo, descripcion, configuracion, items, xp_sugerida, dificultad }.
export const generarActividadIA = ({ tipo, materiaId, tema, cantidad, dificultad, cursoId, tematica, existentes }) =>
    pedir('/api/ia/generar', {
        tipo,
        materia_id: materiaId,
        tema,
        cantidad,
        dificultad,
        curso_id: cursoId || undefined,
        tematica: tematica || undefined,
        existentes
    });

// POST /api/ia/sorpresa — la IA decide tipo/tema/dificultad/cantidad y guarda
// un BORRADOR. Devuelve { reto, objetivo }.
export const actividadSorpresa = ({ materiaId, cursoId }) =>
    pedir('/api/ia/sorpresa', { materia_id: materiaId, curso_id: cursoId || undefined });

// POST /api/ia/adaptar — transforma una actividad existente (curso, materia,
// dificultad, temática o tema) y guarda una COPIA en borrador. Devuelve { reto }.
export const adaptarActividadIA = (retoId, cambios) =>
    pedir('/api/ia/adaptar', { reto_id: retoId, cambios });

export default { generarActividadIA, actividadSorpresa, adaptarActividadIA };
