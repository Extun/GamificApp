import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import CloudOffRoundedIcon from '@mui/icons-material/CloudOffRounded';
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
import { ModalCambiarPin } from './ModalCambiarPin';
import { useGuardiaActividad } from '../../hooks/useGuardiaActividad';
import { useCapasAtras } from '../../hooks/useCapasAtras';

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

    // Estado de las cargas del panel: 'cargando' | 'listo' | 'error'.
    // Antes no existía, así que una lista vacía significaba dos cosas
    // distintas —"todavía no sé" y "no hay nada"— y el panel siempre elegía
    // la segunda: afirmaba "Todavía no hay juegos" mientras la petición
    // viajaba, y para SIEMPRE si fallaba la red, porque el .catch() se la
    // tragaba en silencio. Ahora cada estado se dice tal cual es.
    const [estadoCatalogo, setEstadoCatalogo] = useState('cargando');
    const [estadoRetos, setEstadoRetos] = useState('cargando');
    // Dentro de una materia hay DOS cargas independientes: los retos (que
    // alimentan Quizzes, Juegos y Misiones) y el material de estudio. Antes
    // compartían un solo estado, así que si fallaba una —lo más probable, el
    // material, que son archivos pesados en base64— las cuatro pestañas
    // decían "No pudimos cargar esto" aunque tres de ellas tuvieran sus datos
    // ya en memoria (SPEC-021 P1-7). Un fallo parcial dejaba inaccesible un
    // mundo entero.
    const [estadoRetosMateria, setEstadoRetosMateria] = useState('cargando');
    const [estadoMaterial, setEstadoMaterial] = useState('cargando');

    // Reintento sin recargar la página: vuelve a disparar los efectos de carga.
    // El paso a 'cargando' va aquí (en el manejador) y no dentro del efecto,
    // para no introducir un set-state en el cuerpo de un useEffect.
    const [intento, setIntento] = useState(0);
    const reintentar = () => {
        setEstadoCatalogo('cargando');
        setEstadoRetos('cargando');
        setEstadoRetosMateria('cargando');
        setEstadoMaterial('cargando');
        setIntento((n) => n + 1);
    };

    // Catálogo dinámico de materias (SPEC-002): los "mundos" del estudiante
    // vienen de la BD (solo las activas), con su color e icono oficiales.
    const [catalogoMaterias, setCatalogoMaterias] = useState([]);
    useEffect(() => {
        let vigente = true;
        listarMaterias()
            .then((lista) => {
                if (!vigente) return;
                setCatalogoMaterias(lista);
                setEstadoCatalogo('listo');
            })
            .catch(() => { if (vigente) setEstadoCatalogo('error'); });
        return () => { vigente = false; };
    }, [intento]);
    const materias = catalogoMaterias.map((m) => m.nombre);

    // Identidad del estudiante en sesión: habilita la persistencia en MySQL.
    const estudianteId = gamificationService.getEstudianteId();

    // Guardia contra abandonar una actividad con progreso sin terminar: los
    // reproductores marcan su estado (onEstadoIntento) y toda navegación que
    // los desmonta pasa por `proteger` (confirmación amigable si hace falta).
    const { marcar: marcarIntento, proteger, dialogo: dialogoSalida } = useGuardiaActividad();

    const hayActividadAbierta = Boolean(quizActivo || juegoActivo || misionActiva);

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
        obtenerRetosPublicados({ propagarError: true })
            .then((retos) => {
                if (!vigente) return;
                setRetosDisponibles(retos);
                setEstadoRetos('listo');
            })
            .catch(() => { if (vigente) setEstadoRetos('error'); });
        return () => { vigente = false; };
    }, [intento]);

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
    // Conteo de premios consistente con la página de Premios (SPEC-011: el
    // conteo viejo de localStorage se retiró; sin servidor se muestra 0 hasta
    // que responda, igual que el resto de datos de misiones).
    const premiosGanados = misionesResumen ? misionesResumen.completadas : 0;

    // Carga desde la BD los quizzes y juegos publicados y el material de la
    // materia abierta. Si la red falla, los servicios devuelven [] y las
    // pestañas muestran su estado vacío. El servidor ya filtra el material
    // privado del docente para el rol estudiante.
    useEffect(() => {
        if (!materiaSeleccionada) return;
        const materia = catalogoMaterias.find((m) => m.nombre === materiaSeleccionada);
        if (!materia) return;
        let vigente = true;
        // UNA sola petición para las tres pestañas: GET /api/retos?materia_id=N
        // ya devuelve todos los tipos publicados de la materia, así que pedir
        // además ?tipo=quiz y ?tipo=mision era pedir dos subconjuntos de lo
        // mismo (y pagar sus preflight). Los filtros de abajo son idénticos a
        // los de antes, con el `tipo` que antes ponía la query.
        // Juegos = todo reto cuyo tipo esté en el registro JUEGOS_UI
        // (clasificador, memorama, línea del tiempo, completar…): un solo
        // despacho por tipo, sin pedir tipo por tipo.
        // Cada carga resuelve SU propio estado (P1-7): el material y los retos
        // fallan por separado, así que se informan por separado.
        // propagarError: los servicios devuelven [] ante un fallo por
        // defecto, así que sin esto un error de red llegaba aquí disfrazado
        // de "no hay contenido" y el estado 'error' era inalcanzable.
        obtenerRetosPublicados({ materiaId: materia.id, propagarError: true })
            .then((retos) => {
                if (!vigente) return;
                setQuizzes(retos.filter((r) => r.tipo === 'quiz' && r.configuracion?.preguntas?.length));
                setJuegos(retos.filter((r) => JUEGOS_UI[r.tipo] && juegoJugable(r)));
                setMisionesRetos(retos.filter((r) => r.tipo === 'mision' && r.configuracion?.desafios?.length));
                setEstadoRetosMateria('listo');
                // Salto directo a una actividad nombrada en el Home (P1-3).
                // Se resuelve aquí porque hasta ahora no existía el reto: solo
                // se conocía su id. Si ya no está publicado, no se abre nada y
                // el niño se queda en la materia, que es el destino honesto.
                const pendiente = retoPendienteRef.current;
                retoPendienteRef.current = null;
                const objetivo = pendiente ? retos.find((r) => r.id === pendiente) : null;
                if (!objetivo) return;
                if (objetivo.tipo === 'quiz') {
                    setSubVista('quizzes');
                    setQuizActivo(objetivo);
                } else if (objetivo.tipo === 'mision') {
                    setSubVista('misiones');
                    setMisionActiva(objetivo);
                } else if (JUEGOS_UI[objetivo.tipo]) {
                    setSubVista('juegos');
                    setJuegoActivo(objetivo);
                }
            })
            .catch(() => { if (vigente) setEstadoRetosMateria('error'); });
        obtenerMaterial(materia.id, { propagarError: true })
            .then((lista) => {
                if (!vigente) return;
                setArchivos(lista);
                setEstadoMaterial('listo');
            })
            .catch(() => { if (vigente) setEstadoMaterial('error'); });
        return () => { vigente = false; };
        // catalogoMaterias entra en las dependencias: al llegar el catálogo
        // de la API se resuelve el id y recién ahí se cargan los retos.
        // `intento` permite que "Intentar de nuevo" repita también esta carga.
    }, [materiaSeleccionada, catalogoMaterias, intento]);

    // Avance por reto ordenado del más reciente al más antiguo.
    const actividadReciente = useMemo(
        () => [...progresoDetalle].sort(
            (a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en)
        ),
        [progresoDetalle]
    );
    // "¡Seguir jugando!" solo puede ofrecer algo que de verdad se pueda
    // seguir: antes era el progreso MÁS RECIENTE sin mirar si estaba
    // terminado, así que invitaba a continuar una actividad completada al
    // 100 % (SPEC-021 P1-3). Si todo está terminado, no hay nada que seguir y
    // el Home cae al camino de "tu primera aventura" / estado vacío.
    const ultimaActividad = actividadReciente.find((p) => !p.completado) || null;

    // Fallback sin progreso: la actividad publicada más antigua es la
    // "primera" disponible (la API las devuelve de más nueva a más vieja).
    const primerRetoDisponible = retosDisponibles.length
        ? retosDisponibles[retosDisponibles.length - 1]
        : null;
    const materiaPrimerReto = primerRetoDisponible
        ? catalogoMaterias.find((m) => m.id === primerRetoDisponible.materia_id)?.nombre
        : null;

    // Actividad que el Home pidió abrir en cuanto lleguen los retos (P1-3).
    const retoPendienteRef = useRef(null);

    const abrirMateria = (mat) => {
        retoPendienteRef.current = null;
        setMateriaSeleccionada(mat);
        setEstadoRetosMateria('cargando');
        setEstadoMaterial('cargando');
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
    // `retoId` opcional: cuando el Home nombra UNA actividad concreta
    // ("Te espera «Los animales»"), abrirla es lo que promete el botón. Antes
    // aterrizaba en la pestaña "Material de estudio" y el niño tenía que
    // buscarla solo, con lo que la tarjeta principal del Home rompía su
    // promesa dos veces (SPEC-021 P1-3).
    // El reto no está cargado todavía —depende de la petición que dispara
    // `abrirMateria`—, así que se anota como pendiente y lo abre el efecto de
    // carga en cuanto llega. En una ref, no en estado: no debe provocar
    // render ni re-disparar el efecto.
    const irAMateria = (nombre, retoId = null) => {
        if (!nombre) return;
        setPagina('materias');
        abrirMateria(nombre);
        retoPendienteRef.current = retoId;
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

    // Las 4 pestañas de materia comparten el mismo patrón de tres estados.
    // Antes todas usaban `<p class="vacio-msg">` —texto gris plano— mientras
    // el resto del producto usa `EmptyState` con icono y mensaje; ahora
    // comparten componente y, sobre todo, distinguen "todavía no sé" de "no
    // hay nada".
    // `estado` llega por parámetro (P1-7): la pestaña de material mira el
    // estado del material y las tres de actividades el de los retos, así que
    // un fallo en una no contagia a las otras.
    // Es una función que devuelve JSX, no un componente anidado: así las
    // pestañas no se remontan en cada render.
    const contenidoMateria = ({ estado, hayDatos, Icon, titulo, mensaje, contenido }) => {
        if (estado === 'cargando') {
            return <p className="materia-estado" role="status">Buscando…</p>;
        }
        if (estado === 'error') {
            return (
                <EmptyState
                    Icon={CloudOffRoundedIcon}
                    titulo="No pudimos cargar esto"
                    mensaje="Revisa tu conexión a internet y vuelve a intentarlo."
                    accion={{ label: 'Intentar de nuevo', onClick: reintentar }}
                />
            );
        }
        return hayDatos ? contenido : <EmptyState Icon={Icon} titulo={titulo} mensaje={mensaje} />;
    };

    // Rejilla de mundos con sus tres estados (la usan el Home y "Mis mundos").
    const rejillaMundos = (alElegir) => {
        if (estadoCatalogo === 'cargando') {
            return (
                <div className="home-mundos-grid" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => <span key={i} className="home-mundo-esqueleto" />)}
                </div>
            );
        }
        if (estadoCatalogo === 'error') {
            return (
                <EmptyState
                    Icon={CloudOffRoundedIcon}
                    titulo="No pudimos cargar tus mundos"
                    mensaje="Revisa tu conexión a internet y vuelve a intentarlo."
                    accion={{ label: 'Intentar de nuevo', onClick: reintentar }}
                />
            );
        }
        if (materias.length === 0) {
            return (
                <EmptyState
                    Icon={MenuBookIcon}
                    titulo="Todavía no hay mundos"
                    mensaje="Tu docente está preparando tus materias. ¡Vuelve pronto!"
                />
            );
        }
        return (
            <div className="home-mundos-grid">
                {materias.map((mat) => {
                    const ui = uiMateria(mat);
                    return (
                        <button key={mat} className="home-mundo" style={ui.estilo} onClick={() => alElegir(mat)}>
                            <span className="home-mundo-emoji" aria-hidden="true">{ui.icono}</span>
                            <span>{mat}</span>
                        </button>
                    );
                })}
            </div>
        );
    };

    // Nombre real del estudiante (viene del registro con invitación); las
    // cuentas antiguas sin nombre completo muestran el genérico.
    const nombreEstudiante = authService.getUsuario()?.nombre_completo || 'Estudiante';

    // El cambio de PIN vive en un modal accesible (ModalCambiarPin) en lugar de
    // los dos window.prompt encadenados que había antes. Mismo servicio, mismo
    // endpoint: solo cambia la interfaz.
    const [modalPin, setModalPin] = useState(false);

    // Botón Atrás del navegador (SPEC-021 P0-2, generalizado). Cada capa
    // abierta pone un centinela en el historial, así que Atrás SUBE UN NIVEL
    // dentro del panel en vez de salir de /dashboard: cierra el modal, luego
    // la actividad, luego la materia y por último vuelve al Inicio. La salida
    // de una actividad pasa por la misma guardia que los botones internos
    // (`proteger`), así que si el intento tiene progreso real se pregunta
    // igual que siempre; si no, cierra directo. Antes, un solo Atrás
    // desmontaba el panel entero y devolvía al formulario de login con el
    // intento perdido.
    useCapasAtras([
        { activo: pagina !== '', cerrar: () => { setPagina(''); setMateriaSeleccionada(null); } },
        { activo: Boolean(materiaSeleccionada), cerrar: () => volver() },
        { activo: hayActividadAbierta, cerrar: proteger(() => {
            setQuizActivo(null);
            setJuegoActivo(null);
            setMisionActiva(null);
        }) },
        { activo: Boolean(archivoPreview), cerrar: () => setArchivoPreview(null) },
        { activo: modalPin, cerrar: () => setModalPin(false) },
    ]);

    return (
        <SidebarLayout
            titulo={nombreInstitucion()}
            items={[
                { id: '', label: 'Inicio', Icon: HomeFilledIcon },
                // Sentence case, igual que los encabezados de las propias
                // pantallas ("Mis mundos" / "Mis premios"): antes el sidebar y
                // el h1 escribían la misma etiqueta de dos formas distintas.
                { id: 'materias', label: 'Mis mundos', Icon: MenuBookIcon },
                { id: 'logros', label: 'Mis premios', Icon: EmojiEventsRoundedIcon }
            ].map((item) => ({
                ...item,
                activo: pagina === item.id,
                onClick: proteger(() => { setPagina(item.id); setMateriaSeleccionada(null); })
            }))}
            usuario={{
                inicial: nombreEstudiante.charAt(0).toUpperCase(),
                nombre: nombreEstudiante,
                detalle: 'Estudiante'
            }}
            accionesFooter={[
                { label: 'Cambiar mi PIN', Icon: LockRoundedIcon, onClick: () => setModalPin(true) },
                { label: 'Cerrar sesión', Icon: LogoutRoundedIcon, onClick: proteger(cerrarSesion), tono: 'peligro' }
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
                                        {/* Racha (RC 1.0 · P2-5, variante segura): el significado del
                                            🔥 vivía SOLO en el `title`, que no existe con teclado ni
                                            en táctil —y el niño no hace hover—, y para un lector de
                                            pantalla el chip sonaba "fuego 3". `role="img"` +
                                            `aria-label` le dan un nombre completo, el mismo patrón
                                            que ya usa el ✓ de misión (SPEC-018 F6.3).
                                            NO se añade texto visible a propósito: este chip es el que
                                            se salía del contenedor a 320px y su ancho queda intacto. */}
                                        {rachaActual > 0 && (
                                            <span
                                                className="home-nivel-racha"
                                                role="img"
                                                aria-label={`Racha: ${rachaActual} ${rachaActual === 1 ? 'día seguido' : 'días seguidos'} jugando`}
                                                title="Días seguidos jugando"
                                            >
                                                🔥 {rachaActual}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </header>

                            {estadoRetos === 'cargando' || estadoCatalogo === 'cargando' ? (
                                /* Mientras no se sabe, se muestra la FORMA de la
                                   tarjeta, no una afirmación falsa. */
                                <div className="home-hero-esqueleto" role="status" aria-label="Buscando tus juegos" />
                            ) : estadoRetos === 'error' || estadoCatalogo === 'error' ? (
                                <EmptyState
                                    Icon={CloudOffRoundedIcon}
                                    titulo="No pudimos cargar tus juegos"
                                    mensaje="Revisa tu conexión a internet y vuelve a intentarlo."
                                    accion={{ label: 'Intentar de nuevo', onClick: reintentar }}
                                />
                            ) : ultimaActividad ? (
                                <button className="home-hero" onClick={() => irAMateria(ultimaActividad.materia, ultimaActividad.reto_id)}>
                                    <span className="home-hero-emoji" aria-hidden="true">🚀</span>
                                    <span className="home-hero-texto">
                                        <strong>¡Seguir jugando!</strong>
                                        <span>Te espera "{ultimaActividad.reto}" en {ultimaActividad.materia}</span>
                                    </span>
                                    <ArrowForwardRoundedIcon className="home-hero-flecha" />
                                </button>
                            ) : materiaPrimerReto ? (
                                <button className="home-hero" onClick={() => irAMateria(materiaPrimerReto, primerRetoDisponible.id)}>
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
                                {rejillaMundos(irAMateria)}
                            </section>

                            <button className="home-logros" onClick={() => setPagina('logros')}>
                                <span className="home-logros-emoji" aria-hidden="true">🏆</span>
                                <span className="home-logros-texto">
                                    <strong>Mis premios</strong>
                                    <span>
                                        {/* Mientras el resumen del servidor no llega, `premiosGanados`
                                            es 0 y la tarjeta decía "juega para ganar tu primera
                                            insignia" a un niño que ya tiene diez. Sin el dato no se
                                            afirma nada: solo se invita a entrar. */}
                                        {misionesResumen === null
                                            ? 'Mira todo lo que has ganado'
                                            : premiosGanados > 0
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
                            {rejillaMundos(abrirMateria)}
                        </div>
                    )}

                    {/* MATERIA DETALLE */}
                    {pagina === "materias" && materiaSeleccionada && (
                        <>
                            <button className="back-btn" onClick={proteger(volver)}>← Volver a mis mundos</button>

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
                                {/* aria-pressed: la pestaña activa se distinguía SOLO por color
                                    (.opcion-activa), invisible para lectores de pantalla. */}
                                <button
                                    className={`opcion ${subVista === 'material' ? 'opcion-activa' : ''}`}
                                    aria-pressed={subVista === 'material'}
                                    onClick={proteger(() => { setSubVista('material'); setQuizActivo(null); })}
                                >
                                    📚 Material de estudio
                                </button>
                                <button
                                    className={`opcion ${subVista === 'quizzes' ? 'opcion-activa' : ''}`}
                                    aria-pressed={subVista === 'quizzes'}
                                    onClick={proteger(() => { setSubVista('quizzes'); setJuegoActivo(null); })}
                                >
                                    ✨ Quizzes
                                </button>
                                <button
                                    className={`opcion ${subVista === 'juegos' ? 'opcion-activa' : ''}`}
                                    aria-pressed={subVista === 'juegos'}
                                    onClick={proteger(() => { setSubVista('juegos'); setQuizActivo(null); setMisionActiva(null); })}
                                >
                                    🧩 Juegos
                                </button>
                                <button
                                    className={`opcion ${subVista === 'misiones' ? 'opcion-activa' : ''}`}
                                    aria-pressed={subVista === 'misiones'}
                                    onClick={proteger(() => { setSubVista('misiones'); setQuizActivo(null); setJuegoActivo(null); })}
                                >
                                    🗺️ Misiones
                                </button>
                            </div>

                            {subVista === 'material' && (
                                <section className="card materia-cards">
                                    <div className="card-head">
                                        <h3>Material de estudio</h3>
                                        {/* El contador solo se muestra cuando es un dato y no
                                            un "0" provisional mientras carga. */}
                                        {estadoMaterial === 'listo' && (
                                            <span className="card-tag">{archivos.length} recursos</span>
                                        )}
                                    </div>
                                    {contenidoMateria({
                                        estado: estadoMaterial,
                                        hayDatos: archivos.length > 0,
                                        Icon: MenuBookIcon,
                                        titulo: 'Todavía no hay material',
                                        mensaje: 'Tu docente aún no ha publicado material en este mundo.',
                                        contenido: (
                                            <div className="file-chip-grid">
                                                {archivos.map((archivo) => (
                                                    <FileChip key={archivo.id} archivo={archivo} onClick={() => setArchivoPreview(archivo)} />
                                                ))}
                                            </div>
                                        )
                                    })}
                                </section>
                            )}

                            {subVista === 'quizzes' && !quizActivo && (
                                <section className="card materia-cards">
                                    <div className="card-head">
                                        <h3>Quizzes disponibles</h3>
                                        {estadoRetosMateria === 'listo' && (
                                            <span className="card-tag">{quizzes.length} quizzes</span>
                                        )}
                                    </div>
                                    {contenidoMateria({
                                        estado: estadoRetosMateria,
                                        hayDatos: quizzes.length > 0,
                                        Icon: QuizRoundedIcon,
                                        titulo: 'Todavía no hay quizzes',
                                        mensaje: 'Tu docente está preparando preguntas para este mundo. ¡Vuelve pronto!',
                                        contenido: (
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
                                        )
                                    })}
                                </section>
                            )}

                            {subVista === 'quizzes' && quizActivo && (
                                <section className="card materia-subvista">
                                    <div className="card-head">
                                        <h3>{quizActivo.titulo}</h3>
                                        <button className="back-btn back-btn-inline" onClick={proteger(() => setQuizActivo(null))}>← Otros quizzes</button>
                                    </div>
                                    <QuizInteractivo
                                        preguntas={quizActivo.configuracion.preguntas}
                                        mostrarPuntaje
                                        estudianteId={estudianteId}
                                        reto={quizActivo}
                                        onCompletado={refrescarProgreso}
                                        onSalir={() => setQuizActivo(null)}
                                        onEstadoIntento={marcarIntento}
                                    />
                                </section>
                            )}
                            {subVista === 'juegos' && !juegoActivo && (
                                <section className="card materia-cards">
                                    <div className="card-head">
                                        <h3>Juegos disponibles</h3>
                                        {estadoRetosMateria === 'listo' && (
                                            <span className="card-tag">{juegos.length} juegos</span>
                                        )}
                                    </div>
                                    {contenidoMateria({
                                        estado: estadoRetosMateria,
                                        hayDatos: juegos.length > 0,
                                        Icon: ExtensionRoundedIcon,
                                        titulo: 'Todavía no hay juegos',
                                        mensaje: 'Tu docente está preparando aventuras para este mundo. ¡Vuelve pronto!',
                                        contenido: (
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
                                        )
                                    })}
                                </section>
                            )}

                            {subVista === 'misiones' && !misionActiva && (
                                <section className="card materia-cards">
                                    <div className="card-head">
                                        <h3>Misiones narrativas</h3>
                                        {estadoRetosMateria === 'listo' && (
                                            <span className="card-tag">{misionesRetos.length} aventuras</span>
                                        )}
                                    </div>
                                    {contenidoMateria({
                                        estado: estadoRetosMateria,
                                        hayDatos: misionesRetos.length > 0,
                                        Icon: AutoStoriesRoundedIcon,
                                        titulo: 'Todavía no hay misiones',
                                        mensaje: 'Tu docente está escribiendo historias para este mundo. ¡Vuelve pronto!',
                                        contenido: (
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
                                        )
                                    })}
                                </section>
                            )}

                            {subVista === 'misiones' && misionActiva && (
                                <section className="card materia-subvista">
                                    <div className="card-head">
                                        <h3>{misionActiva.titulo}</h3>
                                        <button className="back-btn back-btn-inline" onClick={proteger(() => setMisionActiva(null))}>← Otras misiones</button>
                                    </div>
                                    <MisionNarrativa
                                        reto={misionActiva}
                                        estudianteId={estudianteId}
                                        onSalir={() => setMisionActiva(null)}
                                        onCompletado={refrescarProgreso}
                                        onEstadoIntento={marcarIntento}
                                    />
                                </section>
                            )}

                            {subVista === 'juegos' && juegoActivo && (
                                <section className="card materia-subvista">
                                    <div className="card-head">
                                        <h3>{juegoActivo.titulo}</h3>
                                        <button className="back-btn back-btn-inline" onClick={proteger(() => setJuegoActivo(null))}>← Otros juegos</button>
                                    </div>
                                    {(() => {
                                        const Player = JUEGOS_UI[juegoActivo.tipo]?.Player;
                                        return Player ? (
                                            <Player
                                                reto={juegoActivo}
                                                estudianteId={estudianteId}
                                                onSalir={() => setJuegoActivo(null)}
                                                onCompletado={refrescarProgreso}
                                                onEstadoIntento={marcarIntento}
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

            {dialogoSalida}

            {modalPin && <ModalCambiarPin onCerrar={() => setModalPin(false)} />}

            <FilePreviewModal
                archivo={archivoPreview}
                onClose={() => setArchivoPreview(null)}
                onDownload={descargarArchivo}
            />
        </SidebarLayout>
    );
}
