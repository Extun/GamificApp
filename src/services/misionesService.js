// Servicio de Misiones (SPEC-007). La fuente de verdad es el backend: aquí solo
// se consulta GET /api/misiones y se expone la identidad visual (presentación)
// de categorías y tiers. NADA de misiones hardcodeadas: el catálogo llega del
// servidor. localStorage no participa (se resolvió el problema de dispositivos
// compartidos moviendo el progreso a la BD).

import { authFetch } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Identidad visual por categoría (solo presentación; el dato vive en la BD).
export const CATEGORIAS_MISION = {
    aprendizaje: { emoji: '📚', label: 'Aprendizaje', color: '#3b82f6' },
    competencia: { emoji: '🏆', label: 'Competencia', color: '#f59e0b' },
    constancia: { emoji: '🔥', label: 'Constancia', color: '#ef4444' },
    colaboracion: { emoji: '🤝', label: 'Colaboración', color: '#10b981' },
    precision: { emoji: '🎯', label: 'Precisión', color: '#8b5cf6' },
    exploracion: { emoji: '🚀', label: 'Exploración', color: '#06b6d4' },
    especiales: { emoji: '⭐', label: 'Especiales', color: '#eab308' },
    ia: { emoji: '🤖', label: 'IA', color: '#ec4899' }
};

// Orden de presentación de las categorías.
export const ORDEN_CATEGORIAS = [
    'aprendizaje', 'competencia', 'constancia', 'colaboracion',
    'precision', 'exploracion', 'especiales', 'ia'
];

// Identidad visual por tier (dificultad).
export const TIERS_MISION = {
    bronce: { label: 'Bronce', color: '#b45309', emoji: '🥉' },
    plata: { label: 'Plata', color: '#6b7280', emoji: '🥈' },
    oro: { label: 'Oro', color: '#d97706', emoji: '🥇' },
    platino: { label: 'Platino', color: '#0ea5e9', emoji: '💠' },
    diamante: { label: 'Diamante', color: '#7c3aed', emoji: '💎' }
};

// Texto amigable del horizonte (tiempo estimado).
export const HORIZONTE_LABEL = {
    corto: 'Corto plazo',
    mediano: 'Mediano plazo',
    largo: 'Largo plazo'
};

export const categoriaUI = (cat) => CATEGORIAS_MISION[cat] || { emoji: '🎖️', label: cat, color: '#64748b' };
export const tierUI = (tier) => TIERS_MISION[tier] || { label: tier, color: '#64748b', emoji: '🎖️' };

// GET /api/misiones — catálogo del estudiante con progreso y estado. Devuelve
// { misiones, nuevas } o { misiones: [], nuevas: [] } si la red falla, para que
// la vista muestre su estado vacío en vez de romperse.
export const obtenerMisiones = async () => {
    try {
        const res = await authFetch(`${API_URL}/api/misiones`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn('No se pudieron obtener las misiones:', err.message);
        return { misiones: [], nuevas: [] };
    }
};

export default { obtenerMisiones, categoriaUI, tierUI, CATEGORIAS_MISION, ORDEN_CATEGORIAS, TIERS_MISION, HORIZONTE_LABEL };
