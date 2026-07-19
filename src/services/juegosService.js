// Gestión de tipos de juego del panel de administración (SPEC-017).
//
// El administrador gestiona la DISPONIBILIDAD de los tipos ya implementados;
// no crea mecánicas desde aquí. No existe endpoint de eliminación.
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

export const listarJuegos = () => pedir('/api/admin/juegos');

export const cambiarEstadoJuego = (tipo, estado) =>
    pedir(`/api/admin/juegos/${encodeURIComponent(tipo)}`, {
        method: 'PUT',
        body: JSON.stringify({ estado })
    });
