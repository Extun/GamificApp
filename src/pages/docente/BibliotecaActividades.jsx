// Biblioteca de Actividades (SPEC-004 + SPEC-006 «Biblioteca IA»): TODO lo
// creado en las materias del docente, en cualquier estado. Pestañas por estado
// (incluida la Papelera), búsqueda, filtros (tipo, materia, origen ✨IA/manual,
// favoritas, curso, dificultad), orden, y por fila: favorito, vista previa,
// estadísticas reales, adaptar con IA, duplicar, editar, publicar/archivar y
// papelera con restaurar/purgar. Con `materiaId` se convierte en la pestaña
// «Actividades» de una materia (pre-filtrada, sin selector de materia).
import { useEffect, useMemo, useState } from 'react';
import LocalLibraryRoundedIcon from '@mui/icons-material/LocalLibraryRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import UnarchiveRoundedIcon from '@mui/icons-material/UnarchiveRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import RestoreFromTrashRoundedIcon from '@mui/icons-material/RestoreFromTrashRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import {
    obtenerRetosGestion, actualizarReto, duplicarReto, eliminarReto,
    restaurarReto, purgarReto, estadisticasReto, obtenerRetoDetalle
} from '../../services/retosService';
import { adaptarActividadIA } from '../../services/iaService';
import docenteService from '../../services/docenteService';
import { TIPOS_ACTIVIDAD, etiquetaTipo, emojiTipo, obtenerJuego } from '../../components/juegos/registro';
import { DIFICULTADES_UI } from '../../components/juegos/GeneradorActividadIA';
import {
    SectionCard, EmptyState, ModalPanel, TablaPro, StatCard, formatearFecha
} from '../../components/dashboard/DashboardWidgets';
import { useConfirmacion } from '../../hooks/useConfirmacion';

const DIFICULTAD_LABEL = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };

const PESTANAS = [
    ['todas', 'Todas'],
    ['borrador', 'Borradores'],
    ['publicado', 'Publicadas'],
    ['archivado', 'Archivadas'],
    ['papelera', '🗑 Papelera']
];

// Configuración renderizada en modo lectura para la vista previa.
// SPEC-017: cada tipo aporta su propia `VistaLectura` desde el registro, así
// que agregar un juego nuevo no toca este archivo (antes: cadena de 6 `if`).
function VistaPreviaConfig({ tipo, config }) {
    if (!config) return <p className="vacio-msg">Esta actividad no tiene contenido guardado.</p>;
    const Vista = obtenerJuego(tipo)?.VistaLectura;
    if (Vista) return <Vista config={config} />;
    return <pre className="bib-preview-json">{JSON.stringify(config, null, 2)}</pre>;
}

export function BibliotecaActividades({ onAviso, onError, materiaId = null }) {
    const { pedirConfirmacion, dialogoConfirmacion } = useConfirmacion();
    const [retos, setRetos] = useState([]);
    const [cargado, setCargado] = useState(false);
    const [pestana, setPestana] = useState('todas');
    const [busqueda, setBusqueda] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('');
    const [filtroMateria, setFiltroMateria] = useState('');
    const [filtroOrigen, setFiltroOrigen] = useState('');
    const [filtroCurso, setFiltroCurso] = useState('');
    const [filtroDificultad, setFiltroDificultad] = useState('');
    const [soloFavoritas, setSoloFavoritas] = useState(false);
    const [orden, setOrden] = useState('recientes');

    const [editando, setEditando] = useState(null);
    const [descripcion, setDescripcion] = useState('');
    const [xp, setXp] = useState(100);
    const [guardando, setGuardando] = useState(false);

    // Modales SPEC-006
    const [preview, setPreview] = useState(null);         // { reto, detalle }
    const [stats, setStats] = useState(null);             // respuesta de /estadisticas
    const [adaptando, setAdaptando] = useState(null);     // reto a adaptar
    const [adaptarCambios, setAdaptarCambios] = useState({});
    const [adaptarCargando, setAdaptarCargando] = useState(false);
    const [misMaterias, setMisMaterias] = useState([]);
    const [cursos, setCursos] = useState([]);

    const enPapelera = pestana === 'papelera';

    const cargar = (papelera = enPapelera) => obtenerRetosGestion({ papelera })
        .then(setRetos)
        .catch((err) => onError?.(`No se pudo cargar la Biblioteca: ${err.message}`))
        .finally(() => setCargado(true));

    useEffect(() => {
        cargar(enPapelera);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- recarga al cambiar de pestaña viva/papelera
    }, [enPapelera]);

    useEffect(() => {
        docenteService.misMaterias().then(setMisMaterias).catch(() => setMisMaterias([]));
        docenteService.listarCursos().then(setCursos).catch(() => setCursos([]));
    }, []);

    const materias = useMemo(
        () => [...new Set(retos.map((r) => r.materia))],
        [retos]
    );
    const tiposPresentes = useMemo(
        () => [...new Set(retos.map((r) => r.tipo))],
        [retos]
    );

    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        const lista = retos.filter((r) =>
            (!materiaId || r.materia_id === materiaId) &&
            (enPapelera || pestana === 'todas' || r.estado === pestana) &&
            (!q || `${r.titulo} ${r.materia} ${etiquetaTipo(r.tipo)}`.toLowerCase().includes(q)) &&
            (!filtroTipo || r.tipo === filtroTipo) &&
            (!filtroMateria || r.materia === filtroMateria) &&
            (!filtroOrigen || r.origen === filtroOrigen) &&
            (!filtroCurso || String(r.curso_id) === filtroCurso) &&
            (!filtroDificultad || r.dificultad === filtroDificultad) &&
            (!soloFavoritas || r.favorito)
        );
        const ordenadores = {
            recientes: (a, b) => new Date(b.creado_en) - new Date(a.creado_en),
            antiguas: (a, b) => new Date(a.creado_en) - new Date(b.creado_en),
            titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'es'),
            jugadas: (a, b) => b.veces_jugado - a.veces_jugado
        };
        return [...lista].sort(ordenadores[orden] || ordenadores.recientes);
    }, [retos, materiaId, enPapelera, pestana, busqueda, filtroTipo, filtroMateria,
        filtroOrigen, filtroCurso, filtroDificultad, soloFavoritas, orden]);

    const ejecutar = async (accion, mensajeOk) => {
        try {
            await accion();
            if (mensajeOk) onAviso?.(mensajeOk);
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

    const abrirPreview = async (reto) => {
        setPreview({ reto, detalle: null });
        try {
            const detalle = await obtenerRetoDetalle(reto.id);
            setPreview({ reto, detalle });
        } catch (err) {
            setPreview(null);
            onError?.(`No se pudo abrir la vista previa: ${err.message}`);
        }
    };

    const abrirStats = async (reto) => {
        try {
            setStats(await estadisticasReto(reto.id));
        } catch (err) {
            onError?.(`No se pudieron cargar las estadísticas: ${err.message}`);
        }
    };

    const abrirAdaptar = (reto) => {
        setAdaptando(reto);
        setAdaptarCambios({});
    };

    const confirmarAdaptar = async () => {
        const cambios = Object.fromEntries(
            Object.entries(adaptarCambios).filter(([, v]) => v !== '' && v !== undefined)
        );
        if (!Object.keys(cambios).length) {
            onError?.('Indica al menos un cambio para adaptar la actividad.');
            return;
        }
        setAdaptarCargando(true);
        try {
            const { reto } = await adaptarActividadIA(adaptando.id, {
                ...cambios,
                materia_id: cambios.materia_id ? Number(cambios.materia_id) : undefined,
                curso_id: cambios.curso_id ? Number(cambios.curso_id) : undefined
            });
            onAviso?.(`Adaptación creada como borrador: «${reto.titulo}».`);
            setAdaptando(null);
            await cargar();
        } catch (err) {
            onError?.(`No se pudo adaptar: ${err.message}`);
        } finally {
            setAdaptarCargando(false);
        }
    };

    return (
        <SectionCard
            titulo={materiaId ? 'Actividades de la materia' : 'Todas tus actividades'}
            Icon={LocalLibraryRoundedIcon}
            tag={visibles.length ? `${visibles.length}` : undefined}
        >
            <nav className="doc-tabs bib-tabs" aria-label="Estado de las actividades">
                {PESTANAS.map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        className={`doc-tab doc-tab-mini ${pestana === id ? 'doc-tab-activa' : ''}`}
                        onClick={() => setPestana(id)}
                    >
                        {label}
                    </button>
                ))}
            </nav>

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
                    {Object.keys(TIPOS_ACTIVIDAD)
                        .filter((t) => tiposPresentes.includes(t) || !cargado)
                        .map((t) => <option key={t} value={t}>{etiquetaTipo(t)}</option>)}
                </select>
                {!materiaId && (
                    <select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)} aria-label="Filtrar por materia">
                        <option value="">Todas las materias</option>
                        {materias.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                )}
                <select value={filtroOrigen} onChange={(e) => setFiltroOrigen(e.target.value)} aria-label="Filtrar por origen">
                    <option value="">IA y manuales</option>
                    <option value="ia">✨ Generadas con IA</option>
                    <option value="manual">Manuales</option>
                </select>
                <select value={filtroCurso} onChange={(e) => setFiltroCurso(e.target.value)} aria-label="Filtrar por curso">
                    <option value="">Todos los cursos</option>
                    {cursos.map((c) => <option key={c.id} value={String(c.id)}>{c.etiqueta}</option>)}
                </select>
                <select value={filtroDificultad} onChange={(e) => setFiltroDificultad(e.target.value)} aria-label="Filtrar por dificultad">
                    <option value="">Cualquier dificultad</option>
                    {DIFICULTADES_UI.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar">
                    <option value="recientes">Más recientes</option>
                    <option value="antiguas">Más antiguas</option>
                    <option value="titulo">Título A–Z</option>
                    <option value="jugadas">Más utilizadas</option>
                </select>
                <label className="bib-fav-filtro">
                    <input
                        type="checkbox"
                        checked={soloFavoritas}
                        onChange={(e) => setSoloFavoritas(e.target.checked)}
                    />
                    ⭐ Solo favoritas
                </label>
            </div>

            {visibles.length ? (
                <TablaPro
                    filas={visibles}
                    cabecera={
                        <tr>
                            <th aria-label="Favorita" />
                            <th>Actividad</th><th>Tipo</th>
                            {!materiaId && <th>Materia</th>}
                            <th>Estado</th><th>Dificultad</th>
                            <th>XP</th><th>Jugada por</th><th>Creada</th><th>Acciones</th>
                        </tr>
                    }
                    renderFila={(r) => (
                        <tr key={r.id}>
                            <td>
                                <button
                                    type="button"
                                    className="bib-fav-btn"
                                    title={r.favorito ? 'Quitar de favoritas' : 'Marcar como favorita'}
                                    aria-label={`${r.favorito ? 'Quitar de favoritas' : 'Marcar como favorita'} "${r.titulo}"`}
                                    disabled={enPapelera}
                                    onClick={() => ejecutar(() => actualizarReto(r.id, { favorito: !r.favorito }))}
                                >
                                    {r.favorito
                                        ? <StarRoundedIcon sx={{ fontSize: '1.2rem', color: '#f59e0b' }} />
                                        : <StarBorderRoundedIcon sx={{ fontSize: '1.2rem' }} />}
                                </button>
                            </td>
                            <td>
                                <strong>{r.titulo}</strong>
                                {r.origen === 'ia' && <span className="bib-origen-ia" title="Generada con IA"> ✨</span>}
                            </td>
                            <td>
                                <span className="bib-tipo-chip">
                                    <span aria-hidden="true">{emojiTipo(r.tipo)}</span>
                                    {etiquetaTipo(r.tipo)}
                                </span>
                            </td>
                            {!materiaId && (
                                <td>
                                    <span className="docente-chip" style={{ background: r.color || '#e0f2fe' }}>
                                        <span aria-hidden="true">{r.icono || '📚'}</span> {r.materia}
                                    </span>
                                </td>
                            )}
                            <td><span className={`bib-estado bib-estado-${r.estado}`}>{r.estado}</span></td>
                            <td>{DIFICULTAD_LABEL[r.dificultad] || '—'}</td>
                            <td><span className="xp-valor">⭐ {r.xp_recompensa}</span></td>
                            <td>{r.veces_jugado} {r.veces_jugado === 1 ? 'estudiante' : 'estudiantes'}</td>
                            <td>{formatearFecha(r.creado_en)}</td>
                            <td>
                                <div className="admin-acciones">
                                    <button
                                        title="Vista previa del contenido"
                                        aria-label={`Vista previa de "${r.titulo}"`}
                                        onClick={() => abrirPreview(r)}
                                    >
                                        <VisibilityRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                    </button>
                                    <button
                                        title="Estadísticas reales de la actividad"
                                        aria-label={`Estadísticas de "${r.titulo}"`}
                                        onClick={() => abrirStats(r)}
                                    >
                                        <QueryStatsRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                    </button>
                                    {enPapelera ? (
                                        <>
                                            <button
                                                title="Restaurar (vuelve con su estado anterior)"
                                                aria-label={`Restaurar "${r.titulo}"`}
                                                onClick={() => ejecutar(() => restaurarReto(r.id), `"${r.titulo}" restaurada.`)}
                                            >
                                                <RestoreFromTrashRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                            </button>
                                            <button
                                                title="Eliminar definitivamente (solo si nadie la jugó)"
                                                aria-label={`Eliminar definitivamente "${r.titulo}"`}
                                                className="accion-peligro"
                                                onClick={() => pedirConfirmacion({
                                                    titulo: 'Eliminar definitivamente',
                                                    mensaje: `¿Eliminar DEFINITIVAMENTE "${r.titulo}"? Esta acción no se puede deshacer.`,
                                                    confirmarTexto: 'Eliminar para siempre',
                                                    variante: 'danger',
                                                    accion: () => ejecutar(() => purgarReto(r.id), `"${r.titulo}" eliminada definitivamente.`)
                                                })}
                                            >
                                                <DeleteOutlineRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                title="Adaptar con IA (otra materia, curso, dificultad o temática)"
                                                aria-label={`Adaptar con IA "${r.titulo}"`}
                                                onClick={() => abrirAdaptar(r)}
                                            >
                                                <AutoAwesomeRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                            </button>
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
                                                    onClick={() => pedirConfirmacion({
                                                        titulo: 'Archivar actividad',
                                                        mensaje: `¿Archivar "${r.titulo}"? Tus estudiantes dejarán de verla, pero podrás restaurarla cuando quieras.`,
                                                        confirmarTexto: 'Archivar',
                                                        variante: 'warning',
                                                        accion: () => ejecutar(() => actualizarReto(r.id, { estado: 'archivado' }), `"${r.titulo}" archivada.`)
                                                    })}
                                                >
                                                    <Inventory2RoundedIcon sx={{ fontSize: '1.05rem' }} />
                                                </button>
                                            )}
                                            <button
                                                title="Enviar a la papelera (podrás restaurarla)"
                                                aria-label={`Enviar a la papelera "${r.titulo}"`}
                                                className="accion-peligro"
                                                onClick={() => pedirConfirmacion({
                                                    titulo: 'Enviar a la papelera',
                                                    mensaje: `¿Enviar "${r.titulo}" a la papelera? El progreso de tus estudiantes se conserva y podrás restaurarla.`,
                                                    confirmarTexto: 'Enviar a la papelera',
                                                    variante: 'danger',
                                                    accion: () => ejecutar(() => eliminarReto(r.id), `"${r.titulo}" enviada a la papelera.`)
                                                })}
                                            >
                                                <DeleteOutlineRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                            </button>
                                        </>
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
                        titulo={enPapelera ? 'La papelera está vacía' : 'Tu biblioteca está vacía'}
                        mensaje={enPapelera
                            ? 'Las actividades que envíes a la papelera aparecerán aquí para restaurarlas.'
                            : 'Cuando crees actividades en tus materias, todas quedarán guardadas aquí.'}
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

            {preview && (
                <ModalPanel
                    titulo={`${emojiTipo(preview.reto.tipo)} ${preview.reto.titulo}`}
                    subtitulo={`${etiquetaTipo(preview.reto.tipo)} · ${preview.reto.materia} · ${preview.reto.estado}`}
                    onCerrar={() => setPreview(null)}
                >
                    {preview.detalle
                        ? <VistaPreviaConfig tipo={preview.reto.tipo} config={preview.detalle.configuracion} />
                        : <p className="vacio-msg">Cargando contenido…</p>}
                </ModalPanel>
            )}

            {stats && (
                <ModalPanel
                    titulo={`📊 ${stats.reto.titulo}`}
                    subtitulo={`${etiquetaTipo(stats.reto.tipo)} · ${stats.reto.materia} · ${stats.reto.estado}`}
                    onCerrar={() => setStats(null)}
                >
                    {stats.estadisticas.intentos > 0 ? (
                        <>
                            <div className="stats-grid bib-stats-grid">
                                <StatCard valor={stats.estadisticas.intentos} etiqueta="Estudiantes que la jugaron" />
                                <StatCard valor={stats.estadisticas.completados} etiqueta="La completaron" tono="accent" />
                                <StatCard valor={stats.estadisticas.promedio !== null ? `${stats.estadisticas.promedio}%` : '—'} etiqueta="Promedio de aciertos" tono="gold" />
                                <StatCard valor={stats.estadisticas.perfectos} etiqueta="Puntajes perfectos" tono="fire" />
                                <StatCard valor={stats.estadisticas.xp_entregada} etiqueta="XP entregada en total" />
                                <StatCard
                                    valor={stats.estadisticas.mejor !== null ? `${stats.estadisticas.peor}% – ${stats.estadisticas.mejor}%` : '—'}
                                    etiqueta="Peor y mejor resultado"
                                    tono="accent"
                                />
                            </div>
                            <p className="contenido-sub" style={{ marginBottom: 0 }}>
                                Primer intento: {formatearFecha(stats.estadisticas.primer_intento)} ·
                                Último: {formatearFecha(stats.estadisticas.ultimo_intento)}
                            </p>
                        </>
                    ) : (
                        <EmptyState
                            Icon={QueryStatsRoundedIcon}
                            titulo="Todavía nadie la ha jugado"
                            mensaje="Cuando tus estudiantes la completen, aquí verás intentos, promedio y XP entregada, con datos reales."
                        />
                    )}
                </ModalPanel>
            )}

            {adaptando && (
                <ModalPanel
                    titulo={`✨ Adaptar con IA`}
                    subtitulo={`${adaptando.titulo} · la actividad original no se toca; la adaptación se guarda como borrador`}
                    onCerrar={() => !adaptarCargando && setAdaptando(null)}
                    pie={
                        <>
                            <button type="button" className="preview-action" disabled={adaptarCargando} onClick={() => setAdaptando(null)}>
                                Cancelar
                            </button>
                            <button type="button" className="preview-action preview-action-primary" disabled={adaptarCargando} onClick={confirmarAdaptar}>
                                <AutoAwesomeRoundedIcon />
                                {adaptarCargando ? 'Adaptando…' : 'Adaptar y guardar borrador'}
                            </button>
                        </>
                    }
                >
                    <div className="perfil-form">
                        <label>
                            Materia destino (opcional)
                            <select
                                value={adaptarCambios.materia_id || ''}
                                onChange={(e) => setAdaptarCambios((p) => ({ ...p, materia_id: e.target.value }))}
                            >
                                <option value="">Mantener {adaptando.materia}</option>
                                {misMaterias.filter((m) => m.id !== adaptando.materia_id).map((m) => (
                                    <option key={m.id} value={m.id}>{m.nombre}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Curso destino (opcional)
                            <select
                                value={adaptarCambios.curso_id || ''}
                                onChange={(e) => setAdaptarCambios((p) => ({ ...p, curso_id: e.target.value }))}
                            >
                                <option value="">Mantener curso</option>
                                {cursos.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
                            </select>
                        </label>
                        <label>
                            Dificultad (opcional)
                            <select
                                value={adaptarCambios.dificultad || ''}
                                onChange={(e) => setAdaptarCambios((p) => ({ ...p, dificultad: e.target.value }))}
                            >
                                <option value="">Mantener dificultad</option>
                                {DIFICULTADES_UI.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                            </select>
                        </label>
                        <label>
                            Nueva temática o ambientación (opcional)
                            <input
                                value={adaptarCambios.tematica || ''}
                                onChange={(e) => setAdaptarCambios((p) => ({ ...p, tematica: e.target.value }))}
                                placeholder="Ej. piratas, espacio, dinosaurios…"
                                maxLength={60}
                            />
                        </label>
                        <label>
                            Nuevo tema (opcional)
                            <input
                                value={adaptarCambios.tema || ''}
                                onChange={(e) => setAdaptarCambios((p) => ({ ...p, tema: e.target.value }))}
                                placeholder="Ej. Multiplicaciones por 2 cifras"
                                maxLength={200}
                            />
                        </label>
                        <p className="contenido-sub" style={{ margin: 0 }}>
                            La IA mantiene el formato del juego y transforma el contenido según lo que elijas.
                        </p>
                    </div>
                </ModalPanel>
            )}

            {dialogoConfirmacion}
        </SectionCard>
    );
}

export default BibliotecaActividades;
