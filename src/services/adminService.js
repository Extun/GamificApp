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
export const reordenarMaterias = (ids) =>
    pedir('/api/admin/materias/orden', { method: 'PUT', body: JSON.stringify({ ids }) });
export const asignarMateria = (id, modo, docentes) =>
    pedir(`/api/admin/materias/${id}/asignacion`, {
        method: 'POST',
        body: JSON.stringify({ modo, docentes })
    });

// ---- Cursos (SPEC-002) ----
export const listarCursos = () => pedir('/api/admin/cursos');
export const crearCurso = (datos) =>
    pedir('/api/admin/cursos', { method: 'POST', body: JSON.stringify(datos) });
export const actualizarCurso = (id, datos) =>
    pedir(`/api/admin/cursos/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
export const eliminarCurso = (id) =>
    pedir(`/api/admin/cursos/${id}`, { method: 'DELETE' });

// ---- Administradores (solo Administrador Principal) ----
export const listarAdministradores = () => pedir('/api/admin/administradores');
export const crearAdministrador = (datos) =>
    pedir('/api/admin/administradores', { method: 'POST', body: JSON.stringify(datos) });
export const actualizarAdministrador = (id, datos) =>
    pedir(`/api/admin/administradores/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
export const eliminarAdministrador = (id) =>
    pedir(`/api/admin/administradores/${id}`, { method: 'DELETE' });

// ---- Auditoría (SPEC-003) ----
export const listarAuditoria = (rol) =>
    pedir(`/api/admin/auditoria${rol ? `?rol=${rol}` : ''}`);
export const auditoriaReciente = () => pedir('/api/admin/auditoria/reciente');

// ---- Papelera (SPEC-003) ----
export const listarPapelera = () => pedir('/api/admin/papelera');
export const restaurarDePapelera = (tipo, id) =>
    pedir(`/api/admin/papelera/${tipo}/${id}/restaurar`, { method: 'POST' });
export const purgarDePapelera = (tipo, id) =>
    pedir(`/api/admin/papelera/${tipo}/${id}`, { method: 'DELETE' });

// ---- Institución (SPEC-002) ----
export const actualizarInstitucion = (datos) =>
    pedir('/api/admin/institucion', { method: 'PUT', body: JSON.stringify(datos) });

// ---- Misiones (SPEC-007, Fase 2) ----
export const listarMisiones = () => pedir('/api/admin/misiones');
export const crearMision = (datos) =>
    pedir('/api/admin/misiones', { method: 'POST', body: JSON.stringify(datos) });
export const actualizarMision = (id, datos) =>
    pedir(`/api/admin/misiones/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
export const activarMision = (id, activa) =>
    pedir(`/api/admin/misiones/${id}/activa`, { method: 'PATCH', body: JSON.stringify({ activa }) });

// ---- Restablecer aplicación (SPEC-008) ----
// Borra todos los datos generados por usuarios y deja el sistema como una
// instalación nueva. Solo el Administrador Principal (verificado en servidor);
// exige escribir la palabra "RESET" como segunda confirmación.
export const restablecerAplicacion = () =>
    pedir('/api/admin/reset', { method: 'POST', body: JSON.stringify({ confirmacion: 'RESET' }) });

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
    reordenarMaterias,
    asignarMateria,
    listarCursos,
    crearCurso,
    actualizarCurso,
    eliminarCurso,
    listarAdministradores,
    crearAdministrador,
    actualizarAdministrador,
    eliminarAdministrador,
    listarAuditoria,
    auditoriaReciente,
    listarPapelera,
    restaurarDePapelera,
    purgarDePapelera,
    actualizarInstitucion,
    listarMisiones,
    crearMision,
    actualizarMision,
    activarMision,
    restablecerAplicacion
};
