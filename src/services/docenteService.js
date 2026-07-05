// Panel del docente — sus materias, invitaciones y estudiantes vía API.
import { authFetch } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const pedir = async (ruta, options = {}) => {
    const res = await authFetch(`${API_URL}${ruta}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
};

// Materias asignadas por el admin: definen qué ve y edita este docente.
export const misMaterias = () => pedir('/api/docente/mis-materias');

export const generarInvitaciones = (cantidad, curso) =>
    pedir('/api/docente/invitaciones', {
        method: 'POST',
        body: JSON.stringify({ cantidad, curso })
    });
export const listarInvitaciones = () => pedir('/api/docente/invitaciones');

export const misEstudiantes = () => pedir('/api/docente/mis-estudiantes');
export const resetearPinEstudiante = (usuarioId) =>
    pedir(`/api/docente/estudiantes/${usuarioId}/resetear-pin`, { method: 'POST' });

export default { misMaterias, generarInvitaciones, listarInvitaciones, misEstudiantes, resetearPinEstudiante };
