// Ficha rápida del estudiante (SPEC-004): ModalPanel desde "Mis Estudiantes",
// sin abandonar la página. Datos reales de la BD: curso, nivel, XP, insignias
// con regla real, últimas actividades, progreso por materia y la
// retroalimentación privada del docente.
import { useEffect, useState } from 'react';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import docenteService from '../../services/docenteService';
import { XP_POR_NIVEL } from '../../services/gamificationService';
import { ModalPanel, EmptyState, formatearFecha } from '../../components/dashboard/DashboardWidgets';

const TIPO_LABEL = { quiz: 'Quiz', clasificador: 'Clasificador', mision: 'Misión' };

// Frases listas para observaciones frecuentes: un toque y se envía.
const SUGERENCIAS = [
    'Excelente trabajo 🎉',
    'Muy buen progreso 💪',
    'Necesitas reforzar este tema 📖',
    'Continúa así ⭐'
];

export function FichaEstudiante({ estudiante, onCerrar }) {
    const [detalle, setDetalle] = useState(null);
    const [error, setError] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [enviando, setEnviando] = useState(false);

    const cargar = () => docenteService.detalleEstudiante(estudiante.usuario_id)
        .then(setDetalle)
        .catch((err) => setError(err.message));

    // eslint-disable-next-line react-hooks/exhaustive-deps -- recargar solo si cambia el estudiante
    useEffect(() => { cargar(); }, [estudiante.usuario_id]);

    const enviarRetro = async (texto) => {
        const contenido = String(texto || '').trim();
        if (!contenido || enviando) return;
        setEnviando(true);
        try {
            setError('');
            await docenteService.crearRetroalimentacion(estudiante.usuario_id, contenido);
            setMensaje('');
            await cargar();
        } catch (err) {
            setError(err.message);
        } finally {
            setEnviando(false);
        }
    };

    const borrarRetro = async (retroId) => {
        try {
            setError('');
            await docenteService.eliminarRetroalimentacion(estudiante.usuario_id, retroId);
            await cargar();
        } catch (err) {
            setError(err.message);
        }
    };

    const e = detalle?.estudiante;

    return (
        <ModalPanel
            titulo={estudiante.nombre_completo}
            subtitulo={e ? `${e.curso} · Nivel ${Math.floor(e.xp_total / XP_POR_NIVEL) + 1}` : 'Cargando…'}
            avatar={
                <span className="estudiante-avatar" aria-hidden="true">
                    {estudiante.nombre_completo.charAt(0).toUpperCase()}
                </span>
            }
            onCerrar={onCerrar}
        >
            {error && (
                <div className="aviso-migracion" role="alert">
                    <p>{error}</p>
                    <button onClick={() => setError('')}>Cerrar</button>
                </div>
            )}

            {detalle && (
                <>
                    <div className="ficha-stats">
                        <div className="ficha-stat"><strong>⭐ {e.xp_total}</strong><span>XP total</span></div>
                        <div className="ficha-stat"><strong>{Math.floor(e.xp_total / XP_POR_NIVEL) + 1}</strong><span>Nivel</span></div>
                        <div className="ficha-stat"><strong>{detalle.retos_completados}</strong><span>Retos completados</span></div>
                        <div className="ficha-stat"><strong>{detalle.insignias.length}</strong><span>Insignias</span></div>
                    </div>

                    <div className="ficha-seccion">
                        <h4>Insignias</h4>
                        {detalle.insignias.length ? (
                            <div className="ficha-insignias">
                                {detalle.insignias.map((i) => (
                                    <span key={i.id} className="ficha-insignia">🏅 {i.titulo}</span>
                                ))}
                            </div>
                        ) : (
                            <p className="contenido-sub" style={{ margin: 0 }}>
                                Aún no gana insignias: llegarán cuando complete sus primeras actividades.
                            </p>
                        )}
                    </div>

                    <div className="ficha-seccion">
                        <h4>Últimas actividades</h4>
                        {detalle.ultimas_actividades.length ? (
                            <ul className="ficha-actividades">
                                {detalle.ultimas_actividades.map((a, i) => (
                                    <li key={i} className="ficha-actividad">
                                        <div className="ficha-actividad-meta">
                                            <strong>{a.titulo}</strong>
                                            <span>{TIPO_LABEL[a.tipo] || a.tipo} · {a.materia} · {a.porcentaje}% · ⭐ {a.xp_obtenido} XP</span>
                                        </div>
                                        <span className="actividad-fecha">{formatearFecha(a.actualizado_en)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <EmptyState
                                Icon={TaskAltRoundedIcon}
                                titulo="Sin actividades todavía"
                                mensaje="Cuando resuelva su primer quiz, juego o misión, aparecerá aquí."
                            />
                        )}
                    </div>

                    {detalle.progreso_por_materia.length > 0 && (
                        <div className="ficha-seccion">
                            <h4>Progreso por materia</h4>
                            <ul className="ficha-actividades">
                                {detalle.progreso_por_materia.map((m) => (
                                    <li key={m.materia} className="ficha-actividad">
                                        <div className="ficha-actividad-meta">
                                            <strong>{m.icono} {m.materia}</strong>
                                            <span>{m.completadas} de {m.actividades} completadas · promedio {m.promedio}%</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="ficha-seccion">
                        <h4>Retroalimentación del docente</h4>
                        <div className="ficha-retro-sugerencias">
                            {SUGERENCIAS.map((s) => (
                                <button key={s} type="button" className="ficha-retro-sugerencia" onClick={() => enviarRetro(s)}>
                                    {s}
                                </button>
                            ))}
                        </div>
                        <form
                            className="ficha-retro-form"
                            onSubmit={(ev) => { ev.preventDefault(); enviarRetro(mensaje); }}
                        >
                            <input
                                value={mensaje}
                                onChange={(ev) => setMensaje(ev.target.value)}
                                placeholder="Escribe una observación para este estudiante…"
                                maxLength={400}
                                aria-label="Nueva observación"
                            />
                            <button type="submit" className="upload-mini-btn" disabled={enviando || !mensaje.trim()}>
                                {enviando ? 'Guardando…' : 'Guardar'}
                            </button>
                        </form>
                        {detalle.retroalimentaciones.length > 0 && (
                            <ul className="ficha-retro-lista">
                                {detalle.retroalimentaciones.map((r) => (
                                    <li key={r.id} className="ficha-retro">
                                        <div>
                                            {r.mensaje}
                                            <span className="ficha-retro-meta">
                                                {r.docente} · {formatearFecha(r.creado_en)}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            title="Eliminar observación"
                                            aria-label="Eliminar observación"
                                            onClick={() => borrarRetro(r.id)}
                                        >
                                            ✕
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </>
            )}
        </ModalPanel>
    );
}

export default FichaEstudiante;
