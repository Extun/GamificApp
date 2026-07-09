// Biblioteca de Actividades (SPEC-004): TODO lo creado en las materias del
// docente, en cualquier estado. Buscar, filtrar, ordenar, duplicar, editar
// (descripción/XP), archivar y restaurar. Nada se borra físicamente y lo
// archivado deja de aparecer al estudiante (el servidor ya lo garantiza).
import { useEffect, useMemo, useState } from 'react';
import LocalLibraryRoundedIcon from '@mui/icons-material/LocalLibraryRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import UnarchiveRoundedIcon from '@mui/icons-material/UnarchiveRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import { obtenerRetosGestion, actualizarReto, duplicarReto } from '../../services/retosService';
import {
    SectionCard, EmptyState, ModalPanel, TablaPro, formatearFecha
} from '../../components/dashboard/DashboardWidgets';

const TIPO_LABEL = { quiz: 'Quiz', clasificador: 'Clasificador', mision: 'Misión' };
const TIPO_EMOJI = { quiz: '✨', clasificador: '🧩', mision: '🗺️' };

export function BibliotecaActividades({ onAviso, onError }) {
    const [retos, setRetos] = useState([]);
    const [cargado, setCargado] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('');
    const [filtroMateria, setFiltroMateria] = useState('');
    const [orden, setOrden] = useState('recientes');
    const [editando, setEditando] = useState(null);
    const [descripcion, setDescripcion] = useState('');
    const [xp, setXp] = useState(100);
    const [guardando, setGuardando] = useState(false);

    const cargar = () => obtenerRetosGestion()
        .then(setRetos)
        .catch((err) => onError?.(`No se pudo cargar la Biblioteca: ${err.message}`))
        .finally(() => setCargado(true));

    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
    useEffect(() => { cargar(); }, []);

    const materias = useMemo(
        () => [...new Set(retos.map((r) => r.materia))],
        [retos]
    );

    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        const lista = retos.filter((r) =>
            (!q || `${r.titulo} ${r.materia} ${TIPO_LABEL[r.tipo] || r.tipo}`.toLowerCase().includes(q)) &&
            (!filtroTipo || r.tipo === filtroTipo) &&
            (!filtroEstado || r.estado === filtroEstado) &&
            (!filtroMateria || r.materia === filtroMateria)
        );
        const ordenadores = {
            recientes: (a, b) => new Date(b.creado_en) - new Date(a.creado_en),
            antiguas: (a, b) => new Date(a.creado_en) - new Date(b.creado_en),
            titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'es'),
            jugadas: (a, b) => b.veces_jugado - a.veces_jugado
        };
        return [...lista].sort(ordenadores[orden] || ordenadores.recientes);
    }, [retos, busqueda, filtroTipo, filtroEstado, filtroMateria, orden]);

    const ejecutar = async (accion, mensajeOk) => {
        try {
            await accion();
            onAviso?.(mensajeOk);
            await cargar();
        } catch (err) {
            onError?.(err.message);
        }
    };

    const abrirEdicion = (reto) => {
        setEditando(reto);
        setDescripcion(reto.descripcion || '');
        setXp(reto.xp_recompensa);
    };

    const guardarEdicion = async () => {
        if (!editando) return;
        setGuardando(true);
        await ejecutar(
            () => actualizarReto(editando.id, { descripcion, xp_recompensa: Number(xp) }),
            `"${editando.titulo}" actualizada.`
        );
        setGuardando(false);
        setEditando(null);
    };

    return (
        <SectionCard
            titulo="Todas tus actividades"
            Icon={LocalLibraryRoundedIcon}
            tag={retos.length ? `${retos.length}` : undefined}
        >
            {retos.length > 0 && (
                <div className="bib-filtros">
                    <input
                        type="search"
                        placeholder="Buscar por título, materia o tipo…"
                        aria-label="Buscar actividades"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                    />
                    <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Filtrar por tipo">
                        <option value="">Todos los tipos</option>
                        <option value="quiz">Quiz</option>
                        <option value="clasificador">Clasificador</option>
                        <option value="mision">Misión</option>
                    </select>
                    <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label="Filtrar por estado">
                        <option value="">Todos los estados</option>
                        <option value="publicado">Publicadas</option>
                        <option value="borrador">Borradores</option>
                        <option value="archivado">Archivadas</option>
                    </select>
                    <select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)} aria-label="Filtrar por materia">
                        <option value="">Todas las materias</option>
                        {materias.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar">
                        <option value="recientes">Más recientes</option>
                        <option value="antiguas">Más antiguas</option>
                        <option value="titulo">Título A–Z</option>
                        <option value="jugadas">Más jugadas</option>
                    </select>
                </div>
            )}

            {visibles.length ? (
                <TablaPro
                    filas={visibles}
                    cabecera={
                        <tr>
                            <th>Actividad</th><th>Tipo</th><th>Materia</th><th>Estado</th>
                            <th>XP</th><th>Jugada por</th><th>Creada</th><th>Acciones</th>
                        </tr>
                    }
                    renderFila={(r) => (
                        <tr key={r.id}>
                            <td><strong>{r.titulo}</strong></td>
                            <td>
                                <span className="bib-tipo-chip">
                                    <span aria-hidden="true">{TIPO_EMOJI[r.tipo] || '🎯'}</span>
                                    {TIPO_LABEL[r.tipo] || r.tipo}
                                </span>
                            </td>
                            <td>
                                <span className="docente-chip" style={{ background: r.color || '#e0f2fe' }}>
                                    <span aria-hidden="true">{r.icono || '📚'}</span> {r.materia}
                                </span>
                            </td>
                            <td><span className={`bib-estado bib-estado-${r.estado}`}>{r.estado}</span></td>
                            <td><span className="xp-valor">⭐ {r.xp_recompensa}</span></td>
                            <td>{r.veces_jugado} {r.veces_jugado === 1 ? 'estudiante' : 'estudiantes'}</td>
                            <td>{formatearFecha(r.creado_en)}</td>
                            <td>
                                <div className="admin-acciones">
                                    <button
                                        title="Duplicar (crea una copia en borrador)"
                                        aria-label={`Duplicar "${r.titulo}"`}
                                        onClick={() => ejecutar(() => duplicarReto(r.id), `Copia de "${r.titulo}" creada como borrador.`)}
                                    >
                                        <ContentCopyRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                    </button>
                                    <button
                                        title="Editar descripción y XP"
                                        aria-label={`Editar "${r.titulo}"`}
                                        onClick={() => abrirEdicion(r)}
                                    >
                                        <EditRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                    </button>
                                    {r.estado === 'archivado' ? (
                                        <button
                                            title="Restaurar (vuelve a publicarse)"
                                            aria-label={`Restaurar "${r.titulo}"`}
                                            onClick={() => ejecutar(
                                                () => actualizarReto(r.id, { estado: 'publicado' }),
                                                `"${r.titulo}" restaurada y visible para tus estudiantes.`
                                            )}
                                        >
                                            <UnarchiveRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                        </button>
                                    ) : r.estado === 'borrador' ? (
                                        <button
                                            title="Publicar para tus estudiantes"
                                            aria-label={`Publicar "${r.titulo}"`}
                                            onClick={() => ejecutar(
                                                () => actualizarReto(r.id, { estado: 'publicado' }),
                                                `"${r.titulo}" publicada.`
                                            )}
                                        >
                                            <TaskAltRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                        </button>
                                    ) : (
                                        <button
                                            title="Archivar (los estudiantes dejan de verla; no se borra)"
                                            aria-label={`Archivar "${r.titulo}"`}
                                            className="accion-peligro"
                                            onClick={() => {
                                                if (window.confirm(`¿Archivar "${r.titulo}"? Tus estudiantes dejarán de verla, pero podrás restaurarla cuando quieras.`)) {
                                                    ejecutar(() => actualizarReto(r.id, { estado: 'archivado' }), `"${r.titulo}" archivada.`);
                                                }
                                            }}
                                        >
                                            <Inventory2RoundedIcon sx={{ fontSize: '1.05rem' }} />
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    )}
                />
            ) : cargado && (
                retos.length ? (
                    <p className="tablapro-vacio">Ninguna actividad coincide con los filtros.</p>
                ) : (
                    <EmptyState
                        Icon={LocalLibraryRoundedIcon}
                        titulo="Tu biblioteca está vacía"
                        mensaje="Cuando publiques quizzes, clasificadores o misiones en tus materias, todos quedarán guardados aquí."
                    />
                )
            )}

            {editando && (
                <ModalPanel
                    titulo="Editar actividad"
                    subtitulo={editando.titulo}
                    onCerrar={() => !guardando && setEditando(null)}
                    pie={
                        <>
                            <button type="button" className="preview-action" disabled={guardando} onClick={() => setEditando(null)}>
                                Cancelar
                            </button>
                            <button type="button" className="preview-action preview-action-primary" disabled={guardando} onClick={guardarEdicion}>
                                <TaskAltRoundedIcon />
                                {guardando ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                        </>
                    }
                >
                    <div className="perfil-form">
                        <label>
                            Descripción (los estudiantes la ven junto al título)
                            <input
                                value={descripcion}
                                onChange={(e) => setDescripcion(e.target.value)}
                                placeholder="Ej: Repaso de fracciones para la clase del lunes"
                                maxLength={255}
                            />
                        </label>
                        <label>
                            XP de recompensa
                            <input
                                type="number"
                                min="1"
                                max="100000"
                                value={xp}
                                onChange={(e) => setXp(e.target.value)}
                            />
                        </label>
                        <p className="contenido-sub" style={{ margin: 0 }}>
                            El contenido del juego (preguntas, categorías, historia) se edita
                            desde la materia, para no romper lo que tus estudiantes ya jugaron.
                        </p>
                    </div>
                </ModalPanel>
            )}
        </SectionCard>
    );
}

export default BibliotecaActividades;
