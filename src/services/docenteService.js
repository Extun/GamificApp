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

// Cursos activos del catálogo institucional (SPEC-002): alimentan el
// selector al generar invitaciones (el admin los gestiona en su panel).
export const listarCursos = () => pedir('/api/cursos');

export const generarInvitaciones = (cantidad, cursoId) =>
    pedir('/api/docente/invitaciones', {
        method: 'POST',
        body: JSON.stringify({ cantidad, curso_id: cursoId })
    });
export const listarInvitaciones = () => pedir('/api/docente/invitaciones');

export const misEstudiantes = () => pedir('/api/docente/mis-estudiantes');
export const resetearPinEstudiante = (usuarioId) =>
    pedir(`/api/docente/estudiantes/${usuarioId}/resetear-pin`, { method: 'POST' });

// ---- SPEC-004: Home, ficha de estudiante, retroalimentación y perfil ----

// Resumen real del Home (stats + Centro de Actividad).
export const resumen = () => pedir('/api/docente/resumen');

// Ficha rápida del estudiante (modal, sin abandonar "Mis Estudiantes").
export const detalleEstudiante = (usuarioId) =>
    pedir(`/api/docente/estudiantes/${usuarioId}/detalle`);

export const crearRetroalimentacion = (usuarioId, mensaje) =>
    pedir(`/api/docente/estudiantes/${usuarioId}/retroalimentaciones`, {
        method: 'POST',
        body: JSON.stringify({ mensaje })
    });
export const eliminarRetroalimentacion = (usuarioId, retroId) =>
    pedir(`/api/docente/estudiantes/${usuarioId}/retroalimentaciones/${retroId}`, { method: 'DELETE' });

// Perfil del docente: identidad + actividad propia; edición de nombre/foto y
// cambio de contraseña (exige la actual).
export const miPerfil = () => pedir('/api/docente/perfil');
export const actualizarPerfil = (cambios) =>
    pedir('/api/docente/perfil', { method: 'PUT', body: JSON.stringify(cambios) });
export const cambiarPassword = (passwordActual, passwordNueva) =>
    pedir('/api/docente/perfil/password', {
        method: 'PUT',
        body: JSON.stringify({ password_actual: passwordActual, password_nueva: passwordNueva })
    });

// Ranking completo (posición, curso, XP, completados, última actividad).
export const rankingCompleto = () => pedir('/api/ranking/completo');

export default {
    misMaterias, listarCursos, generarInvitaciones, listarInvitaciones,
    misEstudiantes, resetearPinEstudiante,
    resumen, detalleEstudiante, crearRetroalimentacion, eliminarRetroalimentacion,
    miPerfil, actualizarPerfil, cambiarPassword, rankingCompleto
};
