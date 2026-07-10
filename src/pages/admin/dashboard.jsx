import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './dashboard.css';
import './adminDashboard.css';
import '../docente/docentePanel.css';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import HomeFilledIcon from '@mui/icons-material/HomeFilled';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import VpnKeyRoundedIcon from '@mui/icons-material/VpnKeyRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { FileChip, FilePreviewModal, getKind, formatSize, descargarArchivo } from '../../components/archivos/ArchivoChip';
import { procesarPdf } from '../../services/pdfService';
import { listarMaterias, idPorNombre, uiMateria } from '../../services/materiasService';
import { getInstitucionCache } from '../../services/institucionService';
import { obtenerMaterial, subirMaterial, eliminarMaterial } from '../../services/materialesService';
import authService from '../../services/authService';
import docenteService from '../../services/docenteService';
import { obtenerRanking } from '../../services/gamificationService';
import { obtenerRetosPublicados } from '../../services/retosService';
import {
    EmptyState,
    SectionCard,
    DashboardHeader,
    formatearFecha
} from '../../components/dashboard/DashboardWidgets';
import LocalLibraryRoundedIcon from '@mui/icons-material/LocalLibraryRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { BibliotecaActividades } from '../docente/BibliotecaActividades';
import { RankingCompleto } from '../docente/RankingCompleto';
import { PerfilDocente } from '../docente/PerfilDocente';
import { FichaEstudiante } from '../docente/FichaEstudiante';

const TIPO_RETO_LABEL = { quiz: 'Quiz', clasificador: 'Juego', mision: 'Misión' };

const materiaIdPorNombre = (nombre) => idPorNombre(nombre);

const leerComoDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

import { GeneradorQuiz } from './GeneradorQuiz';
import { GeneradorMision } from './GeneradorMision';
import { EditorClasificador } from '../../components/clasificador/EditorClasificador';
import { GeneradorActividadIA } from '../../components/juegos/GeneradorActividadIA';
import { actividadSorpresa } from '../../services/iaService';
import { LibroCalificaciones } from '../../components/dashboard/LibroCalificaciones';
import { Grid, Card } from '@mui/material';
import { SidebarLayout } from '../../components/dashboard/SidebarLayout';

function WidgetsRendimiento({ materia, topEstudiantes, retosPublicados, siguientePaso, onAccion }) {
    return (
        <Grid container spacing={2.5} className="widgets-rendimiento">
            <Grid size={{ xs: 12, md: 4 }}>
                <Card elevation={0} className="widget-card">
                    <div className="widget-head">
                        <span className="widget-icon widget-icon-gold"><WorkspacePremiumRoundedIcon /></span>
                        <h4>Top estudiantes</h4>
                    </div>
                    <ol className="widget-rank">
                        {topEstudiantes.slice(0, 3).map((est, i) => (
                            <li key={i} className="widget-rank-item">
                                <span className={`rank-pos rank-pos-${i + 1}`}>{i + 1}</span>
                                <span className="widget-rank-name">{est.nombre}</span>
                                <span className="widget-rank-points">{est.puntos} pts</span>
                            </li>
                        ))}
                    </ol>
                </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
                <Card elevation={0} className="widget-card widget-card-center">
                    <div className="widget-head">
                        <span className="widget-icon widget-icon-primary"><TrendingUpRoundedIcon /></span>
                        <h4>Retos publicados</h4>
                    </div>
                    <span className="widget-numero">{retosPublicados}</span>
                    <p className="widget-progress-sub">Actividades disponibles en {materia}</p>
                </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
                <Card elevation={0} className="widget-card widget-card-action">
                    <div className="widget-head">
                        <span className="widget-icon widget-icon-accent"><AutoAwesomeRoundedIcon /></span>
                        <h4>Siguiente paso</h4>
                    </div>
                    <p className="widget-action-text">{siguientePaso.descripcion}</p>
                    <button className="widget-action-btn" onClick={() => onAccion(siguientePaso.destino)}>
                        {siguientePaso.label}
                        <ArrowForwardRoundedIcon sx={{ fontSize: '1.1rem' }} />
                    </button>
                </Card>
            </Grid>
        </Grid>
    );
}

function MaterialContenedor({ titulo, subtitulo, Icon, vacioMsg, archivos, isPrivate, onUpload, onPreview }) {
    const inputRef = useRef(null);
    const [subiendo, setSubiendo] = useState(false);

    const handleChange = async (e) => {
        const file = e.target.files?.[0];
        if (inputRef.current) inputRef.current.value = "";
        if (!file) return;
        setSubiendo(true);
        try {
            await onUpload(file, { isPrivate });
        } finally {
            setSubiendo(false);
        }
    };

    return (
        <section className={`card material-cont ${isPrivate ? 'material-cont-privado' : ''}`}>
            <div className="card-head material-cont-head">
                <div className="material-cont-title">
                    <span className={`material-cont-icon ${isPrivate ? 'is-privado' : 'is-publico'}`}>
                        <Icon />
                    </span>
                    <div>
                        <h3>{titulo}</h3>
                        <span className="material-cont-sub">{subtitulo}</span>
                    </div>
                </div>
                <button
                    className="upload-mini-btn"
                    onClick={() => inputRef.current?.click()}
                    disabled={subiendo}
                >
                    <AddRoundedIcon sx={{ fontSize: '1.1rem' }} />
                    {subiendo ? 'Subiendo…' : 'Subir archivo'}
                </button>
                <input ref={inputRef} type="file" hidden onChange={handleChange} />
            </div>

            {archivos.length > 0 ? (
                <div className="file-chip-grid">
                    {archivos.map((archivo) => (
                        <FileChip
                            key={archivo.id}
                            archivo={archivo}
                            onClick={() => onPreview(archivo)}
                        />
                    ))}
                </div>
            ) : (
                <p className="vacio-msg">{vacioMsg}</p>
            )}
        </section>
    );
}

export function Dashboard() {

    const navigate = useNavigate();
    const [pagina, setPagina] = useState("");
    const [materiaSeleccionada, setMateriaSeleccionada] = useState(null);
    const [subVistaMateria, setSubVistaMateria] = useState('quiz');
    const [archivosPorMateria, setArchivosPorMateria] = useState({});
    const [archivoPreview, setArchivoPreview] = useState(null);
    const [errorMaterial, setErrorMaterial] = useState('');

    const refrescarMaterial = async (materia) => {
        const materiaId = materiaIdPorNombre(materia);
        if (!materiaId) return;
        const archivos = await obtenerMaterial(materiaId);
        setArchivosPorMateria((prev) => ({ ...prev, [materia]: archivos }));
    };

    useEffect(() => {
        if (materiaSeleccionada) refrescarMaterial(materiaSeleccionada);
    }, [materiaSeleccionada]);

    const [materias, setMaterias] = useState([]);
    useEffect(() => {
        listarMaterias()
            .catch(() => [])
            .then(() => docenteService.misMaterias())
            .then((lista) => setMaterias((prev) => {
                const nombres = lista.map((m) => m.nombre);
                // Misma referencia si nada cambió, para no re-disparar los
                // efectos que dependen de `materias` en cada navegación.
                return JSON.stringify(prev) === JSON.stringify(nombres) ? prev : nombres;
            }))
            .catch((err) => setErrorMaterial(`No se pudieron cargar tus materias: ${err.message}`));
        // Depende de `pagina`: al cambiar de sección se re-consulta la BD,
        // así una materia recién asignada por el admin aparece sin recargar.
    }, [pagina]);

    const [misEstudiantes, setMisEstudiantes] = useState([]);
    const [invitaciones, setInvitaciones] = useState([]);
    const [codigosNuevos, setCodigosNuevos] = useState([]);
    const [cursos, setCursos] = useState([]);
    const [invCursoId, setInvCursoId] = useState('');
    const [invCantidad, setInvCantidad] = useState(10);
    const [avisoOk, setAvisoOk] = useState('');

    const cargarEstudiantes = async () => {
        try {
            const [est, inv, cur] = await Promise.all([
                docenteService.misEstudiantes(),
                docenteService.listarInvitaciones(),
                docenteService.listarCursos()
            ]);
            setMisEstudiantes(est);
            setInvitaciones(inv);
            setCursos(cur);
        } catch (err) {
            setErrorMaterial(err.message);
        }
    };

    useEffect(() => {
        cargarEstudiantes();
    }, []);

    useEffect(() => {
        if (pagina === 'estudiantes') cargarEstudiantes();
    }, [pagina]);

    const [retosPorMateria, setRetosPorMateria] = useState({});
    useEffect(() => {
        if (!materias.length) return;
        let vigente = true;
        Promise.all(materias.map(async (nombre) => {
            const materiaId = materiaIdPorNombre(nombre);
            const retos = materiaId ? await obtenerRetosPublicados({ materiaId }) : [];
            return [nombre, retos];
        })).then((pares) => {
            if (vigente) setRetosPorMateria(Object.fromEntries(pares));
        });
        return () => { vigente = false; };
    }, [materias]);

    const materiaSugerida = useMemo(() => {
        if (!materias.length) return null;
        return [...materias].sort(
            (a, b) => (retosPorMateria[a]?.length || 0) - (retosPorMateria[b]?.length || 0)
        )[0];
    }, [materias, retosPorMateria]);

    const retosRecientes = useMemo(() => (
        Object.entries(retosPorMateria)
            .flatMap(([nombre, retos]) => retos.map((r) => ({ ...r, materia: nombre })))
            .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))
            .slice(0, 12)
    ), [retosPorMateria]);

    const [filtroReciente, setFiltroReciente] = useState('todos');
    const retosFiltrados = filtroReciente === 'todos'
        ? retosRecientes
        : retosRecientes.filter((r) => r.tipo === filtroReciente);

    const irAMateria = (nombre, subvista = 'quiz', tab = 'crear') => {
        if (!nombre) return;
        setPagina('materias');
        setMateriaSeleccionada(nombre);
        setSubVistaMateria(subvista);
        setTabMateria(tab);
    };

    const handleGenerarInvitaciones = async (e) => {
        e.preventDefault();
        try {
            setErrorMaterial('');
            if (!invCursoId) {
                setErrorMaterial('Elige el curso de la lista antes de generar códigos.');
                return;
            }
            const data = await docenteService.generarInvitaciones(invCantidad, Number(invCursoId));
            setCodigosNuevos(data.codigos);
            setAvisoOk(`${data.codigos.length} códigos generados para ${data.curso} (válidos ${data.dias_vigencia} días).`);
            await cargarEstudiantes();
        } catch (err) {
            setErrorMaterial(err.message);
        }
    };

    const handleResetPin = async (est) => {
        try {
            setErrorMaterial('');
            const data = await docenteService.resetearPinEstudiante(est.usuario_id);
            setAvisoOk(`${est.nombre_completo}: ${data.mensaje}`);
        } catch (err) {
            setErrorMaterial(err.message);
        }
    };

    const cerrarSesion = () => {
        authService.logout();
        navigate('/');
    };

    const [ranking, setRanking] = useState([]);
    useEffect(() => {
        obtenerRanking(3).then((filas) =>
            setRanking(filas.map((f) => ({ nombre: f.nombre, puntos: f.xp_total })))
        );
    }, []);

    const [resumen, setResumen] = useState(null);
    useEffect(() => {
        if (pagina === '' || pagina === 'perfil') {
            docenteService.resumen().then(setResumen).catch(() => {});
        }
    }, [pagina]);

    const [fichaEstudiante, setFichaEstudiante] = useState(null);

    const usuarioActual = authService.getUsuario();
    const nombreDocente = usuarioActual?.nombre_completo || usuarioActual?.username || 'docente';
    const horaActual = new Date().getHours();
    const saludoDia = horaActual < 12 ? 'Buenos días' : horaActual < 19 ? 'Buenas tardes' : 'Buenas noches';

    // Centro de actividad: cronología ligera con lo que ya sabemos
    // (materias sin actividades + eventos reales del resumen). Sin datos, se oculta.
    const eventosAula = useMemo(() => {
        const eventos = [];
        materias.forEach((mat) => {
            if (retosPorMateria[mat] && retosPorMateria[mat].length === 0) {
                eventos.push({
                    id: `sin-${mat}`,
                    tono: 'pendiente',
                    texto: `${mat} todavía no tiene actividades.`,
                    materiaDestino: mat
                });
            }
        });
        (resumen?.actividad || []).slice(0, 5).forEach((ev) => {
            eventos.push({
                id: `ev-${ev.id}`,
                tono: ev.rol === 'estudiante' ? 'logro' : 'docente',
                texto: `${ev.nombre}: ${ev.descripcion}${ev.materia ? ` · ${ev.materia}` : ''}`,
                fecha: formatearFecha(ev.creado_en)
            });
        });
        return eventos.slice(0, 6);
    }, [materias, retosPorMateria, resumen]);

    const [tabMateria, setTabMateria] = useState('crear');

    // ✨ Actividad sorpresa (SPEC-006 Fase 3): la IA decide juego, tema,
    // dificultad y cantidad, y guarda un BORRADOR (nunca publica sola).
    const [sorpresaCargando, setSorpresaCargando] = useState(false);
    const [sorpresaResultado, setSorpresaResultado] = useState(null);
    const generarSorpresa = async () => {
        const materiaId = materiaIdPorNombre(materiaSeleccionada);
        if (!materiaId || sorpresaCargando) return;
        setSorpresaCargando(true);
        setErrorMaterial('');
        setSorpresaResultado(null);
        try {
            const data = await actividadSorpresa({ materiaId });
            setSorpresaResultado(data);
        } catch (err) {
            setErrorMaterial(`No se pudo generar la actividad sorpresa: ${err.message}`);
        } finally {
            setSorpresaCargando(false);
        }
    };

    const handleUploadMateria = async (materia, file, { isPrivate = false } = {}) => {
        const kind = getKind(file.name);
        const archivo = {
            name: file.name,
            sizeLabel: formatSize(file.size),
            kind,
            isPrivate,
            pageCount: null,
            thumbnail: null,
            dataUrl: null
        };

        try {
            archivo.dataUrl = await leerComoDataUrl(file);
        } catch {
        }
        if (kind === "pdf") {
            try {
                const { pageCount, thumbnail } = await procesarPdf(file);
                archivo.pageCount = pageCount;
                archivo.thumbnail = thumbnail;
            } catch {
            }
        }

        try {
            setErrorMaterial('');
            await subirMaterial(materiaIdPorNombre(materia), archivo);
            await refrescarMaterial(materia);
        } catch (err) {
            setErrorMaterial(`No se pudo subir "${file.name}": ${err.message}`);
        }
    };

    const handleEliminarArchivo = async (materia, id) => {
        try {
            setErrorMaterial('');
            await eliminarMaterial(materiaIdPorNombre(materia), id);
        } catch (err) {
            setErrorMaterial(`No se pudo eliminar el archivo: ${err.message}`);
        } finally {
            await refrescarMaterial(materia);
        }
    };

    return (
        <SidebarLayout
            titulo={getInstitucionCache()?.nombre || 'Unidad Educativa Fiscal Clemencia Coronel de Pincay'}
            items={[
                { id: '', label: 'Inicio', Icon: HomeFilledIcon },
                { id: 'materias', label: 'Materias', Icon: MenuBookIcon, grupo: 'Enseñanza' },
                { id: 'biblioteca', label: 'Biblioteca', Icon: LocalLibraryRoundedIcon, grupo: 'Enseñanza' },
                { id: 'estudiantes', label: 'Mis Estudiantes', Icon: GroupsRoundedIcon, grupo: 'Mi aula' },
                { id: 'ranking', label: 'Ranking', Icon: EmojiEventsRoundedIcon, grupo: 'Mi aula' },
                { id: 'perfil', label: 'Mi Perfil', Icon: AccountCircleRoundedIcon, grupo: 'Cuenta' }
            ].map((item) => ({
                ...item,
                activo: pagina === item.id,
                onClick: () => { setPagina(item.id); setMateriaSeleccionada(null); }
            }))}
            usuario={{ inicial: 'D', nombre: 'Docente', detalle: authService.getUsuario()?.username }}
            accionesFooter={[
                { label: 'Cerrar sesión', Icon: LogoutRoundedIcon, onClick: cerrarSesion }
            ]}
        >

                {pagina === "" && (
                    <div className="home-doc home-doc-inicio">
                        <header className="doc-saludo">
                            <span className="doc-saludo-avatar" aria-hidden="true">
                                {nombreDocente.charAt(0).toUpperCase()}
                            </span>
                            <div className="doc-saludo-meta">
                                <h1>{saludoDia}, {nombreDocente}.</h1>
                                <p>
                                    Hoy tienes {materias.length} {materias.length === 1 ? 'materia' : 'materias'} y{' '}
                                    {misEstudiantes.length} {misEstudiantes.length === 1 ? 'estudiante' : 'estudiantes'}.
                                </p>
                            </div>
                        </header>

                        {materias.length > 0 ? (
                            <section className="home-doc-materias">
                                <h2>Tus materias</h2>
                                <div className="home-doc-materias-grid">
                                    {materias.map((mat) => {
                                        const ui = uiMateria(mat);
                                        const retos = retosPorMateria[mat] || [];
                                        const cuenta = (tipo) => retos.filter((r) => r.tipo === tipo).length;
                                        return (
                                            <button
                                                key={mat}
                                                className="home-doc-materia"
                                                style={ui.estilo}
                                                onClick={() => irAMateria(mat)}
                                            >
                                                <span className="home-doc-materia-emoji" aria-hidden="true">{ui.icono}</span>
                                                <span className="home-doc-materia-nombre">{mat}</span>
                                                {retos.length ? (
                                                    <span className="home-doc-materia-detalle">
                                                        {cuenta('quiz')} quizzes · {cuenta('clasificador')} juegos · {cuenta('mision')} misiones
                                                    </span>
                                                ) : (
                                                    <span className="home-doc-materia-detalle home-doc-materia-aviso">
                                                        Sin actividades · crea la primera
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        ) : (
                            <EmptyState
                                Icon={MenuBookIcon}
                                titulo="Aún no tienes materias asignadas"
                                mensaje="Pide al administrador que te asigne materias para empezar a crear actividades."
                            />
                        )}

                        {eventosAula.length > 0 && (
                            <section className="home-doc-centro">
                                <h2>Centro de actividad</h2>
                                <ul className="centro-timeline">
                                    {eventosAula.map((ev) => (
                                        <li key={ev.id} className="centro-evento">
                                            <span className={`centro-dot centro-dot-${ev.tono}`} aria-hidden="true" />
                                            {ev.materiaDestino ? (
                                                <button
                                                    type="button"
                                                    className="centro-evento-link"
                                                    onClick={() => irAMateria(ev.materiaDestino)}
                                                >
                                                    {ev.texto}
                                                </button>
                                            ) : (
                                                <span className="centro-evento-texto">{ev.texto}</span>
                                            )}
                                            {ev.fecha && <span className="centro-evento-fecha">{ev.fecha}</span>}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {retosRecientes.length > 0 && (
                            <section className="home-doc-reciente">
                                <h2>Actividad reciente</h2>
                                <div className="reciente-filtros" role="tablist" aria-label="Filtrar por tipo">
                                    {[
                                        ['todos', 'Todo'],
                                        ['quiz', 'Quiz'],
                                        ['mision', 'Misión'],
                                        ['clasificador', 'Clasificador']
                                    ].map(([id, label]) => (
                                        <button
                                            key={id}
                                            type="button"
                                            className={`doc-tab doc-tab-mini ${filtroReciente === id ? 'doc-tab-activa' : ''}`}
                                            onClick={() => setFiltroReciente(id)}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                {retosFiltrados.length ? (
                                    <ul className="actividad-lista">
                                        {retosFiltrados.slice(0, 6).map((r) => (
                                            <li key={r.id} className="actividad-item">
                                                <span className="actividad-icono"><TaskAltRoundedIcon /></span>
                                                <div className="actividad-meta">
                                                    <strong>{r.titulo}</strong>
                                                    <span>
                                                        {TIPO_RETO_LABEL[r.tipo] || r.tipo} · {r.materia} · {r.xp_recompensa} XP
                                                    </span>
                                                </div>
                                                <span className="actividad-fecha">{formatearFecha(r.creado_en)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="vacio-msg">No hay actividades de este tipo todavía.</p>
                                )}
                            </section>
                        )}

                        {resumen?.stats && (
                            <div className="home-doc-duo">
                                <section className="card duo-card">
                                    <h3>Actividad creada</h3>
                                    <ul className="duo-lista">
                                        <li><span>Total actividades</span><strong>{resumen.stats.actividades}</strong></li>
                                        <li><span>Quizzes</span><strong>{resumen.stats.quizzes}</strong></li>
                                        <li><span>Misiones</span><strong>{resumen.stats.misiones}</strong></li>
                                        <li><span>Clasificadores</span><strong>{resumen.stats.clasificadores}</strong></li>
                                        <li><span>Materiales</span><strong>{resumen.stats.materiales}</strong></li>
                                    </ul>
                                </section>
                                <section className="card duo-card">
                                    <h3>Estado del aula</h3>
                                    <ul className="duo-lista">
                                        <li><span>XP generado</span><strong>{resumen.stats.xp_entregada}</strong></li>
                                        {resumen.stats.promedio !== null && (
                                            <li><span>Promedio general</span><strong>{resumen.stats.promedio}%</strong></li>
                                        )}
                                        <li><span>Retos completados esta semana</span><strong>{resumen.stats.completados_semana}</strong></li>
                                    </ul>
                                </section>
                            </div>
                        )}
                    </div>
                )}


                {pagina === "materias" && !materiaSeleccionada && (
                    <div className="home-doc">
                        <div>
                            <h1 style={{pointerEvents:"none"}}>Tus materias</h1>
                            <p className="contenido-sub" style={{ pointerEvents: "none" }}>Elige una materia para crear actividades y subir material.</p>
                        </div>

                        <div className="home-doc-materias-grid">
                            {materias.map((mat) => {
                                const ui = uiMateria(mat);
                                const retos = retosPorMateria[mat] || [];
                                return (
                                    <button
                                        key={mat}
                                        className="home-doc-materia"
                                        style={ui.estilo}
                                        onClick={() => { setMateriaSeleccionada(mat); setSubVistaMateria('quiz'); setTabMateria('resumen'); }}
                                    >
                                        <span className="home-doc-materia-emoji" aria-hidden="true">{ui.icono}</span>
                                        <span className="home-doc-materia-nombre">{mat}</span>
                                        <span className="home-doc-materia-detalle">
                                            {retos.length
                                                ? `${retos.length} ${retos.length === 1 ? 'actividad publicada' : 'actividades publicadas'}`
                                                : 'Sin actividades todavía'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {pagina === "materias" && materiaSeleccionada && (() => {
                    const ui = uiMateria(materiaSeleccionada);
                    const retosMateria = retosPorMateria[materiaSeleccionada] || [];
                    const archivosMateria = archivosPorMateria[materiaSeleccionada] || [];
                    return (
                    <div className="materia-doc">
                        <button
                            className="back-btn"
                            onClick={() => { setMateriaSeleccionada(null); setArchivoPreview(null); setSubVistaMateria('quiz'); setTabMateria('crear'); }}
                        >
                            ← Volver a mis materias
                        </button>

                        <header className="materia-hero" style={ui.estilo}>
                            <span className="materia-hero-emoji" aria-hidden="true">{ui.icono}</span>
                            <div className="materia-hero-meta">
                                <h1>{materiaSeleccionada}</h1>
                                {ui.descripcion && <p style={{ marginTop: 0 }}>{ui.descripcion}</p>}
                                <p>
                                    {retosMateria.length
                                        ? `${retosMateria.length} ${retosMateria.length === 1 ? 'actividad publicada' : 'actividades publicadas'} para tus estudiantes`
                                        : 'Todavía sin actividades: crea la primera aquí abajo'}
                                    {archivosMateria.length ? ` · ${archivosMateria.length} ${archivosMateria.length === 1 ? 'archivo de material' : 'archivos de material'}` : ''}
                                </p>
                            </div>
                        </header>

                        {errorMaterial && (
                            <div className="aviso-migracion" role="alert">
                                <p>{errorMaterial}</p>
                                <button onClick={() => setErrorMaterial('')}>Entendido</button>
                            </div>
                        )}
                        {avisoOk && (
                            <div className="admin-aviso-ok" role="status">
                                <p>{avisoOk}</p>
                                <button onClick={() => setAvisoOk('')}>OK</button>
                            </div>
                        )}

                        <nav className="doc-tabs" aria-label="Secciones de la materia">
                            {[
                                ['resumen', '📊 Resumen'],
                                ['crear', '✨ Crear actividad'],
                                ['actividades', '🎯 Actividades'],
                                ['material', '📄 Material'],
                                ['calificaciones', '📒 Calificaciones']
                            ].map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    className={`doc-tab ${tabMateria === id ? 'doc-tab-activa' : ''}`}
                                    onClick={() => setTabMateria(id)}
                                >
                                    {label}
                                </button>
                            ))}
                        </nav>

                        {tabMateria === 'resumen' && (
                            <>
                                <WidgetsRendimiento
                                    materia={materiaSeleccionada}
                                    topEstudiantes={ranking}
                                    retosPublicados={retosMateria.length}
                                    siguientePaso={
                                        archivosMateria.length > 0
                                            ? { descripcion: "Ya tienes material cargado. Pon a prueba a tus estudiantes generando un quiz.", label: "Crear un quiz", destino: "quiz" }
                                            : { descripcion: "Aún no hay material en esta materia. Súbelo en la pestaña Material y luego genera un quiz.", label: "Crear un quiz", destino: "quiz" }
                                    }
                                    onAccion={(destino) => { setSubVistaMateria(destino); setTabMateria('crear'); }}
                                />
                                <SectionCard
                                    titulo="Últimas actividades publicadas"
                                    Icon={TaskAltRoundedIcon}
                                    tag={retosMateria.length ? `${retosMateria.length}` : undefined}
                                    accion={{ label: 'Ver todas en la Biblioteca', onClick: () => setPagina('biblioteca') }}
                                >
                                    {retosMateria.length ? (
                                        <ul className="actividad-lista">
                                            {retosMateria.slice(0, 5).map((r) => (
                                                <li key={r.id} className="actividad-item">
                                                    <span className="actividad-icono"><TaskAltRoundedIcon /></span>
                                                    <div className="actividad-meta">
                                                        <strong>{r.titulo}</strong>
                                                        <span>{TIPO_RETO_LABEL[r.tipo] || r.tipo} · ⭐ {r.xp_recompensa} XP</span>
                                                    </div>
                                                    <span className="actividad-fecha">{formatearFecha(r.creado_en)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <EmptyState
                                            Icon={TaskAltRoundedIcon}
                                            titulo="Sin actividades todavía"
                                            mensaje="Crea la primera en la pestaña «Crear actividad»."
                                            accion={{ label: 'Crear actividad', onClick: () => setTabMateria('crear') }}
                                        />
                                    )}
                                </SectionCard>
                            </>
                        )}

                        {tabMateria === 'actividades' && (
                            // SPEC-006 Fase 6: la pestaña Actividades ES la Biblioteca
                            // pre-filtrada por esta materia (borradores, publicadas,
                            // archivadas, papelera, filtros y estadísticas incluidos).
                            <BibliotecaActividades
                                materiaId={materiaIdPorNombre(materiaSeleccionada)}
                                onAviso={setAvisoOk}
                                onError={setErrorMaterial}
                            />
                        )}

                        {tabMateria === 'crear' && (
                        <section className="materia-crear">
                            <div className="materia-crear-head">
                                <h2>¿Qué actividad quieres crear hoy?</h2>
                                <p>Elige un tipo, revisa el contenido y publícalo para tus estudiantes.</p>
                            </div>

                            <button
                                type="button"
                                className="crear-sorpresa-btn"
                                onClick={generarSorpresa}
                                disabled={sorpresaCargando}
                            >
                                {sorpresaCargando
                                    ? <span className="quiz-spinner" aria-hidden="true" />
                                    : <AutoAwesomeRoundedIcon sx={{ fontSize: '1.15rem' }} />}
                                {sorpresaCargando
                                    ? 'La IA está preparando tu sorpresa…'
                                    : '✨ Actividad sorpresa: la IA elige el juego, el tema y la dificultad'}
                            </button>
                            {sorpresaResultado && (
                                <div className="admin-aviso-ok" role="status">
                                    <p>
                                        Borrador creado: «{sorpresaResultado.reto.titulo}» ({sorpresaResultado.reto.tipo}).
                                        {sorpresaResultado.objetivo ? ` Objetivo: ${sorpresaResultado.objetivo}` : ''}{' '}
                                        Revísalo en la pestaña Actividades o en la Biblioteca para editarlo o publicarlo.
                                    </p>
                                    <button onClick={() => setSorpresaResultado(null)}>OK</button>
                                </div>
                            )}

                            <div className="crear-tipos">
                                <button
                                    className={`crear-tipo ${subVistaMateria === 'quiz' ? 'crear-tipo-activo' : ''}`}
                                    onClick={() => setSubVistaMateria('quiz')}
                                >
                                    <span className="crear-tipo-emoji" aria-hidden="true">✨</span>
                                    <strong>Quiz</strong>
                                    <span className="crear-tipo-desc">Preguntas con opciones, generadas con IA a partir de un tema</span>
                                </button>
                                <button
                                    className={`crear-tipo ${subVistaMateria === 'clasificador' ? 'crear-tipo-activo' : ''}`}
                                    onClick={() => setSubVistaMateria('clasificador')}
                                >
                                    <span className="crear-tipo-emoji" aria-hidden="true">🧩</span>
                                    <strong>Juego Clasificador</strong>
                                    <span className="crear-tipo-desc">Arrastrar y soltar elementos en su categoría correcta</span>
                                </button>
                                <button
                                    className={`crear-tipo ${subVistaMateria === 'mision' ? 'crear-tipo-activo' : ''}`}
                                    onClick={() => setSubVistaMateria('mision')}
                                >
                                    <span className="crear-tipo-emoji" aria-hidden="true">🗺️</span>
                                    <strong>Misión Narrativa</strong>
                                    <span className="crear-tipo-desc">Una historia por capítulos con desafíos para avanzar</span>
                                </button>
                                <button
                                    className={`crear-tipo ${subVistaMateria === 'memorama' ? 'crear-tipo-activo' : ''}`}
                                    onClick={() => setSubVistaMateria('memorama')}
                                >
                                    <span className="crear-tipo-emoji" aria-hidden="true">🃏</span>
                                    <strong>Memorama</strong>
                                    <span className="crear-tipo-desc">Parejas para emparejar, generadas con IA desde un tema</span>
                                </button>
                                <button
                                    className={`crear-tipo ${subVistaMateria === 'linea-tiempo' ? 'crear-tipo-activo' : ''}`}
                                    onClick={() => setSubVistaMateria('linea-tiempo')}
                                >
                                    <span className="crear-tipo-emoji" aria-hidden="true">⏳</span>
                                    <strong>Línea del tiempo</strong>
                                    <span className="crear-tipo-desc">Eventos o pasos para ordenar, generados con IA</span>
                                </button>
                                <button
                                    className={`crear-tipo ${subVistaMateria === 'completar' ? 'crear-tipo-activo' : ''}`}
                                    onClick={() => setSubVistaMateria('completar')}
                                >
                                    <span className="crear-tipo-emoji" aria-hidden="true">✏️</span>
                                    <strong>Completar espacios</strong>
                                    <span className="crear-tipo-desc">Frases con espacios en blanco y opciones, con IA</span>
                                </button>
                            </div>

                            {subVistaMateria === 'quiz' && (
                                <GeneradorQuiz materia={materiaSeleccionada} />
                            )}

                            {subVistaMateria === 'mision' && (
                                <GeneradorMision materia={materiaSeleccionada} />
                            )}

                            {subVistaMateria === 'clasificador' && (
                                <EditorClasificador materia={materiaSeleccionada} />
                            )}

                            {['memorama', 'linea-tiempo', 'completar'].includes(subVistaMateria) && (
                                <GeneradorActividadIA key={subVistaMateria} materia={materiaSeleccionada} tipo={subVistaMateria} />
                            )}
                        </section>
                        )}

                        {tabMateria === 'material' && (
                        <>
                        <div className="materia-crear-head">
                            <h2>Material de estudio</h2>
                            <p>Sube documentos de apoyo: los públicos los ven tus estudiantes; los privados, solo tú.</p>
                        </div>

                        <div className="materia-archivos-grid">
                            <MaterialContenedor
                                titulo="Material para Estudiantes"
                                subtitulo="Visible para toda la clase"
                                Icon={GroupsRoundedIcon}
                                vacioMsg="Aún no has publicado material para los estudiantes."
                                archivos={(archivosPorMateria[materiaSeleccionada] || []).filter((a) => !a.isPrivate)}
                                isPrivate={false}
                                onUpload={(file, opts) => handleUploadMateria(materiaSeleccionada, file, opts)}
                                onPreview={setArchivoPreview}
                            />
                            <MaterialContenedor
                                titulo="Material Exclusivo del Docente"
                                subtitulo="Privado · solo tú puedes verlo"
                                Icon={LockRoundedIcon}
                                vacioMsg="No tienes material privado en esta materia."
                                archivos={archivosMateria.filter((a) => a.isPrivate)}
                                isPrivate={true}
                                onUpload={(file, opts) => handleUploadMateria(materiaSeleccionada, file, opts)}
                                onPreview={setArchivoPreview}
                            />
                        </div>
                        </>
                        )}

                        {tabMateria === 'calificaciones' && (
                            <section className="card materia-subvista">
                                <h3>Libro de Calificaciones de {materiaSeleccionada}</h3>
                                <LibroCalificaciones materia={materiaSeleccionada} />
                            </section>
                        )}
                    </div>
                    );
                })()}

                {pagina === "estudiantes" && (
                    <div className="home-doc">
                        <div>
                            <h1 style={{pointerEvents:"none"}}>Mis Estudiantes</h1>
                            <p className="contenido-sub" style={{ marginBottom: 0 }}>Genera códigos de invitación para que tus estudiantes se registren, y ayúdalos si olvidan su PIN.</p>
                        </div>

                        {avisoOk && (
                            <div className="admin-aviso-ok" role="status">
                                <p>{avisoOk}</p>
                                <button onClick={() => setAvisoOk('')}>OK</button>
                            </div>
                        )}

                        <section className="card">
                            <div className="card-head">
                                <h3><VpnKeyRoundedIcon sx={{ fontSize: '1.1rem', verticalAlign: 'middle' }} /> Generar invitaciones</h3>
                            </div>
                            <form className="admin-form" onSubmit={handleGenerarInvitaciones}>
                                <select
                                    value={invCursoId}
                                    onChange={(e) => setInvCursoId(e.target.value)}
                                    aria-label="Curso de los estudiantes"
                                >
                                    <option value="">Elige el curso…</option>
                                    {cursos.map((c) => (
                                        <option key={c.id} value={c.id}>{c.etiqueta}</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    min="1"
                                    max="40"
                                    value={invCantidad}
                                    onChange={(e) => setInvCantidad(Number(e.target.value))}
                                />
                                <button type="submit" className="upload-mini-btn">Generar códigos</button>
                            </form>
                            {codigosNuevos.length > 0 && (
                                <div className="inv-codigos-nuevos">
                                    {codigosNuevos.map((c) => <code key={c}>{c}</code>)}
                                </div>
                            )}
                        </section>

                        <section className="card">
                            <div className="card-head">
                                <h3>Estudiantes registrados con mis códigos</h3>
                                <div className="section-head-extra">
                                    <span className="card-tag">{misEstudiantes.length}</span>
                                    <button type="button" className="section-accion" onClick={() => setPagina('ranking')}>
                                        Ver ranking completo
                                    </button>
                                </div>
                            </div>
                            <table className="admin-tabla">
                                <thead>
                                    <tr><th>Nombre</th><th>Curso</th><th>XP</th><th>PIN</th></tr>
                                </thead>
                                <tbody>
                                    {misEstudiantes.map((est) => (
                                        <tr key={est.usuario_id}>
                                            <td>{est.nombre_completo}</td>
                                            <td>{est.curso}</td>
                                            <td>{est.xp_total}</td>
                                            <td className="admin-acciones">
                                                <button
                                                    title="Ver ficha del estudiante"
                                                    onClick={() => setFichaEstudiante(est)}
                                                >
                                                    <VisibilityRoundedIcon sx={{ fontSize: '1.1rem' }} /> Ver ficha
                                                </button>
                                                <button title="Restablecer PIN a su fecha de nacimiento" onClick={() => handleResetPin(est)}>
                                                    <RestartAltRoundedIcon sx={{ fontSize: '1.1rem' }} /> Restablecer
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {!misEstudiantes.length && (
                                        <tr><td colSpan={4} className="vacio-msg">Aún no hay estudiantes registrados con tus códigos.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </section>

                        <section className="card">
                            <div className="card-head">
                                <h3>Mis códigos emitidos</h3>
                                <span className="card-tag">{invitaciones.length}</span>
                            </div>
                            <table className="admin-tabla">
                                <thead>
                                    <tr><th>Código</th><th>Curso</th><th>Estado</th><th>Usado por</th></tr>
                                </thead>
                                <tbody>
                                    {invitaciones.map((i) => (
                                        <tr key={i.id}>
                                            <td><code>{i.codigo}</code></td>
                                            <td>{i.curso}</td>
                                            <td><span className={`inv-estado inv-${i.estado}`}>{i.estado}</span></td>
                                            <td>{i.usado_por || '—'}</td>
                                        </tr>
                                    ))}
                                    {!invitaciones.length && (
                                        <tr><td colSpan={4} className="vacio-msg">Aún no has generado códigos.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </section>
                    </div>
                )}

                {pagina === 'biblioteca' && (
                    <div className="home-doc">
                        <DashboardHeader
                            titulo="Biblioteca de Actividades"
                            subtitulo="Todo lo que has creado, en un solo lugar: busca, duplica, edita, archiva o restaura. Nada se borra para siempre."
                        />
                        <BibliotecaActividades onAviso={setAvisoOk} onError={setErrorMaterial} />
                        {errorMaterial && (
                            <div className="aviso-migracion" role="alert">
                                <p>{errorMaterial}</p>
                                <button onClick={() => setErrorMaterial('')}>Entendido</button>
                            </div>
                        )}
                        {avisoOk && (
                            <div className="admin-aviso-ok" role="status">
                                <p>{avisoOk}</p>
                                <button onClick={() => setAvisoOk('')}>OK</button>
                            </div>
                        )}
                    </div>
                )}

                {pagina === 'ranking' && (
                    <div className="home-doc">
                        <DashboardHeader
                            titulo="Ranking"
                            subtitulo="La tabla de posiciones por XP acumulada. Puedes buscar, ordenar y filtrar por curso."
                        />
                        <RankingCompleto onError={setErrorMaterial} />
                        {errorMaterial && (
                            <div className="aviso-migracion" role="alert">
                                <p>{errorMaterial}</p>
                                <button onClick={() => setErrorMaterial('')}>Entendido</button>
                            </div>
                        )}
                    </div>
                )}

                {pagina === 'perfil' && (
                    <div className="home-doc">
                        <DashboardHeader
                            titulo="Mi Perfil"
                            subtitulo="Tu identidad como docente, tus números reales y tu actividad reciente."
                        />
                        {errorMaterial && (
                            <div className="aviso-migracion" role="alert">
                                <p>{errorMaterial}</p>
                                <button onClick={() => setErrorMaterial('')}>Entendido</button>
                            </div>
                        )}
                        {avisoOk && (
                            <div className="admin-aviso-ok" role="status">
                                <p>{avisoOk}</p>
                                <button onClick={() => setAvisoOk('')}>OK</button>
                            </div>
                        )}
                        <PerfilDocente
                            stats={resumen?.stats}
                            materias={materias}
                            onAviso={setAvisoOk}
                            onError={setErrorMaterial}
                        />
                    </div>
                )}

            <FilePreviewModal
                archivo={archivoPreview}
                onClose={() => setArchivoPreview(null)}
                onDownload={descargarArchivo}
                onDelete={(a) => handleEliminarArchivo(materiaSeleccionada, a.id)}
            />

            {fichaEstudiante && (
                <FichaEstudiante
                    estudiante={fichaEstudiante}
                    onCerrar={() => setFichaEstudiante(null)}
                />
            )}
        </SidebarLayout>
    );
}
