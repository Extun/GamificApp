// Servicio del Repositorio de Preguntas (SPEC-010, Fase 1).
// Biblioteca de preguntas reutilizables por materia/tema/tipo; las actividades
// no dependen de este módulo (guardan su configuracion_json como siempre).

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

// Listar/buscar preguntas. Filtros: { materiaId, tema, tipo, dificultad, estado, q }.
export const listarPreguntas = ({ materiaId, tema, tipo, dificultad, estado, q } = {}) => {
    const params = new URLSearchParams();
    if (materiaId) params.set('materia_id', materiaId);
    if (tema) params.set('tema', tema);
    if (tipo) params.set('tipo', tipo);
    if (dificultad) params.set('dificultad', dificultad);
    if (estado) params.set('estado', estado);
    if (q) params.set('q', q);
    const query = params.toString();
    return pedir(`/api/banco${query ? `?${query}` : ''}`);
};

// Detalle de una pregunta (incluye su contenido completo).
export const obtenerPregunta = (id) => pedir(`/api/banco/${id}`);

// Crear pregunta manual (nace aprobada).
// { materiaId, tipo, contenido, tema?, dificultad?, explicacion?, etiquetas? }
export const crearPregunta = ({ materiaId, tipo, contenido, tema, dificultad, explicacion, etiquetas }) =>
    pedir('/api/banco', {
        method: 'POST',
        body: JSON.stringify({
            materia_id: materiaId, tipo, contenido, tema, dificultad, explicacion, etiquetas
        })
    });

// Editar una pregunta existente (el tipo no cambia).
export const editarPregunta = (id, { materiaId, contenido, tema, dificultad, explicacion, etiquetas }) =>
    pedir(`/api/banco/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
            materia_id: materiaId, contenido, tema, dificultad, explicacion, etiquetas
        })
    });

// Copia aprobada con contadores en cero.
export const duplicarPregunta = (id) =>
    pedir(`/api/banco/${id}/duplicar`, { method: 'POST' });

// Aprobar / archivar / reactivar.
export const cambiarEstadoPregunta = (id, estado) =>
    pedir(`/api/banco/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) });

// Eliminar: el servidor archiva si la pregunta ya se usó; borra si nunca se usó.
export const eliminarPregunta = (id) =>
    pedir(`/api/banco/${id}`, { method: 'DELETE' });

// Registrar que estas preguntas se insertaron en una actividad (contador
// "usada N veces" + fecha de última utilización).
export const registrarUso = (ids) =>
    pedir('/api/banco/uso', { method: 'POST', body: JSON.stringify({ ids }) });

export default {
    listarPreguntas, obtenerPregunta, crearPregunta, editarPregunta,
    duplicarPregunta, cambiarEstadoPregunta, eliminarPregunta, registrarUso
};
