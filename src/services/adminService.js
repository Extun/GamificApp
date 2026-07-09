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
export const eliminarInvitacion = (id) =>
    pedir(`/api/admin/invitaciones/${id}`, { method: 'DELETE' });

// ---- Materias dinámicas (SPEC-002) ----
export const crearMateria = (datos) =>
    pedir('/api/admin/materias', { method: 'POST', body: JSON.stringify(datos) });
export const actualizarMateria = (id, datos) =>
    pedir(`/api/admin/materias/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
export const eliminarMateria = (id) =>
    pedir(`/api/admin/materias/${id}`, { method: 'DELETE' });

// ---- Cursos (SPEC-002) ----
export const listarCursos = () => pedir('/api/admin/cursos');
export const crearCurso = (datos) =>
    pedir('/api/admin/cursos', { method: 'POST', body: JSON.stringify(datos) });
export const actualizarCurso = (id, datos) =>
    pedir(`/api/admin/cursos/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
export const eliminarCurso = (id) =>
    pedir(`/api/admin/cursos/${id}`, { method: 'DELETE' });

// ---- Institución (SPEC-002) ----
export const actualizarInstitucion = (datos) =>
    pedir('/api/admin/institucion', { method: 'PUT', body: JSON.stringify(datos) });

export default {
    listarDocentes,
    crearDocente,
    actualizarDocente,
    eliminarDocente,
    listarEstudiantes,
    resetearPinEstudiante,
    eliminarEstudiante,
    listarInvitaciones,
    eliminarInvitacion,
    crearMateria,
    actualizarMateria,
    eliminarMateria,
    listarCursos,
    crearCurso,
    actualizarCurso,
    eliminarCurso,
    actualizarInstitucion
};
