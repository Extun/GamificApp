// Material de estudio — la fuente de verdad es MySQL vía la API.
// Subir material hace POST (el servidor responde 201) y las vistas
// SIEMPRE refrescan consultando el GET: nada de listas solo-locales.
import { authFetch } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// La API usa snake_case; el frontend (FileChip, modales) usa camelCase.
const aArchivoUI = (fila) => ({
    id: fila.id,
    name: fila.nombre,
    kind: fila.kind,
    sizeLabel: fila.size_label,
    isPrivate: Boolean(fila.is_private),
    pageCount: fila.page_count,
    thumbnail: fila.thumbnail,
    dataUrl: fila.data_url
});

// GET /api/materias/:id/material — material unificado (web y móvil ven lo
// mismo). Devuelve [] si la red falla para que las vistas no se rompan.
export const obtenerMaterial = async (materiaId) => {
    try {
        const res = await authFetch(`${API_URL}/api/materias/${materiaId}/material`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const filas = await res.json();
        return filas.map(aArchivoUI);
    } catch (err) {
        console.warn('No se pudo obtener el material del servidor:', err.message);
        return [];
    }
};

// POST /api/materias/:id/material — persiste el archivo en MySQL.
// Lanza Error si el servidor no confirma con 201: el caller decide avisar
// al docente y NO debe añadir el archivo a su lista local.
export const subirMaterial = async (materiaId, archivo) => {
    const res = await authFetch(`${API_URL}/api/materias/${materiaId}/material`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nombre: archivo.name,
            kind: archivo.kind,
            size_label: archivo.sizeLabel,
            is_private: archivo.isPrivate,
            page_count: archivo.pageCount,
            thumbnail: archivo.thumbnail,
            data_url: archivo.dataUrl
        })
    });
    const data = await res.json().catch(() => null);
    if (res.status !== 201) throw new Error(data?.error || `HTTP ${res.status}`);
    return aArchivoUI(data);
};

// DELETE /api/materias/:id/material/:materialId
export const eliminarMaterial = async (materiaId, materialId) => {
    const res = await authFetch(`${API_URL}/api/materias/${materiaId}/material/${materialId}`, {
        method: 'DELETE'
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return true;
};

export default { obtenerMaterial, subirMaterial, eliminarMaterial };
