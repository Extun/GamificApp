// Catálogo dinámico de materias (SPEC-002). Única fuente de verdad: la API.
// La caché (memoria + localStorage) solo acelera el primer pintado; cada
// listar() la pisa con la respuesta del servidor.
import { authFetch } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const CACHE_KEY = 'materias_cache';

let cache = [];
try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || [];
} catch {
    cache = [];
}

// GET /api/materias — el servidor decide qué ve cada rol (el admin recibe
// también las desactivadas; docentes y estudiantes solo las activas).
export const listarMaterias = async () => {
    const res = await authFetch(`${API_URL}/api/materias`);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    cache = data;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* caché llena: se ignora */ }
    return data;
};

// Lecturas síncronas sobre la última respuesta de la API (para los editores
// que reciben el nombre de la materia y necesitan su id al guardar).
export const getMateriasCache = () => cache;
export const materiaPorNombre = (nombre) => cache.find((m) => m.nombre === nombre);
export const idPorNombre = (nombre) => materiaPorNombre(nombre)?.id;

// Oscurece un color hex (para bordes de las tarjetas pastel).
export const oscurecerColor = (hex, factor = 0.82) => {
    const limpio = /^#[0-9a-fA-F]{6}$/.test(String(hex || '')) ? hex.slice(1) : 'e0f2fe';
    const canal = (i) => Math.round(parseInt(limpio.slice(i, i + 2), 16) * factor)
        .toString(16).padStart(2, '0');
    return `#${canal(0)}${canal(2)}${canal(4)}`;
};

// Estilo inline de una tarjeta/hero de materia con la identidad de la BD.
export const estiloMateria = (materia) => ({
    background: materia?.color || '#e0f2fe',
    borderColor: oscurecerColor(materia?.color)
});

// Identidad (icono + estilo) por nombre, con fallback neutro si el catálogo
// aún no llegó de la API.
export const uiMateria = (nombre) => {
    const materia = materiaPorNombre(nombre);
    return {
        icono: materia?.icono || '📚',
        estilo: estiloMateria(materia)
    };
};

export default {
    listarMaterias,
    getMateriasCache,
    materiaPorNombre,
    idPorNombre,
    oscurecerColor,
    estiloMateria,
    uiMateria
};
