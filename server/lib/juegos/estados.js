// Estado administrativo de los tipos de juego (SPEC-017, Fase 4).
//
// Tres estados aprobados:
//   · activo        → se pueden CREAR actividades nuevas y JUGAR las existentes
//   · solo_jugar    → NO se crean nuevas; las existentes se siguen jugando
//   · deshabilitado → NO se crean ni se INICIAN partidas nuevas
//
// INVARIANTE CENTRAL: ningún estado elimina ni oculta datos históricos.
// Actividades, configuraciones, progreso, calificaciones y XP se conservan
// íntegros en cualquier estado. Este módulo NUNCA borra nada.
//
// DÓNDE SE CONSULTA (y dónde NO):
//   ✔ al crear/publicar/duplicar una actividad  → puedeCrear()
//   ✔ al listar actividades para el estudiante  → puedeJugar()
//   ✘ al calificar o registrar progreso         → JAMÁS
// Esa última regla es deliberada: si un estudiante ya estaba jugando cuando el
// administrador deshabilitó el tipo, puede terminar y registrar su resultado.
// No se le castiga por una decisión administrativa que no controla
// (SPEC-017 §5.0 regla 3).
import pool from '../../db.js';
import { TIPOS_VALIDOS } from './registro.js';

export const ESTADOS = ['activo', 'solo_jugar', 'deshabilitado'];
export const ESTADO_POR_DEFECTO = 'activo';

const TTL_MS = 30_000;
let cache = null;
let cacheEn = 0;

export const invalidarCache = () => { cache = null; cacheEn = 0; };

// Mapa tipo → estado. Sin fila (o sin tabla, en un deploy a medias) el tipo se
// considera 'activo': el comportamiento previo a SPEC-017.
export const leerEstados = async () => {
    if (cache && Date.now() - cacheEn < TTL_MS) return cache;
    const estados = Object.fromEntries(TIPOS_VALIDOS.map((t) => [t, ESTADO_POR_DEFECTO]));
    try {
        const [filas] = await pool.query('SELECT tipo, estado FROM tipos_juego');
        for (const fila of filas) {
            if (estados[fila.tipo] !== undefined) estados[fila.tipo] = fila.estado;
        }
    } catch (err) {
        if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
    cache = estados;
    cacheEn = Date.now();
    return estados;
};

export const estadoDe = async (tipo) => (await leerEstados())[tipo] ?? ESTADO_POR_DEFECTO;

// ¿Se pueden CREAR actividades nuevas de este tipo? (solo 'activo')
export const puedeCrear = async (tipo) => (await estadoDe(tipo)) === 'activo';

// ¿Se pueden INICIAR partidas de este tipo? ('activo' y 'solo_jugar')
export const puedeJugar = async (tipo) => (await estadoDe(tipo)) !== 'deshabilitado';

// Tipos que el estudiante puede iniciar (para filtrar el listado de retos).
export const tiposJugables = async () => {
    const estados = await leerEstados();
    return Object.keys(estados).filter((t) => estados[t] !== 'deshabilitado');
};

export const guardarEstado = async ({ tipo, estado, usuarioId }) => {
    await pool.query(
        `INSERT INTO tipos_juego (tipo, estado, actualizado_por)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE estado = VALUES(estado),
                                 actualizado_por = VALUES(actualizado_por)`,
        [tipo, estado, usuarioId ?? null]
    );
    invalidarCache();
};

// Mensaje único para cualquier vía de creación bloqueada, de modo que el
// docente reciba siempre la misma explicación (SPEC-017 §5).
export const motivoBloqueo = (tipo, estado, etiqueta) =>
    estado === 'solo_jugar'
        ? `El administrador desactivó la creación de nuevas actividades de tipo "${etiqueta || tipo}". Las que ya existen siguen funcionando.`
        : `El tipo de actividad "${etiqueta || tipo}" está deshabilitado por el administrador.`;

export default leerEstados;
