// Panel del administrador — gestión de docentes y estudiantes vía API.
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

export const listarDocentes = () => pedir('/api/admin/docentes');
export const crearDocente = ({ username, password, materiaIds }) =>
    pedir('/api/admin/docentes', {
        method: 'POST',
        body: JSON.stringify({ username, password, materia_ids: materiaIds })
    });
export const actualizarDocente = (id, { password, materiaIds }) =>
    pedir(`/api/admin/docentes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ password, materia_ids: materiaIds })
    });
export const eliminarDocente = (id) => pedir(`/api/admin/docentes/${id}`, { method: 'DELETE' });

export const listarEstudiantes = () => pedir('/api/admin/estudiantes');
export const resetearPinEstudiante = (usuarioId) =>
    pedir(`/api/admin/estudiantes/${usuarioId}/resetear-pin`, { method: 'POST' });
export const eliminarEstudiante = (usuarioId) =>
    pedir(`/api/admin/estudiantes/${usuarioId}`, { method: 'DELETE' });

export const listarInvitaciones = () => pedir('/api/admin/invitaciones');

export default {
    listarDocentes,
    crearDocente,
    actualizarDocente,
    eliminarDocente,
    listarEstudiantes,
    resetearPinEstudiante,
    eliminarEstudiante,
    listarInvitaciones
};
