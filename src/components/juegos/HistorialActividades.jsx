// Historial "Últimos generados" de los editores del docente (SPEC-011).
// La FUENTE DE VERDAD es la BD: cada generación crea un reto en estado
// 'borrador' (tabla `retos`) y el historial se lee de GET /api/retos/gestion,
// así los borradores sobreviven a cambios de navegador/dispositivo y el badge
// Publicado/Borrador nunca miente. localStorage queda SOLO como caché offline
// (se muestra si la red falla; la API lo pisa al volver), cumpliendo la regla
// permanente §6.11. Eliminar del historial = enviar a la Papelera (recuperable
// desde la Biblioteca de Actividades).
import { useCallback, useEffect, useRef, useState } from 'react';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import {
    publicarReto, obtenerRetosGestion, actualizarReto, eliminarReto, obtenerRetoDetalle
} from '../../services/retosService';

const HISTORIAL_MAX = 15;
const POR_PAGINA = 5;
const CACHE_KEY = 'edu_historialRetos';
const DEBOUNCE_MS = 1500;

const leerCache = () => {
    try {
        const data = JSON.parse(localStorage.getItem(CACHE_KEY));
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
        return {};
    }
};

const escribirCache = (subclave, lista) => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...leerCache(), [subclave]: lista }));
    } catch {
        // Ignorar errores de cuota: la caché es prescindible.
    }
};

const formatearFecha = (iso) => {
    const fecha = iso ? new Date(iso) : null;
    return fecha && !Number.isNaN(fecha.getTime())
        ? fecha.toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })
        : '';
};

// Hook del historial de UN tipo de juego en UNA materia, respaldado en BD.
// Devuelve:
//   historial      — lista ligera (sin configuración), la más nueva primero
//   cargado        — true cuando la primera lectura (o su fallo) terminó
//   crearBorrador  — POST /api/retos estado 'borrador'; devuelve { id, ... }
//   sincronizar    — PATCH con debounce (título/configuración/XP de un borrador)
//   cancelarSincronizacion — descarta un PATCH pendiente (p. ej. al publicar)
//   eliminar       — envía a la Papelera y refresca
//   abrirDetalle   — GET del reto con su configuración completa
//   refrescar      — relee la lista desde el servidor
export function useHistorialRetos(tipo, materia) {
    const subclave = `${tipo}|${materia}`;
    const [historial, setHistorial] = useState(() => leerCache()[subclave] || []);
    const [cargado, setCargado] = useState(false);
    const timersRef = useRef({});

    const refrescar = useCallback(async () => {
        try {
            const filas = await obtenerRetosGestion();
            const lista = filas
                .filter((r) => r.tipo === tipo && r.materia === materia && r.estado !== 'archivado')
                .slice(0, HISTORIAL_MAX)
                .map((r) => ({ ...r, fecha: formatearFecha(r.creado_en) }));
            setHistorial(lista);
            escribirCache(subclave, lista);
        } catch (err) {
            // Sin red: se conserva la caché ya mostrada.
            console.warn('No se pudo leer el historial del servidor:', err.message);
        } finally {
            setCargado(true);
        }
    }, [tipo, materia, subclave]);

    useEffect(() => {
        refrescar();
        const timers = timersRef.current;
        return () => Object.values(timers).forEach(clearTimeout);
    }, [refrescar]);

    // Crea el borrador en la BD. Lanza si el servidor lo rechaza o no hay red:
    // el generador decide cómo degradar (seguir editando solo en memoria).
    const crearBorrador = async ({ materiaId, titulo, configuracion, xpRecompensa, descripcion, origen, dificultad, cursoId }) => {
        const data = await publicarReto({
            materiaId, titulo, tipo, configuracion, xpRecompensa, descripcion,
            estado: 'borrador', origen, dificultad, cursoId
        });
        refrescar();
        return data;
    };

    const cancelarSincronizacion = (id) => {
        if (timersRef.current[id]) {
            clearTimeout(timersRef.current[id]);
            delete timersRef.current[id];
        }
    };

    // PATCH con debounce: agrupa la ráfaga de teclas en una sola escritura.
    // Silencioso ante fallos (el trabajo sigue en memoria y se reintenta con
    // la siguiente edición o al publicar).
    const sincronizar = (id, cambios) => {
        if (!id) return;
        cancelarSincronizacion(id);
        timersRef.current[id] = setTimeout(() => {
            delete timersRef.current[id];
            actualizarReto(id, cambios)
                .then(refrescar)
                .catch((err) => console.warn('No se pudo sincronizar el borrador:', err.message));
        }, DEBOUNCE_MS);
    };

    const eliminar = async (id) => {
        cancelarSincronizacion(id);
        await eliminarReto(id);
        refrescar();
    };

    const abrirDetalle = (id) => obtenerRetoDetalle(id);

    return { historial, cargado, crearBorrador, sincronizar, cancelarSincronizacion, eliminar, abrirDetalle, refrescar };
}

// Lista visual del historial, paginada de a POR_PAGINA entradas. Reutiliza
// las clases quiz-historial-* para verse idéntico en todos los juegos.
export function HistorialActividades({ titulo = 'Últimas actividades generadas', items, activoId, onAbrir, onEliminar, meta, etiqueta }) {
    const [pagina, setPagina] = useState(0);

    if (!items.length) return null;

    // La página se corrige sola si la lista encogió (p. ej. tras eliminar la
    // última entrada de la última página): nunca se muestra una página vacía.
    const totalPaginas = Math.ceil(items.length / POR_PAGINA);
    const paginaActual = Math.min(pagina, totalPaginas - 1);
    const visibles = items.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA);

    return (
        <div className="quiz-historial">
            <h4>{titulo}</h4>
            <ul className="quiz-historial-lista">
                {visibles.map((e) => {
                    const publicado = e.estado === 'publicado';
                    const nombre = etiqueta ? etiqueta(e) : e.titulo;
                    return (
                        <li key={e.id} className="quiz-historial-fila">
                            <button
                                type="button"
                                className={`quiz-historial-item ${activoId === e.id ? 'is-activo' : ''}`}
                                onClick={() => onAbrir(e)}
                            >
                                <span className="quiz-historial-tema">
                                    {nombre || 'Sin título'}
                                    <span className={`quiz-estado-badge ${publicado ? 'is-publicado' : 'is-borrador'}`}>
                                        {publicado
                                            ? <><CheckCircleRoundedIcon sx={{ fontSize: '0.85rem' }} /> Publicado</>
                                            : <><EditNoteRoundedIcon sx={{ fontSize: '0.85rem' }} /> Borrador</>}
                                    </span>
                                </span>
                                <span className="quiz-historial-meta">
                                    {meta ? `${meta(e)} · ${e.fecha}` : e.fecha}
                                </span>
                            </button>
                            <button
                                type="button"
                                className="quiz-historial-eliminar"
                                title="Enviar a la papelera (recuperable desde la Biblioteca)"
                                aria-label={`Enviar ${nombre || 'esta actividad'} a la papelera`}
                                onClick={() => onEliminar(e.id)}
                            >
                                <DeleteOutlineRoundedIcon sx={{ fontSize: '1.2rem' }} />
                            </button>
                        </li>
                    );
                })}
            </ul>

            {totalPaginas > 1 && (
                <div className="quiz-historial-paginas">
                    <button
                        type="button"
                        className="quiz-historial-pagina-btn"
                        disabled={paginaActual === 0}
                        aria-label="Página anterior del historial"
                        onClick={() => setPagina(paginaActual - 1)}
                    >
                        <ChevronLeftRoundedIcon sx={{ fontSize: '1.15rem' }} />
                    </button>
                    <span className="quiz-historial-pagina-info">
                        Página {paginaActual + 1} de {totalPaginas}
                    </span>
                    <button
                        type="button"
                        className="quiz-historial-pagina-btn"
                        disabled={paginaActual >= totalPaginas - 1}
                        aria-label="Página siguiente del historial"
                        onClick={() => setPagina(paginaActual + 1)}
                    >
                        <ChevronRightRoundedIcon sx={{ fontSize: '1.15rem' }} />
                    </button>
                </div>
            )}
        </div>
    );
}
