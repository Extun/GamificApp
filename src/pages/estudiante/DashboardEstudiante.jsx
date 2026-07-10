import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../admin/dashboard.css';
import './dashboardEstudiante.css';
import HomeFilledIcon from '@mui/icons-material/HomeFilled';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import QuizRoundedIcon from '@mui/icons-material/QuizRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import { SidebarLayout } from '../../components/dashboard/SidebarLayout';
import { FileChip, FilePreviewModal, descargarArchivo } from '../../components/archivos/ArchivoChip';
import { QuizInteractivo } from '../../components/quiz/QuizInteractivo';
import { JUEGOS_UI, juegoJugable } from '../../components/juegos/registroJuegos';
import { MisionNarrativa } from '../../components/mision/MisionNarrativa';
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded';
import { obtenerRetosPublicados } from '../../services/retosService';
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded';
import gamificationService, { XP_POR_NIVEL } from '../../services/gamificationService';
import authService from '../../services/authService';
import { obtenerMaterial } from '../../services/materialesService';
import { listarMaterias, uiMateria } from '../../services/materiasService';
import { nombreInstitucion } from '../../services/institucionService';
import { obtenerMisiones } from '../../services/misionesService';
import { EmptyState } from '../../components/dashboard/DashboardWidgets';
import { PanelMisiones } from './PanelMisiones';

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
    // Detalle del avance por reto (GET /api/progreso/:id): alimenta
    // "Continuar aprendiendo" y "Actividad reciente" con datos reales.
    const [progresoDetalle, setProgresoDetalle] = useState([]);
    // Todos los retos publicados: fallback de "Continuar aprendiendo"
    // cuando el estudiante aún no tiene progreso registrado.
    const [retosDisponibles, setRetosDisponibles] = useState([]);

    // Catálogo dinámico de materias (SPEC-002): los "mundos" del estudiante
    // vienen de la BD (solo las activas), con su color e icono oficiales.
    const [catalogoMaterias, setCatalogoMaterias] = useState([]);
    useEffect(() => {
        let vigente = true;
        listarMaterias()
            .then((lista) => { if (vigente) setCatalogoMaterias(lista); })
            .catch(() => { /* sin red: el resto del panel sigue funcionando */ });
        return () => { vigente = false; };
    }, []);
    const materias = catalogoMaterias.map((m) => m.nombre);

    // Identidad del estudiante en sesión: habilita la persistencia en MySQL.
    const estudianteId = gamificationService.getEstudianteId();

    // Contador que fuerza releer el progreso del servidor tras completar una
    // actividad (lo disparan los reproductores mediante onCompletado).
    const [refrescar, setRefrescar] = useState(0);
    const refrescarProgreso = useCallback(() => setRefrescar((n) => n + 1), []);

    // Caché local de gamificación (localStorage): SOLO respaldo mientras el
    // servidor responde. La fuente de verdad es la BD (misionesResumen).
    const gami = gamificationService.getResumen();

    // Resumen del servidor (SPEC-007): XP, nivel, racha y premios REALES,
    // compartido con "Mis Premios". Se refresca al entrar al Home y cada vez que
    // se completa una actividad, para que la barra de XP refleje el cambio.
    const [misionesResumen, setMisionesResumen] = useState(null);

    // Retos publicados: fallback de "Continuar aprendiendo". Basta cargarlos al
    // entrar; no dependen del progreso ni de la página activa.
    useEffect(() => {
        let vigente = true;
        obtenerRetosPublicados()
            .then((retos) => { if (vigente) setRetosDisponibles(retos); })
            .catch(() => { /* sin red: el Home muestra su estado vacío */ });
        return () => { vigente = false; };
    }, []);

    // Progreso oficial (XP por reto) + resumen de misiones desde la BD. Se
    // vuelve a leer al llegar al Home y tras completar una actividad, así el
    // XP/nivel/premios del Home siempre muestran la verdad del servidor.
    useEffect(() => {
        if (!estudianteId || pagina !== '') return;
        let vigente = true;
        gamificationService.obtenerProgreso(estudianteId).then((data) => {
            if (vigente && Array.isArray(data?.progreso)) setProgresoDetalle(data.progreso);
        });
        obtenerMisiones()
            .then((res) => { if (vigente && res?.resumen) setMisionesResumen(res.resumen); })
            .catch(() => { /* sin red: la barra usa el respaldo en caché */ });
        return () => { vigente = false; };
    }, [estudianteId, pagina, refrescar]);

    // Valores de la barra de nivel: se prefiere el servidor; si aún no
    // respondió, se cae al caché local para no mostrar la barra vacía.
    const xpMostrado = misionesResumen ? misionesResumen.xp : gami.xp;
    const nivelMostrado = misionesResumen ? misionesResumen.nivel : gami.nivel;
    const porcentajeNivel = Math.round(((xpMostrado % XP_POR_NIVEL) / XP_POR_NIVEL) * 100);
    const rachaActual = misionesResumen?.racha_actual || 0;
    // Conteo de premios consistente con la página de Premios.
    const premiosGanados = misionesResumen ? misionesResumen.completadas : gami.totalLogros;

    // Carga desde la BD los quizzes y juegos publicados y el material de la
    // materia abierta. Si la red falla, los servicios devuelven [] y las
    // pestañas muestran su estado vacío. El servidor ya filtra el material
    // privado del docente para el rol estudiante.
    useEffect(() => {
        if (!materiaSeleccionada) return;
        const materia = catalogoMaterias.find((m) => m.nombre === materiaSeleccionada);
        if (!materia) return;
        let vigente = true;
        obtenerRetosPublicados({ materiaId: materia.id, tipo: 'quiz' })
            .then((retos) => { if (vigente) setQuizzes(retos.filter((r) => r.configuracion?.preguntas?.length)); });
        // Juegos = todo reto publicado cuyo tipo esté en el registro JUEGOS_UI
        // (clasificador, memorama, línea del tiempo, completar…): un solo
        // listado y un solo despacho por tipo, sin pedir tipo por tipo.
        obtenerRetosPublicados({ materiaId: materia.id })
            .then((retos) => { if (vigente) setJuegos(retos.filter((r) => JUEGOS_UI[r.tipo] && juegoJugable(r))); });
        obtenerRetosPublicados({ materiaId: materia.id, tipo: 'mision' })
            .then((retos) => { if (vigente) setMisionesRetos(retos.filter((r) => r.configuracion?.desafios?.length)); });
        obtenerMaterial(materia.id)
            .then((lista) => { if (vigente) setArchivos(lista); });
        return () => { vigente = false; };
        // catalogoMaterias entra en las dependencias: al llegar el catálogo
        // de la API se resuelve el id y recién ahí se cargan los retos.
    }, [materiaSeleccionada, catalogoMaterias]);

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
        ? catalogoMaterias.find((m) => m.id === primerRetoDisponible.materia_id)?.nombre
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
        <SidebarLayout
            titulo={nombreInstitucion()}
            items={[
                { id: '', label: 'Inicio', Icon: HomeFilledIcon },
                { id: 'materias', label: 'Mis Mundos', Icon: MenuBookIcon },
                { id: 'logros', label: 'Mis Premios', Icon: EmojiEventsRoundedIcon }
            ].map((item) => ({
                ...item,
                activo: pagina === item.id,
                onClick: () => { setPagina(item.id); setMateriaSeleccionada(null); }
            }))}
            usuario={{
                inicial: nombreEstudiante.charAt(0).toUpperCase(),
                nombre: nombreEstudiante,
                detalle: 'Estudiante'
            }}
            accionesFooter={[
                { label: 'Cambiar mi PIN', Icon: LockRoundedIcon, onClick: handleCambiarPin },
                { label: 'Cerrar sesión', Icon: LogoutRoundedIcon, onClick: cerrarSesion }
            ]}
        >

                    {/* INICIO — responde una sola pregunta: "¿qué hago ahora?".
                        Saludo + nivel visual → acción principal → mundos → logros. */}
                    {pagina === "" && (
                        <div className="home-nino">
                            <header className="home-saludo">
                                <span className="home-avatar" aria-hidden="true">
                                    {nombreEstudiante.charAt(0).toUpperCase()}
                                </span>
                                <div className="home-saludo-meta">
                                    <h1>¡Hola, {nombreEstudiante.split(' ')[0]}! 👋</h1>
                                    <div className="home-nivel">
                                        <span className="home-nivel-badge">Nivel {nivelMostrado}</span>
                                        <div className="progress-track home-nivel-track">
                                            <div className="progress-fill" style={{ width: `${porcentajeNivel}%` }} />
                                        </div>
                                        <span className="home-nivel-xp">⭐ {xpMostrado} XP</span>
                                        {rachaActual > 0 && (
                                            <span className="home-nivel-racha" title="Días seguidos jugando">
                                                🔥 {rachaActual}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </header>

                            {ultimaActividad ? (
                                <button className="home-hero" onClick={() => irAMateria(ultimaActividad.materia)}>
                                    <span className="home-hero-emoji" aria-hidden="true">🚀</span>
                                    <span className="home-hero-texto">
                                        <strong>¡Seguir jugando!</strong>
                                        <span>Te espera "{ultimaActividad.reto}" en {ultimaActividad.materia}</span>
                                    </span>
                                    <ArrowForwardRoundedIcon className="home-hero-flecha" />
                                </button>
                            ) : materiaPrimerReto ? (
                                <button className="home-hero" onClick={() => irAMateria(materiaPrimerReto)}>
                                    <span className="home-hero-emoji" aria-hidden="true">🎁</span>
                                    <span className="home-hero-texto">
                                        <strong>¡Tu primera aventura!</strong>
                                        <span>"{primerRetoDisponible.titulo}" te espera en {materiaPrimerReto}</span>
                                    </span>
                                    <ArrowForwardRoundedIcon className="home-hero-flecha" />
                                </button>
                            ) : (
                                <EmptyState
                                    Icon={RocketLaunchRoundedIcon}
                                    titulo="Todavía no hay juegos"
                                    mensaje="Tu docente está preparando aventuras. ¡Vuelve pronto!"
                                />
                            )}

                            <section className="home-mundos">
                                <h2>Mis mundos</h2>
                                <div className="home-mundos-grid">
                                    {materias.map((mat) => {
                                        const ui = uiMateria(mat);
                                        return (
                                            <button
                                                key={mat}
                                                className="home-mundo"
                                                style={ui.estilo}
                                                onClick={() => irAMateria(mat)}
                                            >
                                                <span className="home-mundo-emoji" aria-hidden="true">{ui.icono}</span>
                                                <span>{mat}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            <button className="home-logros" onClick={() => setPagina('logros')}>
                                <span className="home-logros-emoji" aria-hidden="true">🏆</span>
                                <span className="home-logros-texto">
                                    <strong>Mis premios</strong>
                                    <span>
                                        {premiosGanados > 0
                                            ? `¡Ya ganaste ${premiosGanados} ${premiosGanados === 1 ? 'insignia' : 'insignias'}!`
                                            : 'Juega para ganar tu primera insignia'}
                                    </span>
                                </span>
                                <ArrowForwardRoundedIcon className="home-logros-flecha" />
                            </button>
                        </div>
                    )}

                    {/* MATERIAS GRID */}
                    {pagina === "materias" && !materiaSeleccionada && (
                        <div className="home-nino">
                            <div>
                                <h1 style={{ pointerEvents: "none" }}>Mis mundos</h1>
                                <p className="contenido-sub" style={{ pointerEvents: "none" }}>Elige un mundo para repasar y jugar lo que preparó tu docente.</p>
                            </div>
                            <div className="home-mundos-grid">
                                {materias.map((mat) => {
                                    const ui = uiMateria(mat);
                                    return (
                                        <button
                                            key={mat}
                                            className="home-mundo"
                                            style={ui.estilo}
                                            onClick={() => abrirMateria(mat)}
                                        >
                                            <span className="home-mundo-emoji" aria-hidden="true">{ui.icono}</span>
                                            <span>{mat}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* MATERIA DETALLE */}
                    {pagina === "materias" && materiaSeleccionada && (
                        <>
                            <button className="back-btn" onClick={volver}>← Volver a mis mundos</button>

                            {(() => {
                                const ui = uiMateria(materiaSeleccionada);
                                return (
                                    <header className="materia-hero" style={ui.estilo}>
                                        <span className="materia-hero-emoji" aria-hidden="true">{ui.icono}</span>
                                        <div className="materia-hero-meta">
                                            <h1>{materiaSeleccionada}</h1>
                                            <p>¿Qué quieres hacer hoy en este mundo?</p>
                                        </div>
                                    </header>
                                );
                            })()}

                            <div className="materia-panel materia-panel-est">
                                <button
                                    className={`opcion ${subVista === 'material' ? 'opcion-activa' : ''}`}
                                    onClick={() => { setSubVista('material'); setQuizActivo(null); }}
                                >
                                    📚 Material de estudio
                                </button>
                                <button
                                    className={`opcion ${subVista === 'quizzes' ? 'opcion-activa' : ''}`}
                                    onClick={() => { setSubVista('quizzes'); setJuegoActivo(null); }}
                                >
                                    ✨ Quizzes
                                </button>
                                <button
                                    className={`opcion ${subVista === 'juegos' ? 'opcion-activa' : ''}`}
                                    onClick={() => { setSubVista('juegos'); setQuizActivo(null); setMisionActiva(null); }}
                                >
                                    🧩 Juegos
                                </button>
                                <button
                                    className={`opcion ${subVista === 'misiones' ? 'opcion-activa' : ''}`}
                                    onClick={() => { setSubVista('misiones'); setQuizActivo(null); setJuegoActivo(null); }}
                                >
                                    🗺️ Misiones
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
                                        onCompletado={refrescarProgreso}
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
                                            {juegos.map((j) => {
                                                const ui = JUEGOS_UI[j.tipo];
                                                return (
                                                    <li key={j.id}>
                                                        <button className="quiz-disponible-item" onClick={() => setJuegoActivo(j)}>
                                                            <span className="quiz-disponible-icon" aria-hidden="true">
                                                                {ui?.emoji || <ExtensionRoundedIcon />}
                                                            </span>
                                                            <span className="quiz-disponible-meta">
                                                                <span className="quiz-disponible-tema">{j.titulo}</span>
                                                                <span className="quiz-disponible-sub">
                                                                    {ui?.etiqueta || j.tipo} · {ui?.resumen(j.configuracion)} · {j.xp_recompensa} XP
                                                                </span>
                                                            </span>
                                                            <span className="quiz-disponible-cta">
                                                                Jugar <ArrowForwardRoundedIcon sx={{ fontSize: "1rem" }} />
                                                            </span>
                                                        </button>
                                                    </li>
                                                );
                                            })}
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
                                        onCompletado={refrescarProgreso}
                                    />
                                </section>
                            )}

                            {subVista === 'juegos' && juegoActivo && (
                                <section className="card materia-subvista">
                                    <div className="card-head">
                                        <h3>{juegoActivo.titulo}</h3>
                                        <button className="back-btn back-btn-inline" onClick={() => setJuegoActivo(null)}>← Otros juegos</button>
                                    </div>
                                    {(() => {
                                        const Player = JUEGOS_UI[juegoActivo.tipo]?.Player;
                                        return Player ? (
                                            <Player
                                                reto={juegoActivo}
                                                estudianteId={estudianteId}
                                                onSalir={() => setJuegoActivo(null)}
                                                onCompletado={refrescarProgreso}
                                            />
                                        ) : (
                                            <p className="vacio-msg">Este juego no está disponible en tu versión de la app.</p>
                                        );
                                    })()}
                                </section>
                            )}
                        </>
                    )}

                    {/* LOGROS */}
                    {pagina === "logros" && <PanelMisiones />}

            <FilePreviewModal
                archivo={archivoPreview}
                onClose={() => setArchivoPreview(null)}
                onDownload={descargarArchivo}
            />
        </SidebarLayout>
    );
}
