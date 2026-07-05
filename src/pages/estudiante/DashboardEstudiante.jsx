import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../admin/dashboard.css';
import './dashboardEstudiante.css';
import HomeFilledIcon from '@mui/icons-material/HomeFilled';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import MilitaryTechRoundedIcon from '@mui/icons-material/MilitaryTechRounded';
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import QuizRoundedIcon from '@mui/icons-material/QuizRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import {
    List,
    ListItem,
    ListItemIcon,
    ListItemButton,
    ListItemText
} from '@mui/material';
import { FileChip, FilePreviewModal, descargarArchivo } from '../../components/archivos/ArchivoChip';
import { QuizInteractivo } from '../../components/quiz/QuizInteractivo';
import { JuegoDragAndDrop } from '../../components/clasificador/JuegoDragAndDrop';
import { MisionNarrativa } from '../../components/mision/MisionNarrativa';
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded';
import { obtenerRetosPublicados } from '../../services/retosService';
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded';
import gamificationService, { CATALOGO_LOGROS } from '../../services/gamificationService';
import authService from '../../services/authService';
import { obtenerMaterial } from '../../services/materialesService';
import MATERIAS, { NOMBRES_MATERIAS } from '../../constants/materias';
import {
    DashboardHeader,
    StatCard,
    SectionCard,
    EmptyState,
    QuickActionCard,
    formatearFecha
} from '../../components/dashboard/DashboardWidgets';

const materias = NOMBRES_MATERIAS;

// Presentación (icono + color) por cada logro del catálogo del servicio.
const LOGRO_UI = {
    'primer-quiz': { icon: QuizRoundedIcon, color: "gold" },
    'maestro-materia': { icon: WorkspacePremiumRoundedIcon, color: "primary" },
    'racha-7': { icon: LocalFireDepartmentRoundedIcon, color: "fire" },
    'estrella-aula': { icon: StarRoundedIcon, color: "accent" },
    'explorador': { icon: MenuBookIcon, color: "primary" }
};

function LogroCard({ logro, obtenido }) {
    const { icon: Icon, color } = LOGRO_UI[logro.id] || { icon: StarRoundedIcon, color: "primary" };
    return (
        <div className={`logro-card ${obtenido ? '' : 'logro-bloqueado'}`}>
            <span className={`logro-icon logro-icon-${color}`}>
                {obtenido ? <Icon /> : <LockRoundedIcon />}
            </span>
            <h4>{logro.titulo}</h4>
            <p>{logro.desc}</p>
            {obtenido && <span className="logro-badge">Obtenido</span>}
        </div>
    );
}

export function DashboardEstudiante() {
    const navigate = useNavigate();
    const [pagina, setPagina] = useState("");
    const [materiaSeleccionada, setMateriaSeleccionada] = useState(null);
    const [subVista, setSubVista] = useState('material');
    const [archivoPreview, setArchivoPreview] = useState(null);
    const [quizActivo, setQuizActivo] = useState(null);
    // Retos publicados por el docente en la BD: quizzes y juegos.
    const [quizzes, setQuizzes] = useState([]);
    const [juegos, setJuegos] = useState([]);
    const [juegoActivo, setJuegoActivo] = useState(null);
    const [misionesRetos, setMisionesRetos] = useState([]);
    const [misionActiva, setMisionActiva] = useState(null);
    // Material de estudio de la materia abierta, consultado a la API (la BD
    // central): es el mismo que ve el docente y cualquier otro dispositivo.
    const [archivos, setArchivos] = useState([]);
    // Ranking real del aula (GET /api/ranking). Se pide amplio (50) para
    // poder mostrar la posición propia aunque no esté en el Top 3.
    const [ranking, setRanking] = useState([]);
    // Detalle del avance por reto (GET /api/progreso/:id): alimenta
    // "Continuar aprendiendo" y "Actividad reciente" con datos reales.
    const [progresoDetalle, setProgresoDetalle] = useState([]);
    // Todos los retos publicados: fallback de "Continuar aprendiendo"
    // cuando el estudiante aún no tiene progreso registrado.
    const [retosDisponibles, setRetosDisponibles] = useState([]);

    // Identidad del estudiante en sesión: habilita la persistencia en MySQL.
    const estudianteId = gamificationService.getEstudianteId();

    // Fuerza un re-render cuando llega la sincronización con el servidor.
    const [, setSync] = useState(0);

    // Datos reales de gamificación: se leen en cada render, así que reflejan el
    // XP/los logros más recientes al cambiar de página o al salir de un quiz.
    const gami = gamificationService.getResumen();

    // Al entrar: trae de la BD el XP oficial del estudiante, el ranking del
    // aula, su avance por reto y los retos publicados; refresca al llegar.
    useEffect(() => {
        let vigente = true;
        const tareas = [
            gamificationService.obtenerRanking(50).then((filas) => {
                if (vigente) setRanking(filas);
            }),
            obtenerRetosPublicados().then((retos) => {
                if (vigente) setRetosDisponibles(retos);
            })
        ];
        if (estudianteId) {
            tareas.push(gamificationService.obtenerProgreso(estudianteId).then((data) => {
                if (vigente && Array.isArray(data?.progreso)) setProgresoDetalle(data.progreso);
            }));
        }
        Promise.allSettled(tareas).then(() => { if (vigente) setSync((s) => s + 1); });
        return () => { vigente = false; };
    }, [estudianteId]);

    // Carga desde la BD los quizzes y juegos publicados y el material de la
    // materia abierta. Si la red falla, los servicios devuelven [] y las
    // pestañas muestran su estado vacío. El servidor ya filtra el material
    // privado del docente para el rol estudiante.
    useEffect(() => {
        if (!materiaSeleccionada) return;
        const materia = MATERIAS.find((m) => m.nombre === materiaSeleccionada);
        if (!materia) return;
        let vigente = true;
        obtenerRetosPublicados({ materiaId: materia.id, tipo: 'quiz' })
            .then((retos) => { if (vigente) setQuizzes(retos.filter((r) => r.configuracion?.preguntas?.length)); });
        obtenerRetosPublicados({ materiaId: materia.id, tipo: 'clasificador' })
            .then((retos) => { if (vigente) setJuegos(retos); });
        obtenerRetosPublicados({ materiaId: materia.id, tipo: 'mision' })
            .then((retos) => { if (vigente) setMisionesRetos(retos.filter((r) => r.configuracion?.desafios?.length)); });
        obtenerMaterial(materia.id)
            .then((lista) => { if (vigente) setArchivos(lista); });
        return () => { vigente = false; };
    }, [materiaSeleccionada]);

    // Ranking real del aula; el propio estudiante se resalta por su id.
    const rankingDinamico = useMemo(() => (
        ranking.map((r) => ({
            esYo: r.id === estudianteId,
            nombre: r.id === estudianteId ? 'Tú' : r.nombre,
            puntos: r.xp_total
        }))
    ), [ranking, estudianteId]);

    // Posición real del estudiante dentro del ranking consultado (o null).
    const posicionPropia = useMemo(
        () => ranking.find((r) => r.id === estudianteId)?.posicion ?? null,
        [ranking, estudianteId]
    );

    // Avance por reto ordenado del más reciente al más antiguo.
    const actividadReciente = useMemo(
        () => [...progresoDetalle].sort(
            (a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en)
        ),
        [progresoDetalle]
    );
    const ultimaActividad = actividadReciente[0] || null;

    // Fallback sin progreso: la actividad publicada más antigua es la
    // "primera" disponible (la API las devuelve de más nueva a más vieja).
    const primerRetoDisponible = retosDisponibles.length
        ? retosDisponibles[retosDisponibles.length - 1]
        : null;
    const materiaPrimerReto = primerRetoDisponible
        ? MATERIAS.find((m) => m.id === primerRetoDisponible.materia_id)?.nombre
        : null;

    const abrirMateria = (mat) => {
        setMateriaSeleccionada(mat);
        setSubVista('material');
        setQuizActivo(null);
        setJuegoActivo(null);
        setMisionActiva(null);
        setQuizzes([]);
        setJuegos([]);
        setMisionesRetos([]);
        setArchivos([]);
    };

    // Salto directo desde el Home a una materia (sugerencias del dashboard).
    const irAMateria = (nombre) => {
        if (!nombre) return;
        setPagina('materias');
        abrirMateria(nombre);
    };

    const volver = () => {
        setMateriaSeleccionada(null);
        setArchivoPreview(null);
        setQuizActivo(null);
        setJuegoActivo(null);
        setMisionActiva(null);
        setSubVista('material');
    };

    const cerrarSesion = () => {
        authService.logout();
        navigate('/');
    };

    // Nombre real del estudiante (viene del registro con invitación); las
    // cuentas antiguas sin nombre completo muestran el genérico.
    const nombreEstudiante = authService.getUsuario()?.nombre_completo || 'Estudiante';

    const handleCambiarPin = async () => {
        const pinActual = window.prompt('Escribe tu PIN actual (6 letras o números):');
        if (!pinActual) return;
        const pinNuevo = window.prompt('Escribe tu PIN nuevo (6 letras o números):');
        if (!pinNuevo) return;
        try {
            const data = await authService.cambiarPin(pinActual.trim(), pinNuevo.trim());
            window.alert(data.mensaje);
        } catch (err) {
            window.alert(err.message);
        }
    };

    return (
        <div className="dashboard">
            <div className="sidebar-container">
                <aside className="sidebar">
                    <div className="aside-content-options">
                        <h2 style={{ pointerEvents: "none" }}>Unidad Educativa Benemérita Sociedad Filantrópica del Guayas</h2>
                        <List>
                            <ListItem disablePadding>
                                <ListItemButton className="nav-item" onClick={() => { setPagina(""); setMateriaSeleccionada(null); }}>
                                    <ListItemIcon className="nav-icon"><HomeFilledIcon sx={{ fontSize: "1.3rem" }} /></ListItemIcon>
                                    <ListItemText primary="Inicio" />
                                </ListItemButton>
                            </ListItem>
                            <ListItem disablePadding>
                                <ListItemButton className="nav-item" onClick={() => { setPagina("materias"); setMateriaSeleccionada(null); }}>
                                    <ListItemIcon className="nav-icon"><MenuBookIcon sx={{ fontSize: "1.3rem" }} /></ListItemIcon>
                                    <ListItemText primary="Mis Materias" />
                                </ListItemButton>
                            </ListItem>
                            <ListItem disablePadding>
                                <ListItemButton className="nav-item" onClick={() => { setPagina("logros"); setMateriaSeleccionada(null); }}>
                                    <ListItemIcon className="nav-icon"><EmojiEventsRoundedIcon sx={{ fontSize: "1.3rem" }} /></ListItemIcon>
                                    <ListItemText primary="Mis Logros" />
                                </ListItemButton>
                            </ListItem>
                        </List>
                    </div>
                    <div className="aside-bottom">
                        <div className="aside-content-user">
                            <div className="user-avatar">{nombreEstudiante.charAt(0).toUpperCase()}</div>
                            <div className="user-meta">
                                <span className="user-name">{nombreEstudiante}</span>
                                <span className="email-user-account">Estudiante</span>
                            </div>
                        </div>
                        <button className="logout-btn" onClick={handleCambiarPin}>
                            <LockRoundedIcon sx={{ fontSize: "1.1rem" }} />
                            Cambiar mi PIN
                        </button>
                        <button className="logout-btn" onClick={cerrarSesion}>
                            <LogoutRoundedIcon sx={{ fontSize: "1.1rem" }} />
                            Cerrar sesión
                        </button>
                    </div>
                </aside>

                <main className="contenido">

                    {/* INICIO — orden RFC-004: bienvenida → continuar →
                        progreso → comunidad → actividad reciente. */}
                    {pagina === "" && (
                        <div className="dash-secciones">
                            <DashboardHeader
                                titulo={`¡Hola, ${nombreEstudiante.split(' ')[0]}! 👋`}
                                subtitulo="Sigue aprendiendo y suma puntos para subir en el ranking."
                                chips={[`Nivel ${gami.nivel}`, `${gami.xp} XP`]}
                            />

                            <SectionCard titulo="Continuar aprendiendo" Icon={RocketLaunchRoundedIcon}>
                                {ultimaActividad ? (
                                    <QuickActionCard
                                        Icon={ArrowForwardRoundedIcon}
                                        titulo={`Continúa en ${ultimaActividad.materia}`}
                                        descripcion={`Tu última actividad fue "${ultimaActividad.reto}" (${ultimaActividad.porcentaje}% completado).`}
                                        cta={`Ir a ${ultimaActividad.materia}`}
                                        onClick={() => irAMateria(ultimaActividad.materia)}
                                    />
                                ) : materiaPrimerReto ? (
                                    <QuickActionCard
                                        Icon={ArrowForwardRoundedIcon}
                                        titulo="Tu primera actividad te espera"
                                        descripcion={`"${primerRetoDisponible.titulo}" está disponible en ${materiaPrimerReto}.`}
                                        cta={`Ir a ${materiaPrimerReto}`}
                                        onClick={() => irAMateria(materiaPrimerReto)}
                                    />
                                ) : (
                                    <EmptyState
                                        Icon={MenuBookIcon}
                                        titulo="Aún no hay actividades publicadas"
                                        mensaje="Tu docente todavía no ha publicado retos. ¡Vuelve pronto!"
                                    />
                                )}
                            </SectionCard>

                            <SectionCard
                                titulo="Mi progreso"
                                Icon={StarRoundedIcon}
                                accion={{ label: 'Ver mis logros', onClick: () => setPagina('logros') }}
                            >
                                <div className="stats-row">
                                    <StatCard Icon={StarRoundedIcon} valor={gami.xp} etiqueta="XP acumulado" tono="primary" />
                                    <StatCard Icon={LocalFireDepartmentRoundedIcon} valor={gami.nivel} etiqueta="Nivel actual" tono="fire" />
                                    <StatCard Icon={EmojiEventsRoundedIcon} valor={gami.totalLogros} etiqueta="Logros obtenidos" tono="accent" />
                                </div>
                            </SectionCard>

                            <SectionCard
                                titulo="Mi comunidad"
                                Icon={MilitaryTechRoundedIcon}
                                tag={posicionPropia ? `Tu posición: #${posicionPropia}` : undefined}
                            >
                                {rankingDinamico.length ? (
                                    <ol className="rank-list">
                                        {rankingDinamico.slice(0, 3).map((r, i) => (
                                            <li key={i} className={`rank-item ${r.esYo ? "rank-item-yo" : ""}`}>
                                                <span className={`rank-pos rank-pos-${i + 1}`}>{i + 1}</span>
                                                <span className="rank-name">{r.nombre}</span>
                                                <span className="rank-points">{r.puntos} pts</span>
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    <EmptyState
                                        Icon={MilitaryTechRoundedIcon}
                                        titulo="El ranking está vacío"
                                        mensaje="Completa actividades para aparecer en el ranking de tu aula."
                                    />
                                )}
                            </SectionCard>

                            <SectionCard
                                titulo="Actividad reciente"
                                Icon={TaskAltRoundedIcon}
                                tag={actividadReciente.length ? `${actividadReciente.length} actividades` : undefined}
                            >
                                {actividadReciente.length ? (
                                    <ul className="actividad-lista">
                                        {actividadReciente.slice(0, 5).map((a) => (
                                            <li key={a.reto_id} className="actividad-item">
                                                <span className="actividad-icono">
                                                    {a.completado ? <CheckCircleRoundedIcon /> : <TaskAltRoundedIcon />}
                                                </span>
                                                <div className="actividad-meta">
                                                    <strong>{a.reto}</strong>
                                                    <span>{a.materia} · {a.porcentaje}%</span>
                                                </div>
                                                <span className="actividad-fecha">{formatearFecha(a.actualizado_en)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <EmptyState
                                        Icon={TaskAltRoundedIcon}
                                        titulo="Sin actividad todavía"
                                        mensaje="Cuando completes quizzes, juegos o misiones aparecerán aquí."
                                        accion={{ label: 'Explorar mis materias', onClick: () => setPagina('materias') }}
                                    />
                                )}
                            </SectionCard>
                        </div>
                    )}

                    {/* MATERIAS GRID */}
                    {pagina === "materias" && !materiaSeleccionada && (
                        <>
                            <h1 style={{ pointerEvents: "none" }}>Mis Materias</h1>
                            <p className="contenido-sub" style={{ pointerEvents: "none" }}>Elige una materia para repasar el material y poner a prueba lo aprendido.</p>
                            <div className="materias-grid">
                                {materias.map((mat, index) => (
                                    <div key={index} className="materia-card" onClick={() => abrirMateria(mat)}>
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
                            <button className="back-btn" onClick={volver}>← Volver</button>
                            <h1 style={{ pointerEvents: "none" }}>{materiaSeleccionada}</h1>

                            <div className="materia-panel materia-panel-est">
                                <button
                                    className={`opcion ${subVista === 'material' ? 'opcion-activa' : ''}`}
                                    onClick={() => { setSubVista('material'); setQuizActivo(null); }}
                                >
                                    Material de estudio
                                </button>
                                <button
                                    className={`opcion ${subVista === 'quizzes' ? 'opcion-activa' : ''}`}
                                    onClick={() => { setSubVista('quizzes'); setJuegoActivo(null); }}
                                >
                                    Quizzes disponibles
                                </button>
                                <button
                                    className={`opcion ${subVista === 'juegos' ? 'opcion-activa' : ''}`}
                                    onClick={() => { setSubVista('juegos'); setQuizActivo(null); setMisionActiva(null); }}
                                >
                                    Juegos
                                </button>
                                <button
                                    className={`opcion ${subVista === 'misiones' ? 'opcion-activa' : ''}`}
                                    onClick={() => { setSubVista('misiones'); setQuizActivo(null); setJuegoActivo(null); }}
                                >
                                    Misiones
                                </button>
                            </div>

                            {subVista === 'material' && (
                                <section className="card materia-cards">
                                    <div className="card-head">
                                        <h3>Material de estudio</h3>
                                        <span className="card-tag">{archivos.length} recursos</span>
                                    </div>
                                    {archivos.length > 0 ? (
                                        <div className="file-chip-grid">
                                            {archivos.map((archivo) => (
                                                <FileChip key={archivo.id} archivo={archivo} onClick={() => setArchivoPreview(archivo)} />
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="vacio-msg">Tu docente aún no ha publicado material para esta materia.</p>
                                    )}
                                </section>
                            )}

                            {subVista === 'quizzes' && !quizActivo && (
                                <section className="card materia-cards">
                                    <div className="card-head">
                                        <h3>Quizzes disponibles</h3>
                                        <span className="card-tag">{quizzes.length} quizzes</span>
                                    </div>
                                    {quizzes.length > 0 ? (
                                        <ul className="quiz-disponible-lista">
                                            {quizzes.map((q) => (
                                                <li key={q.id}>
                                                    <button className="quiz-disponible-item" onClick={() => setQuizActivo(q)}>
                                                        <span className="quiz-disponible-icon"><QuizRoundedIcon /></span>
                                                        <span className="quiz-disponible-meta">
                                                            <span className="quiz-disponible-tema">{q.titulo}</span>
                                                            <span className="quiz-disponible-sub">
                                                                {q.configuracion.preguntas.length} preguntas · {q.xp_recompensa} XP
                                                            </span>
                                                        </span>
                                                        <span className="quiz-disponible-cta">
                                                            Empezar <ArrowForwardRoundedIcon sx={{ fontSize: "1rem" }} />
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="vacio-msg">Aún no hay quizzes publicados en esta materia. ¡Vuelve pronto!</p>
                                    )}
                                </section>
                            )}

                            {subVista === 'quizzes' && quizActivo && (
                                <section className="card materia-subvista">
                                    <div className="card-head">
                                        <h3>{quizActivo.titulo}</h3>
                                        <button className="back-btn back-btn-inline" onClick={() => setQuizActivo(null)}>← Otros quizzes</button>
                                    </div>
                                    <QuizInteractivo
                                        preguntas={quizActivo.configuracion.preguntas}
                                        mostrarPuntaje
                                        estudianteId={estudianteId}
                                        reto={quizActivo}
                                    />
                                </section>
                            )}
                            {subVista === 'juegos' && !juegoActivo && (
                                <section className="card materia-cards">
                                    <div className="card-head">
                                        <h3>Juegos disponibles</h3>
                                        <span className="card-tag">{juegos.length} juegos</span>
                                    </div>
                                    {juegos.length > 0 ? (
                                        <ul className="quiz-disponible-lista">
                                            {juegos.map((j) => (
                                                <li key={j.id}>
                                                    <button className="quiz-disponible-item" onClick={() => setJuegoActivo(j)}>
                                                        <span className="quiz-disponible-icon"><ExtensionRoundedIcon /></span>
                                                        <span className="quiz-disponible-meta">
                                                            <span className="quiz-disponible-tema">{j.titulo}</span>
                                                            <span className="quiz-disponible-sub">
                                                                Clasificador · {j.configuracion?.categorias?.length || 0} categorías · {j.xp_recompensa} XP
                                                            </span>
                                                        </span>
                                                        <span className="quiz-disponible-cta">
                                                            Jugar <ArrowForwardRoundedIcon sx={{ fontSize: "1rem" }} />
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="vacio-msg">Aún no hay juegos publicados en esta materia. ¡Vuelve pronto!</p>
                                    )}
                                </section>
                            )}

                            {subVista === 'misiones' && !misionActiva && (
                                <section className="card materia-cards">
                                    <div className="card-head">
                                        <h3>Misiones narrativas</h3>
                                        <span className="card-tag">{misionesRetos.length} aventuras</span>
                                    </div>
                                    {misionesRetos.length > 0 ? (
                                        <ul className="quiz-disponible-lista">
                                            {misionesRetos.map((m) => (
                                                <li key={m.id}>
                                                    <button className="quiz-disponible-item" onClick={() => setMisionActiva(m)}>
                                                        <span className="quiz-disponible-icon"><AutoStoriesRoundedIcon /></span>
                                                        <span className="quiz-disponible-meta">
                                                            <span className="quiz-disponible-tema">{m.titulo}</span>
                                                            <span className="quiz-disponible-sub">
                                                                Aventura · {m.configuracion.desafios.length} desafíos · {m.xp_recompensa} XP
                                                            </span>
                                                        </span>
                                                        <span className="quiz-disponible-cta">
                                                            Comenzar <ArrowForwardRoundedIcon sx={{ fontSize: "1rem" }} />
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="vacio-msg">Aún no hay misiones publicadas en esta materia. ¡Vuelve pronto!</p>
                                    )}
                                </section>
                            )}

                            {subVista === 'misiones' && misionActiva && (
                                <section className="card materia-subvista">
                                    <div className="card-head">
                                        <h3>{misionActiva.titulo}</h3>
                                        <button className="back-btn back-btn-inline" onClick={() => setMisionActiva(null)}>← Otras misiones</button>
                                    </div>
                                    <MisionNarrativa
                                        reto={misionActiva}
                                        estudianteId={estudianteId}
                                        onSalir={() => setMisionActiva(null)}
                                    />
                                </section>
                            )}

                            {subVista === 'juegos' && juegoActivo && (
                                <section className="card materia-subvista">
                                    <div className="card-head">
                                        <h3>{juegoActivo.titulo}</h3>
                                        <button className="back-btn back-btn-inline" onClick={() => setJuegoActivo(null)}>← Otros juegos</button>
                                    </div>
                                    <JuegoDragAndDrop
                                        reto={juegoActivo}
                                        estudianteId={estudianteId}
                                        onSalir={() => setJuegoActivo(null)}
                                    />
                                </section>
                            )}
                        </>
                    )}

                    {/* LOGROS */}
                    {pagina === "logros" && (
                        <>
                            <h1 style={{ pointerEvents: "none" }}>Mis Logros</h1>
                            <p className="contenido-sub" style={{ pointerEvents: "none" }}>Desbloquea insignias completando misiones y quizzes.</p>
                            <div className="logros-grid">
                                {CATALOGO_LOGROS.map((logro) => (
                                    <LogroCard key={logro.id} logro={logro} obtenido={gami.logros.includes(logro.id)} />
                                ))}
                            </div>
                        </>
                    )}

                </main>
            </div>

            <FilePreviewModal
                archivo={archivoPreview}
                onClose={() => setArchivoPreview(null)}
                onDownload={descargarArchivo}
            />
        </div>
    );
}
