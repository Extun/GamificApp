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
    StatCard,
    DashboardHeader,
    formatearFecha
} from '../../components/dashboard/DashboardWidgets';
import LocalLibraryRoundedIcon from '@mui/icons-material/LocalLibraryRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded';
import MapRoundedIcon from '@mui/icons-material/MapRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import PercentRoundedIcon from '@mui/icons-material/PercentRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { BibliotecaActividades } from '../docente/BibliotecaActividades';
import { RankingCompleto } from '../docente/RankingCompleto';
import { PerfilDocente } from '../docente/PerfilDocente';
import { FichaEstudiante } from '../docente/FichaEstudiante';

// Etiquetas legibles de los tipos de reto publicables.
const TIPO_RETO_LABEL = { quiz: 'Quiz', clasificador: 'Juego', mision: 'Misión' };

// El catálogo dinámico de materias (SPEC-002) vive en materiasService:
// color e icono los define el admin. El id se resuelve desde su caché,
// que este panel calienta al montar (ver efecto de misMaterias).
const materiaIdPorNombre = (nombre) => idPorNombre(nombre);

// Lee un File como dataURL (base64) para persistirlo y poder descargarlo luego.
const leerComoDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

import { GeneradorQuiz } from './GeneradorQuiz';
import { GeneradorMision } from './GeneradorMision';
import { EditorClasificador } from '../../components/clasificador/EditorClasificador';
import { LibroCalificaciones } from '../../components/dashboard/LibroCalificaciones';
import { Grid, Card } from '@mui/material';
import { SidebarLayout } from '../../components/dashboard/SidebarLayout';

function WidgetsRendimiento({ materia, topEstudiantes, retosPublicados, siguientePaso, onAccion }) {
    return (
        <Grid container spacing={2.5} className="widgets-rendimiento">
            {/* Widget 1 · Top estudiantes */}
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

            {/* Widget 2 · Retos publicados (dato real de la BD) */}
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

            {/* Widget 3 · Acción rápida / siguiente paso */}
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

// Contenedor de material con uploader minimalista en la cabecera. La privacidad
// es implícita: cada contenedor sube con su propio `isPrivate` sin pedirlo al docente.
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
    // Al entrar a una materia siempre hay una herramienta de creación visible
    // (quiz por defecto): crear actividades es la acción principal del docente.
    const [subVistaMateria, setSubVistaMateria] = useState('quiz');
    // Material de estudio: la fuente de verdad es MySQL (vía API). Este mapa
    // { nombreMateria: Archivo[] } es solo el reflejo de la última consulta.
    const [archivosPorMateria, setArchivosPorMateria] = useState({});
    const [archivoPreview, setArchivoPreview] = useState(null);
    const [errorMaterial, setErrorMaterial] = useState('');

    // Refresca la lista de una materia CONSULTANDO AL SERVIDOR (no estados
    // locales): así web y móvil siempre muestran el mismo material.
    const refrescarMaterial = async (materia) => {
        const materiaId = materiaIdPorNombre(materia);
        if (!materiaId) return;
        const archivos = await obtenerMaterial(materiaId);
        setArchivosPorMateria((prev) => ({ ...prev, [materia]: archivos }));
    };

    // Al abrir una materia se descarga su material desde la BD central.
    useEffect(() => {
        if (materiaSeleccionada) refrescarMaterial(materiaSeleccionada);
    }, [materiaSeleccionada]);

    // Materias ASIGNADAS a este docente por el admin: definen todo lo que
    // este panel muestra y permite editar (el servidor lo vuelve a validar).
    const [materias, setMaterias] = useState([]);
    useEffect(() => {
        // Primero el catálogo global (calienta la caché de ids y colores del
        // materiasService) y después las asignadas: cuando el panel pinta,
        // todo lookup por nombre ya resuelve.
        listarMaterias()
            .catch(() => [])
            .then(() => docenteService.misMaterias())
            .then((lista) => setMaterias(lista.map((m) => m.nombre)))
            .catch((err) => setErrorMaterial(`No se pudieron cargar tus materias: ${err.message}`));
    }, []);

    // Gestión de estudiantes e invitaciones del docente.
    const [misEstudiantes, setMisEstudiantes] = useState([]);
    const [invitaciones, setInvitaciones] = useState([]);
    const [codigosNuevos, setCodigosNuevos] = useState([]);
    // Cursos del catálogo institucional (SPEC-002): el docente ya no tipea
    // el curso, lo elige de la lista que administra el admin.
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

    // El Home necesita los datos del aula desde el arranque; al entrar a la
    // sección "Mis Estudiantes" se refrescan por si cambiaron.
    useEffect(() => {
        cargarEstudiantes();
    }, []);

    useEffect(() => {
        if (pagina === 'estudiantes') cargarEstudiantes();
    }, [pagina]);

    // Retos publicados por materia asignada: alimentan el Home ("Contenido",
    // "Actividad reciente") y el widget real del detalle de materia.
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

    // Último borrador de quiz del historial local del generador: es la señal
    // más directa de "trabajo a medio hacer" con la que cuenta el docente.
    const borradorReciente = useMemo(() => {
        try {
            const data = JSON.parse(localStorage.getItem('edu_historialQuizzes')) || {};
            const borradores = Object.values(data)
                .flat()
                .filter((q) => q?.estado === 'borrador' && materias.includes(q.materia));
            borradores.sort((a, b) => (b.id || 0) - (a.id || 0));
            return borradores[0] || null;
        } catch {
            return null;
        }
    }, [materias]);

    // Materia con menos retos publicados: sugerencia de dónde crear contenido.
    const materiaSugerida = useMemo(() => {
        if (!materias.length) return null;
        return [...materias].sort(
            (a, b) => (retosPorMateria[a]?.length || 0) - (retosPorMateria[b]?.length || 0)
        )[0];
    }, [materias, retosPorMateria]);

    // Últimos retos publicados en cualquiera de sus materias.
    const retosRecientes = useMemo(() => (
        Object.entries(retosPorMateria)
            .flatMap(([nombre, retos]) => retos.map((r) => ({ ...r, materia: nombre })))
            .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))
            .slice(0, 5)
    ), [retosPorMateria]);

    // Salto directo desde el Home a una materia (y opcionalmente a una
    // sub-vista concreta, p. ej. el generador de quiz).
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

    // Top 3 real de estudiantes por XP (GET /api/ranking).
    const [ranking, setRanking] = useState([]);
    useEffect(() => {
        obtenerRanking(3).then((filas) =>
            setRanking(filas.map((f) => ({ nombre: f.nombre, puntos: f.xp_total })))
        );
    }, []);

    // Resumen real del Home (SPEC-004): stats + Centro de Actividad. Se
    // refresca al volver al Inicio para reflejar lo último publicado/jugado.
    const [resumen, setResumen] = useState(null);
    useEffect(() => {
        if (pagina === '' || pagina === 'perfil') {
            docenteService.resumen().then(setResumen).catch(() => {});
        }
    }, [pagina]);

    // Ficha rápida (SPEC-004): estudiante seleccionado en "Mis Estudiantes".
    const [fichaEstudiante, setFichaEstudiante] = useState(null);

    // Pestaña activa dentro de la vista de materia (SPEC-004).
    const [tabMateria, setTabMateria] = useState('crear');

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

        // Guardamos el archivo original (dataURL) para permitir su descarga, y
        // para PDFs obtenemos además páginas y miniatura reales antes de persistir.
        try {
            archivo.dataUrl = await leerComoDataUrl(file);
        } catch {
            // Sin dataURL no habrá descarga, pero el resto del flujo continúa.
        }
        if (kind === "pdf") {
            try {
                const { pageCount, thumbnail } = await procesarPdf(file);
                archivo.pageCount = pageCount;
                archivo.thumbnail = thumbnail;
            } catch {
                // Si el procesamiento falla, se guarda el archivo sin metadatos extra.
            }
        }

        // POST al servidor (debe responder 201) y luego SIEMPRE se refresca
        // la lista desde el API: ningún archivo existe solo en este navegador.
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

                {/* HOME — orden RFC-004: bienvenida → continuar trabajando →
                    mi aula → contenido → actividad reciente. Solo datos reales. */}
                {pagina === "" && (
                    <div className="home-doc">
                        {/* Bienvenida útil (SPEC-004): nombre, materias,
                            estudiantes y el pulso real de la semana. */}
                        <header className="doc-hero">
                            <span className="doc-hero-avatar" aria-hidden="true">
                                {(authService.getUsuario()?.nombre_completo || authService.getUsuario()?.username || 'D').charAt(0).toUpperCase()}
                            </span>
                            <div className="doc-hero-meta">
                                <h1>¡Hola, {authService.getUsuario()?.nombre_completo || authService.getUsuario()?.username || 'docente'}! 👋</h1>
                                <p>Este es el estado de tu aula hoy.</p>
                                <div className="doc-hero-chips">
                                    <span className="doc-hero-chip">
                                        📚 {materias.length ? materias.join(' · ') : 'Sin materias asignadas'}
                                    </span>
                                    <span className="doc-hero-chip">
                                        🎒 {misEstudiantes.length} {misEstudiantes.length === 1 ? 'estudiante' : 'estudiantes'}
                                    </span>
                                    {resumen?.stats && (
                                        <span className="doc-hero-chip">
                                            📈 {resumen.stats.completados_semana} {resumen.stats.completados_semana === 1 ? 'reto completado' : 'retos completados'} esta semana
                                        </span>
                                    )}
                                </div>
                            </div>
                        </header>

                        {/* Estadísticas rápidas con datos reales. */}
                        {resumen?.stats && (
                            <div className="stats-row">
                                <StatCard Icon={TaskAltRoundedIcon} valor={resumen.stats.actividades} etiqueta="Actividades creadas" tono="primary" />
                                <StatCard Icon={AutoAwesomeRoundedIcon} valor={resumen.stats.quizzes} etiqueta="Quizzes" tono="accent" />
                                <StatCard Icon={MapRoundedIcon} valor={resumen.stats.misiones} etiqueta="Misiones" tono="primary" />
                                <StatCard Icon={ExtensionRoundedIcon} valor={resumen.stats.clasificadores} etiqueta="Clasificadores" tono="accent" />
                                <StatCard Icon={DescriptionRoundedIcon} valor={resumen.stats.materiales} etiqueta="Materiales" tono="primary" />
                                <StatCard Icon={StarRoundedIcon} valor={resumen.stats.xp_entregada} etiqueta="XP entregada" tono="fire" />
                                <StatCard
                                    Icon={PercentRoundedIcon}
                                    valor={resumen.stats.promedio === null ? '—' : `${resumen.stats.promedio}%`}
                                    etiqueta="Promedio general"
                                    tono="accent"
                                />
                            </div>
                        )}

                        {/* Acciones rápidas: atajos, no reemplazan el menú. */}
                        <section>
                            <h2 style={{ marginBottom: 12 }}>Acciones rápidas</h2>
                            <div className="doc-rapidas">
                                <button type="button" className="doc-rapida" onClick={() => irAMateria(materiaSugerida || materias[0], 'quiz')} disabled={!materias.length}>
                                    <span className="doc-rapida-emoji" aria-hidden="true">✨</span>
                                    <strong>Crear Quiz</strong>
                                    <span className="doc-rapida-desc">Preguntas con IA a partir de un tema</span>
                                </button>
                                <button type="button" className="doc-rapida" onClick={() => irAMateria(materiaSugerida || materias[0], 'mision')} disabled={!materias.length}>
                                    <span className="doc-rapida-emoji" aria-hidden="true">🗺️</span>
                                    <strong>Crear Misión</strong>
                                    <span className="doc-rapida-desc">Una historia con desafíos</span>
                                </button>
                                <button type="button" className="doc-rapida" onClick={() => irAMateria(materiaSugerida || materias[0], 'quiz', 'material')} disabled={!materias.length}>
                                    <span className="doc-rapida-emoji" aria-hidden="true">📄</span>
                                    <strong>Subir Material</strong>
                                    <span className="doc-rapida-desc">Documentos de apoyo para la clase</span>
                                </button>
                                <button type="button" className="doc-rapida" onClick={() => setPagina('ranking')}>
                                    <span className="doc-rapida-emoji" aria-hidden="true">🏆</span>
                                    <strong>Ver Ranking</strong>
                                    <span className="doc-rapida-desc">Posiciones de todos tus estudiantes</span>
                                </button>
                                <button type="button" className="doc-rapida" onClick={() => setPagina('estudiantes')}>
                                    <span className="doc-rapida-emoji" aria-hidden="true">🔑</span>
                                    <strong>Generar Invitaciones</strong>
                                    <span className="doc-rapida-desc">Códigos para registrar estudiantes</span>
                                </button>
                            </div>
                        </section>

                        {borradorReciente ? (
                            <button className="home-hero-doc" onClick={() => irAMateria(borradorReciente.materia, 'quiz')}>
                                <span className="home-hero-doc-emoji" aria-hidden="true">✨</span>
                                <span className="home-hero-doc-texto">
                                    <strong>Termina tu quiz de "{borradorReciente.tema}"</strong>
                                    <span>Lo dejaste a medias en {borradorReciente.materia} · {borradorReciente.cantidad} preguntas listas para revisar</span>
                                </span>
                                <ArrowForwardRoundedIcon className="home-hero-doc-flecha" />
                            </button>
                        ) : materiaSugerida ? (
                            <button className="home-hero-doc" onClick={() => irAMateria(materiaSugerida)}>
                                <span className="home-hero-doc-emoji" aria-hidden="true">✨</span>
                                <span className="home-hero-doc-texto">
                                    <strong>Crea una actividad hoy</strong>
                                    <span>
                                        {(retosPorMateria[materiaSugerida] || []).length
                                            ? `${materiaSugerida} es la materia con menos actividades: dale una nueva.`
                                            : `${materiaSugerida} todavía no tiene actividades: ¡estrénala con un quiz, un juego o una misión!`}
                                    </span>
                                </span>
                                <ArrowForwardRoundedIcon className="home-hero-doc-flecha" />
                            </button>
                        ) : (
                            <EmptyState
                                Icon={MenuBookIcon}
                                titulo="Aún no tienes materias asignadas"
                                mensaje="Pide al administrador que te asigne materias para empezar a crear actividades."
                            />
                        )}

                        {materias.length > 0 && (
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
                                                <span className="home-doc-materia-detalle">
                                                    {retos.length
                                                        ? `${cuenta('quiz')} quizzes · ${cuenta('clasificador')} juegos · ${cuenta('mision')} misiones`
                                                        : 'Sin actividades todavía'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        <button className="home-doc-aula" onClick={() => setPagina('estudiantes')}>
                            <span className="home-doc-aula-emoji" aria-hidden="true">🎒</span>
                            <span className="home-doc-aula-texto">
                                <strong>Mi aula</strong>
                                <span>
                                    {(misEstudiantes.length || invitaciones.length)
                                        ? `${misEstudiantes.length} ${misEstudiantes.length === 1 ? 'estudiante registrado' : 'estudiantes registrados'} · ${invitaciones.filter((i) => i.estado === 'pendiente').length} invitaciones por usar · ${invitaciones.filter((i) => i.estado === 'usado').length} códigos usados`
                                        : 'Tu aula está vacía: genera códigos de invitación para que tus estudiantes se registren solos.'}
                                </span>
                            </span>
                            <ArrowForwardRoundedIcon className="home-doc-aula-flecha" />
                        </button>

                        {/* Centro de Actividad (SPEC-004): cronología real de
                            la auditoría — lo que hiciste tú y lo que hicieron
                            TUS estudiantes. */}
                        <SectionCard
                            titulo="Centro de Actividad"
                            Icon={TaskAltRoundedIcon}
                            tag={resumen?.actividad?.length ? `${resumen.actividad.length} eventos` : undefined}
                        >
                            {resumen?.actividad?.length ? (
                                <ul className="actividad-lista">
                                    {resumen.actividad.map((ev) => (
                                        <li key={ev.id} className="actividad-item">
                                            <span className="actividad-icono">
                                                {ev.rol === 'estudiante' ? <GroupsRoundedIcon /> : <SchoolRoundedIcon />}
                                            </span>
                                            <div className="actividad-meta">
                                                <strong>{ev.nombre}</strong>
                                                <span>{ev.materia ? `${ev.descripcion} · ${ev.materia}` : ev.descripcion}</span>
                                            </div>
                                            <span className="actividad-fecha">{formatearFecha(ev.creado_en)}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : retosRecientes.length ? (
                                <ul className="actividad-lista">
                                    {retosRecientes.map((r) => (
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
                                <EmptyState
                                    Icon={TaskAltRoundedIcon}
                                    titulo="Todavía no hay actividad que contar"
                                    mensaje="Cuando publiques actividades o tus estudiantes las resuelvan, la cronología aparecerá aquí."
                                    accion={materiaSugerida
                                        ? { label: 'Crear mi primera actividad', onClick: () => irAMateria(materiaSugerida, 'quiz') }
                                        : undefined}
                                />
                            )}
                        </SectionCard>
                    </div>
                )}

                {/* MATERIAS GRID */}
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

                {/* MATERIA DETALLE */}
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

                        {/* Cabecera con la identidad pastel de la materia */}
                        <header className="materia-hero" style={ui.estilo}>
                            <span className="materia-hero-emoji" aria-hidden="true">{ui.icono}</span>
                            <div className="materia-hero-meta">
                                <h1>{materiaSeleccionada}</h1>
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

                        {/* Espacio de aprendizaje (SPEC-004): todo lo de la
                            materia en un solo lugar, organizado por pestañas. */}
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

                        {/* RESUMEN — cómo va el aula en esta materia. */}
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

                        {/* ACTIVIDADES — lo publicado en esta materia. */}
                        {tabMateria === 'actividades' && (
                            <SectionCard
                                titulo={`Actividades de ${materiaSeleccionada}`}
                                Icon={TaskAltRoundedIcon}
                                tag={retosMateria.length ? `${retosMateria.length}` : undefined}
                                accion={{ label: 'Gestionar en la Biblioteca', onClick: () => setPagina('biblioteca') }}
                            >
                                {retosMateria.length ? (
                                    <ul className="actividad-lista">
                                        {retosMateria.map((r) => (
                                            <li key={r.id} className="actividad-item">
                                                <span className="actividad-icono"><TaskAltRoundedIcon /></span>
                                                <div className="actividad-meta">
                                                    <strong>{r.titulo}</strong>
                                                    <span>{TIPO_RETO_LABEL[r.tipo] || r.tipo} · ⭐ {r.xp_recompensa} XP{r.descripcion ? ` · ${r.descripcion}` : ''}</span>
                                                </div>
                                                <span className="actividad-fecha">{formatearFecha(r.creado_en)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <EmptyState
                                        Icon={TaskAltRoundedIcon}
                                        titulo="Sin actividades publicadas"
                                        mensaje="Las actividades que publiques en esta materia aparecerán aquí para tus estudiantes."
                                        accion={{ label: 'Crear actividad', onClick: () => setTabMateria('crear') }}
                                    />
                                )}
                            </SectionCard>
                        )}

                        {/* CREAR ACTIVIDAD — generadores (sin cambios de lógica). */}
                        {tabMateria === 'crear' && (
                        <section className="materia-crear">
                            <div className="materia-crear-head">
                                <h2>¿Qué actividad quieres crear hoy?</h2>
                                <p>Elige un tipo, revisa el contenido y publícalo para tus estudiantes.</p>
                            </div>

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
                        </section>
                        )}

                        {/* MATERIAL — dividido por audiencia. */}
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

                        {/* CALIFICACIONES — seguimiento por estudiante. */}
                        {tabMateria === 'calificaciones' && (
                            <section className="card materia-subvista">
                                <h3>Libro de Calificaciones de {materiaSeleccionada}</h3>
                                <LibroCalificaciones materia={materiaSeleccionada} />
                            </section>
                        )}
                    </div>
                    );
                })()}

                {/* MIS ESTUDIANTES: invitaciones de registro y reseteo de PIN */}
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

                {/* BIBLIOTECA — todas las actividades (SPEC-004). */}
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

                {/* RANKING COMPLETO (SPEC-004). */}
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

                {/* MI PERFIL (SPEC-004). */}
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

            {/* Ficha rápida del estudiante: modal, sin abandonar la página. */}
            {fichaEstudiante && (
                <FichaEstudiante
                    estudiante={fichaEstudiante}
                    onCerrar={() => setFichaEstudiante(null)}
                />
            )}
        </SidebarLayout>
    );
}
