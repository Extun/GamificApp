// Identidad institucional (SPEC-002): nombre, logo, favicon y colores.
// El GET es público (el Login lo necesita antes de la sesión). La respuesta
// se cachea en localStorage para pintar la identidad al instante en visitas
// siguientes; la API siempre pisa la caché.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const CACHE_KEY = 'institucion_cache';

let cache = null;
try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || null;
} catch {
    cache = null;
}

export const getInstitucionCache = () => cache;

export const obtenerInstitucion = async () => {
    const res = await fetch(`${API_URL}/api/institucion`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cache = data;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* caché llena */ }
    return data;
};

// ---- Derivados de color (misma matemática simple en toda la app) ----

const hexValido = (hex) => /^#[0-9a-fA-F]{6}$/.test(String(hex || ''));

const ajustar = (hex, factor) => {
    const canal = (i) => {
        const v = Math.round(parseInt(hex.slice(1 + i, 3 + i), 16) * factor);
        return Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0');
    };
    return `#${canal(0)}${canal(2)}${canal(4)}`;
};

// Mezcla el color con blanco (para los tonos "soft" de fondo).
const aclarar = (hex, peso = 0.85) => {
    const canal = (i) => {
        const v = Math.round(parseInt(hex.slice(1 + i, 3 + i), 16) * (1 - peso) + 255 * peso);
        return Math.min(255, v).toString(16).padStart(2, '0');
    };
    return `#${canal(0)}${canal(2)}${canal(4)}`;
};

// Inyecta la identidad en :root (colores), <title> y favicon. Con campos
// vacíos no toca nada: la app conserva su tema por defecto (index.css).
export const aplicarInstitucion = (inst) => {
    if (!inst) return;
    const root = document.documentElement;

    if (hexValido(inst.color_principal)) {
        root.style.setProperty('--color-primary', inst.color_principal);
        root.style.setProperty('--color-primary-dark', ajustar(inst.color_principal, 0.8));
        root.style.setProperty('--color-primary-light', ajustar(inst.color_principal, 1.25));
        root.style.setProperty('--color-primary-soft', aclarar(inst.color_principal));
    }
    if (hexValido(inst.color_secundario)) {
        root.style.setProperty('--color-accent', inst.color_secundario);
        root.style.setProperty('--color-accent-dark', ajustar(inst.color_secundario, 0.8));
        root.style.setProperty('--color-accent-soft', aclarar(inst.color_secundario));
    }

    if (inst.nombre) document.title = `GamificApp · ${inst.nombre}`;

    const favicon = inst.favicon_data || inst.logo_data;
    if (favicon) {
        let link = document.querySelector('link[rel="icon"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = favicon;
    }
};

// Arranque de la app: pinta con la caché al instante y refresca desde la API.
export const iniciarInstitucion = () => {
    aplicarInstitucion(cache);
    obtenerInstitucion().then(aplicarInstitucion).catch(() => { /* sin red: caché o tema por defecto */ });
};

export default {
    obtenerInstitucion,
    getInstitucionCache,
    aplicarInstitucion,
    iniciarInstitucion
};
