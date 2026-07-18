// Carga masiva de estudiantes por Excel (SPEC-014) — vía API.
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

// Vista previa: valida en el servidor SIN crear nada.
export const analizarImportacion = (cursoId, filas) =>
    pedir('/api/estudiantes/importar/analizar', {
        method: 'POST',
        body: JSON.stringify({ curso_id: cursoId, filas })
    });

// Creación definitiva (transaccional). La respuesta trae los códigos en
// claro UNA sola vez: hay que descargarlos/anotarlos en el momento.
export const confirmarImportacion = (cursoId, filas) =>
    pedir('/api/estudiantes/importar/confirmar', {
        method: 'POST',
        body: JSON.stringify({ curso_id: cursoId, filas })
    });

// Alta manual: la versión de un solo estudiante de la importación. Devuelve
// el código de activación en claro UNA sola vez (igual que el Excel).
export const crearEstudiante = (cursoId, datos) =>
    pedir('/api/estudiantes', {
        method: 'POST',
        body: JSON.stringify({ curso_id: cursoId, ...datos })
    });

// Código de activación nuevo (el anterior queda invalidado en el acto).
// La respuesta trae el código en claro UNA sola vez.
export const regenerarCodigo = (usuarioId) =>
    pedir(`/api/estudiantes/${usuarioId}/regenerar-codigo`, { method: 'POST' });

// Corrige nombres/apellidos (ficha + nombre de login); PIN, XP, progreso y
// código de activación quedan intactos.
export const editarEstudiante = (usuarioId, datos) =>
    pedir(`/api/estudiantes/${usuarioId}`, { method: 'PUT', body: JSON.stringify(datos) });

export default {
    analizarImportacion, confirmarImportacion, crearEstudiante,
    regenerarCodigo, editarEstudiante
};
