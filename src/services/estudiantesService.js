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

export default { analizarImportacion, confirmarImportacion };
