import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './dashboard.css';
import './adminDashboard.css';
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
import MATERIAS from '../../constants/materias';
import { obtenerMaterial, subirMaterial, eliminarMaterial } from '../../services/materialesService';
import authService from '../../services/authService';
import docenteService from '../../services/docenteService';
import { obtenerRanking } from '../../services/gamificationService';
import { obtenerRetosPublicados } from '../../services/retosService';
import {
    DashboardHeader,
    StatCard,
    SectionCard,
    EmptyState,
    QuickActionCard,
    formatearFecha
} from '../../components/dashboard/DashboardWidgets';

// Etiquetas legibles de los tipos de reto publicables.
const TIPO_RETO_LABEL = { quiz: 'Quiz', clasificador: 'Juego', mision: 'Misión' };

const materiaIdPorNombre = (nombre) => MATERIAS.find((m) => m.nombre === nombre)?.id;

// Lee un File como dataURL (base64) para persistirlo y poder descargarlo luego.
const leerComoDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

import { AsistenteIA } from './asistenteIA';
import { GeneradorQuiz } from './GeneradorQuiz';
import { GeneradorMision } from './GeneradorMision';
import { EditorClasificador } from '../../components/clasificador/EditorClasificador';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemButton,
  ListItemText,
  Grid,
  Card
} from '@mui/material';

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
    const [subVistaMateria, setSubVistaMateria] = useState('');
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
        docenteService.misMaterias()
            .then((lista) => setMaterias(lista.map((m) => m.nombre)))
            .catch((err) => setErrorMaterial(`No se pudieron cargar tus materias: ${err.message}`));
    }, []);

    // Gestión de estudiantes e invitaciones del docente.
    const [misEstudiantes, setMisEstudiantes] = useState([]);
    const [invitaciones, setInvitaciones] = useState([]);
    const [codigosNuevos, setCodigosNuevos] = useState([]);
    const [invCurso, setInvCurso] = useState('');
    const [invCantidad, setInvCantidad] = useState(10);
    const [avisoOk, setAvisoOk] = useState('');

    const cargarEstudiantes = async () => {
        try {
            const [est, inv] = await Promise.all([
                docenteService.misEstudiantes(),
                docenteService.listarInvitaciones()
            ]);
            setMisEstudiantes(est);
            setInvitaciones(inv);
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
    const irAMateria = (nombre, subvista = '') => {
        if (!nombre) return;
        setPagina('materias');
        setMateriaSeleccionada(nombre);
        setSubVistaMateria(subvista);
    };

    const handleGenerarInvitaciones = async (e) => {
        e.preventDefault();
        try {
            setErrorMaterial('');
            const data = await docenteService.generarInvitaciones(invCantidad, invCurso.trim());
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
        <div className="dashboard">

            <div className ="sidebar-container">
                <aside className="sidebar">
                <div className="aside-content-options">
                    <h2 style={{pointerEvents:"none"}}>Unidad Educativa Benemérita Sociedad Filantrópica del Guayas</h2>
                    <List>
                        <ListItem disablePadding>
                            <ListItemButton className="nav-item" onClick={() => setPagina("")}>
                                <ListItemIcon className="nav-icon">
                                <HomeFilledIcon sx={{ fontSize: "1.3rem" }} />
                            </ListItemIcon>
                            <ListItemText primary="Home" />
                            </ListItemButton>
                        </ListItem>
                        <ListItem disablePadding>
                            <ListItemButton className="nav-item" onClick={() => setPagina("materias")}>
                                <ListItemIcon className="nav-icon">
                                <MenuBookIcon sx={{ fontSize: "1.3rem" }} />
                            </ListItemIcon>
                            <ListItemText primary="Materias" />
                                </ListItemButton>
                        </ListItem>
                        <ListItem disablePadding>
                            <ListItemButton className="nav-item" onClick={() => setPagina("estudiantes")}>
                                <ListItemIcon className="nav-icon">
                                <GroupsRoundedIcon sx={{ fontSize: "1.3rem" }} />
                            </ListItemIcon>
                            <ListItemText primary="Mis Estudiantes" />
                            </ListItemButton>
                        </ListItem>
                        <ListItem disablePadding>
                            <ListItemButton className="nav-item" onClick={() => setPagina("asistente")}>
                                <ListItemIcon className="nav-icon">
                                <AutoAwesomeRoundedIcon sx={{ fontSize: "1.3rem" }} />
                            </ListItemIcon>
                            <ListItemText primary="Asistente IA" />
                            </ListItemButton>
                        </ListItem>
                    </List>
                </div>
                <div className="aside-content-user">
                    <div className="user-avatar">D</div>
                    <div className="user-meta">
                        <span className="user-name">Docente</span>
                        <span className='email-user-account'>{authService.getUsuario()?.username}</span>
                    </div>
                </div>
                <button className="logout-btn" onClick={cerrarSesion}>
                    <LogoutRoundedIcon sx={{ fontSize: "1.1rem" }} />
                    Cerrar sesión
                </button>
            </aside>

            <main className="contenido">

                {/* HOME — orden RFC-004: bienvenida → continuar trabajando →
                    mi aula → contenido → actividad reciente. Solo datos reales. */}
                {pagina === "" && (
                    <div className="dash-secciones">
                        <DashboardHeader
                            titulo={`Hola, ${authService.getUsuario()?.username || 'docente'}`}
                            subtitulo="Crea contenido para tus materias y acompaña el avance de tu aula."
                            chips={[
                                `${materias.length} ${materias.length === 1 ? 'materia asignada' : 'materias asignadas'}`,
                                `${misEstudiantes.length} ${misEstudiantes.length === 1 ? 'estudiante' : 'estudiantes'}`
                            ]}
                        />

                        <SectionCard titulo="Continuar trabajando" Icon={AutoAwesomeRoundedIcon}>
                            {borradorReciente ? (
                                <QuickActionCard
                                    Icon={AutoAwesomeRoundedIcon}
                                    titulo="Retoma tu borrador de quiz"
                                    descripcion={`"${borradorReciente.tema}" en ${borradorReciente.materia} · ${borradorReciente.cantidad} preguntas sin publicar.`}
                                    cta="Continuar editando"
                                    onClick={() => irAMateria(borradorReciente.materia, 'quiz')}
                                />
                            ) : materiaSugerida ? (
                                <QuickActionCard
                                    Icon={MenuBookIcon}
                                    titulo={`Crea contenido en ${materiaSugerida}`}
                                    descripcion={`Tiene ${(retosPorMateria[materiaSugerida] || []).length} retos publicados. Genera un quiz, un juego o una misión.`}
                                    cta={`Ir a ${materiaSugerida}`}
                                    onClick={() => irAMateria(materiaSugerida)}
                                />
                            ) : (
                                <EmptyState
                                    Icon={MenuBookIcon}
                                    titulo="Aún no tienes materias asignadas"
                                    mensaje="Pide al administrador que te asigne materias para empezar a crear contenido."
                                />
                            )}
                        </SectionCard>

                        <SectionCard
                            titulo="Mi Aula"
                            Icon={GroupsRoundedIcon}
                            accion={{ label: 'Gestionar', onClick: () => setPagina('estudiantes') }}
                        >
                            {(misEstudiantes.length || invitaciones.length) ? (
                                <div className="stats-row">
                                    <StatCard
                                        Icon={GroupsRoundedIcon}
                                        valor={misEstudiantes.length}
                                        etiqueta="Estudiantes registrados"
                                        tono="primary"
                                    />
                                    <StatCard
                                        Icon={VpnKeyRoundedIcon}
                                        valor={invitaciones.filter((i) => i.estado === 'pendiente').length}
                                        etiqueta="Invitaciones pendientes"
                                        tono="accent"
                                    />
                                    <StatCard
                                        Icon={TaskAltRoundedIcon}
                                        valor={invitaciones.filter((i) => i.estado === 'usado').length}
                                        etiqueta="Códigos usados"
                                        tono="primary"
                                    />
                                </div>
                            ) : (
                                <EmptyState
                                    Icon={VpnKeyRoundedIcon}
                                    titulo="Tu aula está vacía"
                                    mensaje="Genera códigos de invitación para que tus estudiantes se registren solos."
                                    accion={{ label: 'Generar invitaciones', onClick: () => setPagina('estudiantes') }}
                                />
                            )}
                        </SectionCard>

                        <SectionCard
                            titulo="Contenido"
                            Icon={MenuBookIcon}
                            tag={materias.length ? `${materias.length} materias` : undefined}
                        >
                            {materias.length ? (
                                <ul className="contenido-materias">
                                    {materias.map((mat) => {
                                        const retos = retosPorMateria[mat] || [];
                                        const cuenta = (tipo) => retos.filter((r) => r.tipo === tipo).length;
                                        return (
                                            <li key={mat}>
                                                <button
                                                    type="button"
                                                    className="contenido-materia-btn"
                                                    onClick={() => irAMateria(mat)}
                                                >
                                                    <MenuBookIcon className="contenido-materia-icono" />
                                                    <span className="contenido-materia-nombre">{mat}</span>
                                                    <span className="contenido-materia-detalle">
                                                        {cuenta('quiz')} quizzes · {cuenta('clasificador')} juegos · {cuenta('mision')} misiones
                                                    </span>
                                                    <ArrowForwardRoundedIcon sx={{ fontSize: '1rem' }} />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <EmptyState
                                    Icon={MenuBookIcon}
                                    titulo="Sin materias asignadas"
                                    mensaje="Cuando el administrador te asigne materias, aparecerán aquí con su contenido."
                                />
                            )}
                        </SectionCard>

                        <SectionCard
                            titulo="Actividad reciente"
                            Icon={TaskAltRoundedIcon}
                            tag={retosRecientes.length ? `${retosRecientes.length} retos` : undefined}
                        >
                            {retosRecientes.length ? (
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
                                    titulo="Aún no has publicado retos"
                                    mensaje="Publica tu primer quiz, juego o misión para que aparezca aquí."
                                    accion={materiaSugerida
                                        ? { label: 'Crear mi primer reto', onClick: () => irAMateria(materiaSugerida, 'quiz') }
                                        : undefined}
                                />
                            )}
                        </SectionCard>
                    </div>
                )}

                {/* MATERIAS GRID */}
                {pagina === "materias" && !materiaSeleccionada && (
                    <>
                        <h1 style={{pointerEvents:"none"}}>Materias</h1>

                        <div className="materias-grid">
                            {materias.map((mat, index) => (
                                <div
                                    key={index}
                                    className="materia-card"
                                    onClick={() => setMateriaSeleccionada(mat)}
                                >
                                    <MenuBookIcon className="materia-card-icon" />
                                    <span>{mat}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* MATERIA DETALLE */}
                {pagina === "materias" && materiaSeleccionada && (
                    <>
                        <button
                            className="back-btn"
                            onClick={() => { setMateriaSeleccionada(null); setArchivoPreview(null); setSubVistaMateria('recursos'); }}
                        >
                            ← Volver
                        </button>

                        <h1 style={{pointerEvents:"none"}}>{materiaSeleccionada}</h1>

                        <WidgetsRendimiento
                            materia={materiaSeleccionada}
                            topEstudiantes={ranking}
                            retosPublicados={(retosPorMateria[materiaSeleccionada] || []).length}
                            siguientePaso={
                                (archivosPorMateria[materiaSeleccionada] || []).length > 0
                                    ? { descripcion: "Ya tienes material cargado. Pon a prueba a tus estudiantes generando un quiz.", label: "Ir al Quiz", destino: "quiz" }
                                    : { descripcion: "Aún no hay material en esta materia. Súbelo desde los contenedores y luego genera un quiz.", label: "Generar Quiz", destino: "quiz" }
                            }
                            onAccion={(destino) => setSubVistaMateria(destino)}
                        />

                        {errorMaterial && (
                            <div className="aviso-migracion" role="alert">
                                <p>{errorMaterial}</p>
                                <button onClick={() => setErrorMaterial('')}>Entendido</button>
                            </div>
                        )}

                        {/* Área de archivos siempre visible, dividida por audiencia */}
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
                                archivos={(archivosPorMateria[materiaSeleccionada] || []).filter((a) => a.isPrivate)}
                                isPrivate={true}
                                onUpload={(file, opts) => handleUploadMateria(materiaSeleccionada, file, opts)}
                                onPreview={setArchivoPreview}
                            />
                        </div>

                        <div className="materia-panel">
                            <button
                                className={`opcion ${subVistaMateria === 'quiz' ? 'opcion-activa' : ''}`}
                                onClick={() => setSubVistaMateria('quiz')}
                            >
                                Generar Quiz
                            </button>
                            <button
                                className={`opcion ${subVistaMateria === 'clasificador' ? 'opcion-activa' : ''}`}
                                onClick={() => setSubVistaMateria('clasificador')}
                            >
                                Juego Clasificador
                            </button>
                            <button
                                className={`opcion ${subVistaMateria === 'mision' ? 'opcion-activa' : ''}`}
                                onClick={() => setSubVistaMateria('mision')}
                            >
                                Misión Narrativa
                            </button>
                            <button
                                className={`opcion ${subVistaMateria === 'calificaciones' ? 'opcion-activa' : ''}`}
                                onClick={() => setSubVistaMateria('calificaciones')}
                            >
                                Libro de Calificaciones
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

                        {subVistaMateria === 'calificaciones' && (
                            <section className="card materia-subvista">
                                <h3>Libro de Calificaciones de {materiaSeleccionada}</h3>
                            </section>
                        )}
                    </>
                )}

                {/* MIS ESTUDIANTES: invitaciones de registro y reseteo de PIN */}
                {pagina === "estudiantes" && (
                    <>
                        <h1 style={{pointerEvents:"none"}}>Mis Estudiantes</h1>
                        <p className="contenido-sub">Genera códigos de invitación para que tus estudiantes se registren, y ayúdalos si olvidan su PIN.</p>

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
                                <input
                                    placeholder='Curso (ej: "2do A")'
                                    value={invCurso}
                                    onChange={(e) => setInvCurso(e.target.value)}
                                />
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
                                <span className="card-tag">{misEstudiantes.length}</span>
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
                    </>
                )}

                {/* ASISTENTE IA */}
                {pagina === "asistente" && (
                    <AsistenteIA />
                )}

            </main>
            </div>

            <FilePreviewModal
                archivo={archivoPreview}
                onClose={() => setArchivoPreview(null)}
                onDownload={descargarArchivo}
                onDelete={(a) => handleEliminarArchivo(materiaSeleccionada, a.id)}
            />
        </div>
    );
}
