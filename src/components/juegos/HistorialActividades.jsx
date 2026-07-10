// Historial local de "Últimas actividades generadas" (mismo patrón que el
// historial del GeneradorQuiz): guardamos las últimas 3 entradas POR MATERIA
// en localStorage, bajo una clave propia de cada tipo de juego. Es un espacio
// de trabajo/borradores del docente; la fuente de verdad de lo publicado
// sigue siendo la BD (tabla `retos`).
import { useState } from 'react';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';

const HISTORIAL_MAX = 3;

const leerTodo = (clave) => {
    try {
        const guardado = localStorage.getItem(clave);
        const data = guardado ? JSON.parse(guardado) : {};
        return Array.isArray(data) ? {} : data;
    } catch {
        return {};
    }
};

// Crea una entrada nueva del historial (nace como borrador, con fecha local).
export const nuevaEntradaHistorial = (datos) => ({
    id: Date.now(),
    estado: 'borrador',
    fecha: new Date().toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }),
    ...datos
});

// Hook con las operaciones del historial de UNA materia bajo la clave dada.
export function useHistorialActividades(clave, materia) {
    const [todo, setTodo] = useState(() => leerTodo(clave));
    const historial = todo[materia] || [];

    const persistir = (mapa) => {
        try {
            localStorage.setItem(clave, JSON.stringify(mapa));
        } catch {
            // Ignorar errores de cuota/persistencia de localStorage.
        }
    };

    // Añade una entrada al frente, conservando solo las últimas 3.
    const guardar = (entrada) => {
        setTodo((prev) => {
            const previos = prev[entrada.materia] || [];
            const actualizado = {
                ...prev,
                [entrada.materia]: [entrada, ...previos].slice(0, HISTORIAL_MAX)
            };
            persistir(actualizado);
            return actualizado;
        });
    };

    // Fusiona `cambios` (con id y materia) sobre la entrada existente.
    const actualizar = (cambios) => {
        setTodo((prev) => {
            const previos = prev[cambios.materia || materia] || [];
            const actualizado = {
                ...prev,
                [cambios.materia || materia]: previos.map((e) => (e.id === cambios.id ? { ...e, ...cambios } : e))
            };
            persistir(actualizado);
            return actualizado;
        });
    };

    const eliminar = (id) => {
        setTodo((prev) => {
            const actualizado = {
                ...prev,
                [materia]: (prev[materia] || []).filter((e) => e.id !== id)
            };
            persistir(actualizado);
            return actualizado;
        });
    };

    return { historial, guardar, actualizar, eliminar };
}

// Lista visual del historial. Reutiliza las clases quiz-historial-* que ya
// usa el generador de quizzes, para que se vea idéntico en todos los juegos.
export function HistorialActividades({ titulo = 'Últimas actividades generadas', items, activoId, onAbrir, onEliminar, meta, etiqueta }) {
    if (!items.length) return null;
    return (
        <div className="quiz-historial">
            <h4>{titulo}</h4>
            <ul className="quiz-historial-lista">
                {items.map((e) => {
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
                                title="Eliminar del historial"
                                aria-label={`Eliminar ${nombre || 'esta actividad'} del historial`}
                                onClick={() => onEliminar(e.id)}
                            >
                                <DeleteOutlineRoundedIcon sx={{ fontSize: '1.2rem' }} />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
