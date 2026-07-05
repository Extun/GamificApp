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
import { obtenerRetosPublicados } from '../../services/retosService';
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded';
import gamificationService, { CATALOGO_LOGROS } from '../../services/gamificationService';
import authService from '../../services/authService';
import { obtenerMaterial } from '../../services/materialesService';
import { migrarMateriasAntiguas } from '../../services/migracionMaterias';
import MATERIAS, { NOMBRES_MATERIAS } from '../../constants/materias';

// El estudiante consume el material desde la API (misma BD que el docente y
// que la app móvil); los quizzes generados aún se leen de localStorage.
const leerQuizzes = () => {
    try {
        const data = localStorage.getItem('edu_historialQuizzes');
        const parsed = data ? JSON.parse(data) : {};
        return Array.isArray(parsed) ? {} : parsed;
    } catch {
        return {};
    }
};

const materias = NOMBRES_MATERIAS;

// Compañeros de aula (mock). El propio estudiante se añade en runtime con su XP real.
const ranking = [
    { nombre: "Ana Pérez", puntos: 1280 },
    { nombre: "Luis Mora", puntos: 1150 },
    { nombre: "Sofía Díaz", puntos: 1090 }
];

const misiones = [
    { titulo: "Completar el quiz de Fracciones", progreso: 60 },
    { titulo: "Leer el material de Ciencias Naturales", progreso: 30 },
    { titulo: "Repasar la lectura de Lenguaje", progreso: 0 }
];

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
    // Juegos (retos con configuración) publicados por el docente en la BD.
    const [juegos, setJuegos] = useState([]);
    const [juegoActivo, setJuegoActivo] = useState(null);

    // Reubica el contenido guardado bajo nombres de materias antiguos ANTES
    // de leerlo, para que nada quede invisible tras el cambio de catálogo.
    const quizzesPorMateria = useMemo(() => { migrarMateriasAntiguas(); return leerQuizzes(); }, []);
    // Material de estudio de la materia abierta, consultado a la API (la BD
    // central): es el mismo que ve el docente y cualquier otro dispositivo.
    const [archivos, setArchivos] = useState([]);

    // Identidad del estudiante en sesión: habilita la persistencia en MySQL.
    const estudianteId = gamificationService.getEstudianteId();

    // Datos reales de gamificación: se leen en cada render, así que reflejan el
    // XP/los logros más recientes al cambiar de página o al salir de un quiz.
    const gami = gamificationService.getResumen();

    // RBAC: el alumno solo ve los quizzes que el docente ya PUBLICÓ; los borradores
    // en edición permanecen ocultos.
    const quizzes = materiaSeleccionada
        ? (quizzesPorMateria[materiaSeleccionada] || []).filter((q) => q.estado === 'publicado')
        : [];

    // Reto asociado al quiz activo: se identifica por (materia, título) y el
    // backend lo crea en `retos` la primera vez que alguien lo completa.
    const retoActivo = useMemo(() => {
        if (!quizActivo || !materiaSeleccionada) return null;
        const materia = MATERIAS.find((m) => m.nombre === materiaSeleccionada);
        if (!materia) return null;
        return {
            materiaId: materia.id,
            titulo: quizActivo.tema,
            xpRecompensa: (quizActivo.preguntas?.length || 0) * 100
        };
    }, [quizActivo, materiaSeleccionada]);

    // Carga desde la BD los juegos publicados y el material de estudio de la
    // materia abierta. Si la red falla, los servicios devuelven [] y las
    // pestañas muestran su estado vacío. El servidor ya filtra el material
    // privado del docente para el rol estudiante.
    useEffect(() => {
        if (!materiaSeleccionada) return;
        const materia = MATERIAS.find((m) => m.nombre === materiaSeleccionada);
        if (!materia) return;
        let vigente = true;
        obtenerRetosPublicados({ materiaId: materia.id, tipo: 'clasificador' })
            .then((retos) => { if (vigente) setJuegos(retos); });
        obtenerMaterial(materia.id)
            .then((lista) => { if (vigente) setArchivos(lista); });
        return () => { vigente = false; };
    }, [materiaSeleccionada]);

    // El estudiante entra al ranking con su XP real y se reordena por puntos.
    const rankingDinamico = useMemo(() => (
        [...ranking, { nombre: "Tú", puntos: gami.xp }]
            .sort((a, b) => b.puntos - a.puntos)
            .slice(0, 3)
    ), [gami.xp]);

    const abrirMateria = (mat) => {
        setMateriaSeleccionada(mat);
        setSubVista('material');
        setQuizActivo(null);
        setJuegoActivo(null);
        setJuegos([]);
        setArchivos([]);
    };

    const volver = () => {
        setMateriaSeleccionada(null);
        setArchivoPreview(null);
        setQuizActivo(null);
        setJuegoActivo(null);
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
        const pinActual = window.prompt('Escribe tu PIN actual (6 números):');
        if (!pinActual) return;
        const pinNuevo = window.prompt('Escribe tu PIN nuevo (6 números):');
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

                    {/* INICIO */}
                    {pagina === "" && (
                        <>
                            <h1 style={{ pointerEvents: "none" }}>¡Hola, {nombreEstudiante.split(' ')[0]}! 👋</h1>
                            <p className="contenido-sub" style={{ pointerEvents: "none" }}>Sigue aprendiendo y suma puntos para subir en el ranking.</p>

                            <div className="stats-row">
                                <div className="stat-card">
                                    <div className="stat-icon stat-icon-primary"><StarRoundedIcon /></div>
                                    <div>
                                        <span className="stat-value">{gami.xp}</span>
                                        <span className="stat-label">XP acumulado</span>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon stat-icon-fire"><LocalFireDepartmentRoundedIcon /></div>
                                    <div>
                                        <span className="stat-value">{gami.nivel}</span>
                                        <span className="stat-label">Nivel actual</span>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon stat-icon-accent"><EmojiEventsRoundedIcon /></div>
                                    <div>
                                        <span className="stat-value">{gami.totalLogros}</span>
                                        <span className="stat-label">Logros obtenidos</span>
                                    </div>
                                </div>
                            </div>

                            <div className="home-grid">
                                <section className="card">
                                    <div className="card-head">
                                        <h3>Misiones de hoy</h3>
                                        <span className="card-tag">{misiones.length} pendientes</span>
                                    </div>
                                    <ul className="mission-list">
                                        {misiones.map((m, i) => (
                                            <li key={i} className="mission-item">
                                                <div className="mission-top">
                                                    <span>{m.titulo}</span>
                                                    <span className="mission-pct">{m.progreso}%</span>
                                                </div>
                                                <div className="progress-track">
                                                    <div className="progress-fill" style={{ width: `${m.progreso}%` }} />
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </section>

                                <aside className="card-stack">
                                    <section className="card profile-card">
                                        <div className="profile-avatar">{nombreEstudiante.charAt(0).toUpperCase()}</div>
                                        <h3>{nombreEstudiante}</h3>
                                        <p className="profile-role">Aprendiz nivel {gami.nivel}</p>
                                        <div className="profile-level">
                                            <span>Nivel {gami.nivel}</span>
                                            <div className="progress-track">
                                                <div className="progress-fill progress-fill-accent" style={{ width: `${gami.porcentaje}%` }} />
                                            </div>
                                            <span className="profile-xp">{gami.xpActual} / {gami.xpNecesario} XP</span>
                                        </div>
                                    </section>

                                    <section className="card">
                                        <div className="card-head">
                                            <h3>Ranking</h3>
                                            <MilitaryTechRoundedIcon className="rank-head-icon" />
                                        </div>
                                        <ol className="rank-list">
                                            {rankingDinamico.map((r, i) => (
                                                <li key={i} className={`rank-item ${r.nombre === "Tú" ? "rank-item-yo" : ""}`}>
                                                    <span className={`rank-pos rank-pos-${i + 1}`}>{i + 1}</span>
                                                    <span className="rank-name">{r.nombre}</span>
                                                    <span className="rank-points">{r.puntos} pts</span>
                                                </li>
                                            ))}
                                        </ol>
                                    </section>
                                </aside>
                            </div>
                        </>
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
                                    onClick={() => { setSubVista('juegos'); setQuizActivo(null); }}
                                >
                                    Juegos
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
                                                            <span className="quiz-disponible-tema">{q.tema}</span>
                                                            <span className="quiz-disponible-sub">{q.cantidad} preguntas · {q.fecha}</span>
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
                                        <h3>{quizActivo.tema}</h3>
                                        <button className="back-btn back-btn-inline" onClick={() => setQuizActivo(null)}>← Otros quizzes</button>
                                    </div>
                                    <QuizInteractivo
                                        preguntas={quizActivo.preguntas}
                                        mostrarPuntaje
                                        estudianteId={estudianteId}
                                        reto={retoActivo}
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
