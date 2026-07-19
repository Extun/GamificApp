// Registro central de tipos de juego — BACKEND (SPEC-017, Fase 1).
//
// AÑADIR UN JUEGO NUEVO = crear su archivo en `tipos/` y añadirlo a la lista
// de abajo. Nada más en el backend. Ver docs/COMO-AGREGAR-UN-JUEGO.md.
//
// Este registro es la ÚNICA fuente de verdad del servidor para:
//   · validación de `configuracion_json`  (publicar/guardar borrador)
//   · `totalEsperado`                     (🔴 seguridad de POST /api/progreso)
//   · verbo de auditoría
//   · capacidades y bloque de Banco de preguntas
//   · esquema/prompt/normalización para la IA
//
// El registro del FRONTEND (src/components/juegos/registro/) es su espejo y
// comparte los mismos identificadores `tipo`. Una prueba automática comprueba
// que no divergen (SPEC-017 §4.3-ter).
import { verificarRegistro } from './contrato.js';
import quiz from './tipos/quiz.js';
import mision from './tipos/mision.js';
import clasificador from './tipos/clasificador.js';
import memorama from './tipos/memorama.js';
import lineaTiempo from './tipos/linea-tiempo.js';
import completar from './tipos/completar.js';
import verdaderoFalso from './tipos/verdadero-falso.js';

const TIPOS = [quiz, mision, clasificador, memorama, lineaTiempo, completar, verdaderoFalso];

export const JUEGOS = Object.freeze(
    Object.fromEntries(TIPOS.map((def) => [def.tipo, def]))
);

// Guardia de completitud: se ejecuta AL IMPORTAR este módulo, es decir al
// arrancar el servidor. Si un tipo está incompleto, el proceso no arranca.
// Preferimos un error ruidoso en el despliegue a que un niño pierda su XP
// al terminar una actividad (SPEC-017 §1.2 y §4.3).
verificarRegistro(JUEGOS);

export const TIPOS_VALIDOS = Object.keys(JUEGOS);

export const obtenerJuego = (tipo) => JUEGOS[tipo] ?? null;

// ---- Vistas derivadas (evitan que cada consumidor recorra el registro) ------

// Mapa tipo → validador de configuración.
export const VALIDADORES_CONFIG = Object.freeze(
    Object.fromEntries(TIPOS.map((d) => [d.tipo, d.validarConfig]))
);

// Total de ítems evaluables que un intento LEGÍTIMO puede reportar.
// Función PURA: el servidor no reimplementa la mecánica de cada juego, solo
// comprueba que el `total` recibido es estructuralmente posible para ese reto.
// Devuelve un entero positivo, o `null` si no es derivable.
export const totalEsperado = (tipo, configuracion) => {
    const def = JUEGOS[tipo];
    if (!def || !configuracion || typeof configuracion !== 'object') return null;
    try {
        const n = def.totalEsperado(configuracion);
        return Number.isInteger(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
};

// Verbo para la bitácora de auditoría (antes: mapa VERBO en progreso.js).
export const verboAuditoria = (tipo) => JUEGOS[tipo]?.verboAuditoria ?? 'Completó la actividad';

// Tipos que admiten Banco de preguntas, con sus funciones de ítem.
export const TIPOS_BANCO = TIPOS.filter((d) => d.banco).map((d) => d.tipo);
export const VALIDADORES_ITEM = Object.freeze(
    Object.fromEntries(TIPOS.filter((d) => d.banco).map((d) => [d.tipo, d.banco.validarItem]))
);
export const RESUMEN_ITEM = Object.freeze(
    Object.fromEntries(TIPOS.filter((d) => d.banco).map((d) => [d.tipo, d.banco.resumenItem]))
);

// Registro de generación con IA (forma histórica de ACTIVIDADES_IA).
export const ACTIVIDADES_IA = Object.freeze(
    Object.fromEntries(
        TIPOS.filter((d) => d.ia).map((d) => [d.tipo, { etiqueta: d.etiqueta, ...d.ia }])
    )
);

// Metadatos seguros para el panel de administración (SPEC-017 Fase 5).
export const juegosPublicos = () =>
    TIPOS.map((d) => ({
        tipo: d.tipo,
        etiqueta: d.etiqueta,
        emoji: d.emoji,
        descripcion: d.descripcion,
        capacidades: d.capacidades,
        integracion: {
            evaluacion: true,          // garantizado por la guardia de completitud
            ia: Boolean(d.ia),
            banco: Boolean(d.banco)
        }
    }));

export default JUEGOS;
