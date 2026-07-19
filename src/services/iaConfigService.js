// Configuración de IA del panel de administración (SPEC-016).
//
// ⚠️ Este servicio NUNCA maneja API keys: el backend jamás las devuelve. Del
// secreto solo llega un booleano `configurado` por proveedor. La prueba de
// conexión se ejecuta ENTERA en el servidor; el navegador solo pide y muestra
// el resultado.
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

export const obtenerConfiguracionIA = () => pedir('/api/admin/ia/configuracion');

export const listarModelosIA = (proveedor) =>
    pedir(`/api/admin/ia/modelos?proveedor=${encodeURIComponent(proveedor)}`);

export const guardarConfiguracionIA = ({ proveedor, modelo }) =>
    pedir('/api/admin/ia/configuracion', {
        method: 'PUT',
        body: JSON.stringify({ proveedor, modelo: modelo || null })
    });

export const probarConexionIA = () => pedir('/api/admin/ia/probar', { method: 'POST' });
