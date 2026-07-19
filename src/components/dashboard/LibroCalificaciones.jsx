// Libro de Calificaciones (SPEC-006, Fase 7) — deja de ser una tabla de solo
// lectura: cada intento (estudiante × actividad) se puede abrir en detalle para
// editar la observación, marcarlo como revisado y ajustar la XP manualmente.
// El ajuste de XP reutiliza POST /api/progreso (transaccional e idempotente:
// solo abona mejoras, nunca duplica) y todo cambio queda en Auditoría.
// "Recalcular" = volver a consultar la API: el cálculo siempre vive en el servidor.
import { useEffect, useState } from 'react';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { authFetch } from '../../services/authService';
import { misEstudiantes } from '../../services/docenteService';
import { EmptyState, ModalPanel, TablaPro, formatearFecha } from './DashboardWidgets';
import { retroalimentacionDe } from '../juegos/calificacion';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const pedirJson = async (ruta, options = {}) => {
    const res = await authFetch(`${API_URL}${ruta}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
};

export function LibroCalificaciones({ materia }) {
    const [filas, setFilas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    // Intento abierto en detalle + campos editables del modal.
    const [detalle, setDetalle] = useState(null);
    const [observacion, setObservacion] = useState('');
    const [revisado, setRevisado] = useState(false);
    const [xpManual, setXpManual] = useState('');
    const [guardando, setGuardando] = useState(false);

    const cargar = async () => {
        setCargando(true);
        setError('');
        try {
            const estudiantes = await misEstudiantes();
            // Se consulta el progreso de cada estudiante con authFetch directo
            // (no gamificationService.obtenerProgreso) para no pisar la caché
            // local de XP del navegador del docente.
            const porEstudiante = await Promise.all(
                (estudiantes || []).map(async (est) => {
                    const res = await authFetch(`${API_URL}/api/progreso/${est.estudiante_id}`);
                    if (!res.ok) return [];
                    const data = await res.json();
                    return (data?.progreso || [])
                        .filter((p) => p.materia === materia)
                        .map((p) => ({ ...p, estudiante: est.nombre_completo, estudiante_id: est.estudiante_id }));
                })
            );
            setFilas(porEstudiante.flat());
        } catch (err) {
            console.warn('No se pudo cargar el libro de calificaciones:', err.message);
            setError('No se pudo cargar la información. Revisa tu conexión e inténtalo de nuevo.');
        } finally {
            setCargando(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarga al cambiar de materia
    useEffect(() => { cargar(); }, [materia]);

    const abrirDetalle = (fila) => {
        setDetalle(fila);
        setObservacion(fila.observacion || '');
        setRevisado(Boolean(fila.revisado));
        setXpManual('');
        setAviso('');
    };

    const guardarDetalle = async () => {
        if (!detalle || guardando) return;
        setGuardando(true);
        setError('');
        try {
            // 1) Observación + revisado (PATCH; queda en Auditoría).
            await pedirJson(`/api/progreso/${detalle.estudiante_id}/${detalle.reto_id}`, {
                method: 'PATCH',
                body: JSON.stringify({ observacion: observacion.trim() || null, revisado })
            });
            // 2) Ajuste manual de XP (opcional): reutiliza la transacción
            // idempotente — solo abona la mejora respecto a lo ya obtenido.
            const xp = Number(xpManual);
            if (xpManual !== '' && Number.isInteger(xp) && xp >= 0) {
                await pedirJson('/api/progreso', {
                    method: 'POST',
                    body: JSON.stringify({
                        estudiante_id: detalle.estudiante_id,
                        reto_id: detalle.reto_id,
                        puntos_obtenidos: xp
                    })
                });
            }
            setDetalle(null);
            setAviso(`Registro de ${detalle.estudiante} actualizado.`);
            await cargar();
        } catch (err) {
            setError(`No se pudo guardar: ${err.message}`);
        } finally {
            setGuardando(false);
        }
    };

    if (cargando) return <p className="libro-estado">Cargando calificaciones…</p>;

    return (
        <div className="libro-calif">
            {error && <p className="libro-estado" role="alert">{error}</p>}
            {aviso && (
                <div className="admin-aviso-ok" role="status">
                    <p>{aviso}</p>
                    <button onClick={() => setAviso('')}>OK</button>
                </div>
            )}

            {filas.length ? (
                <>
                    <div className="libro-toolbar">
                        <button type="button" className="section-accion" onClick={cargar}>
                            <RefreshRoundedIcon sx={{ fontSize: '1rem', verticalAlign: 'middle' }} /> Recalcular
                        </button>
                    </div>
                    <TablaPro
                        filas={filas}
                        buscar={(f) => `${f.estudiante} ${f.reto}`}
                        placeholderBusqueda="Buscar estudiante o actividad…"
                        cabecera={
                            <tr>
                                <th>Estudiante</th>
                                <th>Actividad</th>
                                <th>Estado</th>
                                <th>Calificación</th>
                                <th>XP obtenida</th>
                                <th>Revisión</th>
                                <th>Fecha</th>
                                <th>Acciones</th>
                            </tr>
                        }
                        renderFila={(f) => (
                            <tr key={`${f.reto_id}-${f.estudiante_id}`}>
                                <td>{f.estudiante}</td>
                                <td>
                                    {f.reto}
                                    {f.observacion && <span title={f.observacion}> 💬</span>}
                                </td>
                                <td>{f.completado ? 'Completado' : 'En progreso'}</td>
                                {/* Calificación académica real (SPEC-015): la calcula
                                    el servidor con aciertos/total, independiente del XP.
                                    Filas anteriores a la migración: `porcentaje`. */}
                                <td title="Mejor calificación del estudiante en esta actividad">
                                    {retroalimentacionDe(f.calificacion ?? f.porcentaje).emoji}{' '}
                                    <strong>{f.calificacion ?? f.porcentaje} / 100</strong>
                                </td>
                                <td>{f.xp_obtenido} / {f.xp_recompensa} XP</td>
                                <td>
                                    <span className={`bib-estado ${f.revisado ? 'bib-estado-publicado' : 'bib-estado-borrador'}`}>
                                        {f.revisado ? 'Revisado' : 'Pendiente'}
                                    </span>
                                </td>
                                <td>{formatearFecha(f.actualizado_en)}</td>
                                <td>
                                    <div className="admin-acciones">
                                        <button
                                            title="Ver detalle y editar"
                                            aria-label={`Ver detalle de ${f.estudiante} en "${f.reto}"`}
                                            onClick={() => abrirDetalle(f)}
                                        >
                                            <VisibilityRoundedIcon sx={{ fontSize: '1.05rem' }} /> Detalle
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}
                    />
                </>
            ) : !error && (
                <EmptyState
                    Icon={MenuBookIcon}
                    titulo="Aún no hay actividades completadas"
                    mensaje={`Cuando tus estudiantes completen retos de ${materia}, sus resultados aparecerán aquí.`}
                />
            )}

            {detalle && (
                <ModalPanel
                    titulo={detalle.estudiante}
                    subtitulo={`${detalle.reto} · Calificación ${detalle.calificacion ?? detalle.porcentaje}/100 (mejor resultado) · ${detalle.xp_obtenido} XP`}
                    onCerrar={() => !guardando && setDetalle(null)}
                    pie={
                        <>
                            <button type="button" className="preview-action" disabled={guardando} onClick={() => setDetalle(null)}>
                                Cancelar
                            </button>
                            <button type="button" className="preview-action preview-action-primary" disabled={guardando} onClick={guardarDetalle}>
                                <TaskAltRoundedIcon />
                                {guardando ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                        </>
                    }
                >
                    <div className="perfil-form">
                        <label>
                            Observación o comentario (solo lo ves tú)
                            <input
                                value={observacion}
                                onChange={(e) => setObservacion(e.target.value)}
                                placeholder="Ej. Mejoró mucho respecto al primer intento"
                                maxLength={400}
                            />
                        </label>
                        <label className="bib-fav-filtro">
                            <input
                                type="checkbox"
                                checked={revisado}
                                onChange={(e) => setRevisado(e.target.checked)}
                            />
                            Marcar como revisado
                        </label>
                        <label>
                            Ajustar XP de este intento (opcional, máx. {detalle.xp_recompensa})
                            <input
                                type="number"
                                min="0"
                                max={detalle.xp_recompensa}
                                value={xpManual}
                                onChange={(e) => setXpManual(e.target.value)}
                                placeholder={`Actual: ${detalle.xp_obtenido} XP`}
                            />
                        </label>
                        <p className="contenido-sub" style={{ margin: 0 }}>
                            El ajuste de XP solo abona mejoras (nunca resta ni duplica) y queda
                            registrado en la auditoría de la institución.
                        </p>
                    </div>
                </ModalPanel>
            )}
        </div>
    );
}

export default LibroCalificaciones;
