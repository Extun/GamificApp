import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './dashboard.css';
import './adminDashboard.css';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import VpnKeyRoundedIcon from '@mui/icons-material/VpnKeyRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import HomeFilledIcon from '@mui/icons-material/HomeFilled';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import Diversity3RoundedIcon from '@mui/icons-material/Diversity3Rounded';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import HistoryEduRoundedIcon from '@mui/icons-material/HistoryEduRounded';
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import authService from '../../services/authService';
import adminService from '../../services/adminService';
import { listarMaterias, estiloMateria } from '../../services/materiasService';
import { getInstitucionCache } from '../../services/institucionService';
import { SidebarLayout } from '../../components/dashboard/SidebarLayout';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import ModuloMaterias from './modulos/ModuloMaterias';
import ModuloCursos from './modulos/ModuloCursos';
import ModuloMisiones from './modulos/ModuloMisiones';
import ModuloInstitucion from './modulos/ModuloInstitucion';
import ModuloAdministradores from './modulos/ModuloAdministradores';
import ModuloAuditoria from './modulos/ModuloAuditoria';
import ModuloPapelera from './modulos/ModuloPapelera';
import ImportarEstudiantes from '../../components/ImportarEstudiantes';
import {
    DashboardHeader,
    StatCard,
    SectionCard,
    EmptyState,
    formatearFecha,
    TablaPro
} from '../../components/dashboard/DashboardWidgets';

// Selector de materias como tarjetas pastel (asistente de creación de
// docentes y modal de edición). El catálogo viene de la BD (SPEC-002):
// color e icono son los que definió el admin en el módulo Materias.
function SelectorMaterias({ materias, seleccion, onToggle }) {
    return (
        <div className="materia-pick-grid">
            {materias.map((m) => {
                const activa = seleccion.includes(m.id);
                return (
                    <button
                        type="button"
                        key={m.id}
                        className={`materia-pick ${activa ? 'is-activa' : ''}`}
                        style={estiloMateria(m)}
                        aria-pressed={activa}
                        onClick={() => onToggle(m.id)}
                    >
                        <span className="materia-pick-emoji" aria-hidden="true">{m.icono}</span>
                        <span className="materia-pick-nombre">{m.nombre}</span>
                        {activa && <TaskAltRoundedIcon className="materia-pick-check" />}
                    </button>
                );
            })}
        </div>
    );
}

// Chips de solo lectura con las materias de un docente. `catalogo` aporta
// el color/icono actual de cada materia asignada.
function ChipsMaterias({ materias, catalogo }) {
    if (!materias.length) return <span className="docente-sin-materias">Sin materias asignadas</span>;
    return (
        <div className="docente-chips">
            {materias.map((m) => {
                const info = catalogo.find((c) => c.id === m.id);
                return (
                    <span key={m.id} className="docente-chip" style={{ background: info?.color || '#e0f2fe' }}>
                        <span aria-hidden="true">{info?.icono || '📚'}</span> {m.nombre}
                    </span>
                );
            })}
        </div>
    );
}

// Selector de cursos (migración 010): mismos gestos que SelectorMaterias, pero
// los cursos no tienen color/icono, así que son chips neutros conmutables.
function SelectorCursos({ cursos, seleccion, onToggle }) {
    if (!cursos.length) {
        return <p className="docente-sin-materias">No hay cursos activos. Créalos en la sección «Cursos».</p>;
    }
    return (
        <div className="curso-pick-grid">
            {cursos.map((c) => {
                const activa = seleccion.includes(c.id);
                return (
                    <button
                        type="button"
                        key={c.id}
                        className={`curso-pick ${activa ? 'is-activa' : ''}`}
                        aria-pressed={activa}
                        onClick={() => onToggle(c.id)}
                    >
                        <span className="curso-pick-nombre">{c.etiqueta}</span>
                        {activa && <TaskAltRoundedIcon className="materia-pick-check" />}
                    </button>
                );
            })}
        </div>
    );
}

// Chips de solo lectura con los cursos asignados a un docente.
function ChipsCursos({ cursos }) {
    if (!cursos?.length) return <span className="docente-sin-materias">Sin cursos asignados</span>;
    return (
        <div className="docente-chips">
            {cursos.map((c) => (
                <span key={c.id} className="docente-chip docente-chip-curso">
                    <span aria-hidden="true">🏫</span> {c.etiqueta}
                </span>
            ))}
        </div>
    );
}

// Icono de la actividad reciente según quién hizo la acción (auditoría).
const ICONO_ROL = {
    docente: SchoolRoundedIcon,
    estudiante: GroupsRoundedIcon,
    admin: AdminPanelSettingsRoundedIcon
};

// Panel exclusivo del rol 'admin': alta/baja de docentes con sus materias
// asignadas (ahora también editables), gestión de estudiantes (reset de PIN,
// bajas) y monitoreo de los códigos de invitación de toda la institución.
export function AdminDashboard() {
    const navigate = useNavigate();
    const [pagina, setPagina] = useState('inicio');
    const [docentes, setDocentes] = useState([]);
    const [estudiantes, setEstudiantes] = useState([]);
    const [invitaciones, setInvitaciones] = useState([]);
    // Catálogo dinámico completo (el admin también ve las desactivadas).
    const [materias, setMaterias] = useState([]);
    // Cursos con conteos de estudiantes y docentes (SPEC-002).
    const [cursos, setCursos] = useState([]);
    // Permisos de la sesión (SPEC-003): la UI solo oculta módulos con esto;
    // el servidor revalida el permiso en cada endpoint.
    const puede = authService.tienePermiso;
    const [administradores, setAdministradores] = useState([]);
    // Auditoría y Papelera (SPEC-003).
    const [auditoria, setAuditoria] = useState([]);
    const [papelera, setPapelera] = useState([]);
    // Catálogo de misiones (SPEC-007). Incluye metadatos para el formulario.
    const [misionesData, setMisionesData] = useState({ misiones: [], categorias: [], tiers: [], tipos_objetivo: [], horizontes: [] });
    const [actividadReciente, setActividadReciente] = useState([]);
    const [error, setError] = useState('');
    const [avisoOk, setAvisoOk] = useState('');

    // Formulario de nuevo docente.
    const [nuevoUsuario, setNuevoUsuario] = useState('');
    const [nuevaClave, setNuevaClave] = useState('');
    const [materiasSel, setMateriasSel] = useState([]);
    const [cursosSel, setCursosSel] = useState([]);

    // Asistente de importación de estudiantes por Excel (SPEC-014).
    const [importando, setImportando] = useState(false);

    // Modal "Editar asignaciones" de un docente existente.
    const [docenteEditando, setDocenteEditando] = useState(null);
    const [materiasEdicion, setMateriasEdicion] = useState([]);
    const [cursosEdicion, setCursosEdicion] = useState([]);
    const [guardandoMaterias, setGuardandoMaterias] = useState(false);

    const cargar = async () => {
        try {
            setError('');
            // Cada lista se pide solo si la sesión tiene ese permiso (la UI
            // oculta; el servidor rechazaría igual las peticiones de más).
            const [d, e, i, m, c, a, au, p, rec, ms] = await Promise.all([
                puede('docentes') ? adminService.listarDocentes() : Promise.resolve([]),
                puede('estudiantes') ? adminService.listarEstudiantes() : Promise.resolve([]),
                puede('invitaciones') ? adminService.listarInvitaciones() : Promise.resolve([]),
                listarMaterias(),
                puede('cursos') ? adminService.listarCursos() : Promise.resolve([]),
                puede('administradores') ? adminService.listarAdministradores() : Promise.resolve([]),
                puede('auditoria') ? adminService.listarAuditoria() : Promise.resolve([]),
                puede('papelera') ? adminService.listarPapelera() : Promise.resolve([]),
                adminService.auditoriaReciente().catch(() => []),
                // Misiones se gestionan con el permiso 'materias' (contenido académico).
                puede('materias') ? adminService.listarMisiones().catch(() => null) : Promise.resolve(null)
            ]);
            setDocentes(d);
            setEstudiantes(e);
            setInvitaciones(i);
            setMaterias(m);
            setCursos(c);
            setAdministradores(a);
            setAuditoria(au);
            setPapelera(p);
            setActividadReciente(rec);
            if (ms) setMisionesData(ms);
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => { cargar(); }, []);

    // Refresco automático (SPEC-002): el panel se mantiene al día sin F5.
    // Se pausa con el modal de materias del docente abierto para no pisar
    // la edición en curso.
    useAutoRefresh(cargar, 20000, Boolean(docenteEditando) || importando);

    const ejecutar = async (accion, mensajeOk) => {
        try {
            setError('');
            setAvisoOk('');
            const resultado = await accion();
            if (mensajeOk) setAvisoOk(typeof mensajeOk === 'function' ? mensajeOk(resultado) : mensajeOk);
            await cargar();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleCrearDocente = (e) => {
        e.preventDefault();
        ejecutar(async () => {
            await adminService.crearDocente({
                username: nuevoUsuario.trim(),
                password: nuevaClave,
                materiaIds: materiasSel,
                cursoIds: cursosSel
            });
            setNuevoUsuario('');
            setNuevaClave('');
            setMateriasSel([]);
            setCursosSel([]);
        }, 'Docente creado correctamente.');
    };

    const toggleMateria = (id) =>
        setMateriasSel((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
    const toggleCurso = (id) =>
        setCursosSel((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

    const abrirEdicionMaterias = (docente) => {
        setDocenteEditando(docente);
        setMateriasEdicion(docente.materias.map((m) => m.id));
        setCursosEdicion((docente.cursos || []).map((c) => c.id));
    };

    const toggleMateriaEdicion = (id) =>
        setMateriasEdicion((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
    const toggleCursoEdicion = (id) =>
        setCursosEdicion((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

    const guardarMaterias = async () => {
        if (!docenteEditando) return;
        setGuardandoMaterias(true);
        await ejecutar(async () => {
            await adminService.actualizarDocente(docenteEditando.id, {
                materiaIds: materiasEdicion,
                cursoIds: cursosEdicion
            });
            setDocenteEditando(null);
        }, `Asignaciones de "${docenteEditando.username}" actualizadas.`);
        setGuardandoMaterias(false);
    };

    const cerrarSesion = () => {
        authService.logout();
        navigate('/');
    };

    // Actividad reciente del Inicio (SPEC-003): los últimos 5 eventos REALES
    // de la tabla de auditoría (misma fuente que el módulo Auditoría, sin
    // duplicar lógica). Sin datos inventados: vacío ⇒ EmptyState.
    const eventosInicio = useMemo(() => actividadReciente.map((ev) => ({
        id: ev.id,
        fecha: ev.creado_en,
        titulo: ev.nombre,
        detalle: ev.materia ? `${ev.descripcion} · ${ev.materia}` : ev.descripcion,
        Icon: ICONO_ROL[ev.rol] || TaskAltRoundedIcon
    })), [actividadReciente]);

    // Invitaciones divididas por estado: pendientes/expiradas (gestionables)
    // vs. utilizadas (historial de solo lectura).
    const invitacionesSinUsar = invitaciones.filter((i) => i.estado !== 'usado');
    const invitacionesUsadas = invitaciones.filter((i) => i.estado === 'usado');
    const invitacionesPendientes = invitaciones.filter((i) => i.estado === 'pendiente').length;

    const nombreAdmin = authService.getUsuario()?.username || 'admin';

    return (
        <SidebarLayout
            titulo="GamificApp · Administración"
            items={[
                // Sidebar agrupado (SPEC-003). Cada módulo se muestra solo si
                // la sesión tiene su permiso (el servidor revalida en cada
                // endpoint: la UI oculta, nunca protege).
                { id: 'inicio', label: 'Inicio', Icon: HomeFilledIcon },
                { id: 'docentes', label: 'Docentes', Icon: SchoolRoundedIcon, grupo: 'Gestión Académica', permiso: 'docentes' },
                { id: 'estudiantes', label: 'Estudiantes', Icon: GroupsRoundedIcon, grupo: 'Gestión Académica', permiso: 'estudiantes' },
                { id: 'materias', label: 'Materias', Icon: MenuBookRoundedIcon, grupo: 'Gestión Académica', permiso: 'materias' },
                { id: 'cursos', label: 'Cursos', Icon: Diversity3RoundedIcon, grupo: 'Gestión Académica', permiso: 'cursos' },
                { id: 'misiones', label: 'Misiones', Icon: EmojiEventsRoundedIcon, grupo: 'Gestión Académica', permiso: 'materias' },
                { id: 'invitaciones', label: 'Invitaciones', Icon: VpnKeyRoundedIcon, grupo: 'Gestión Institucional', permiso: 'invitaciones' },
                { id: 'institucion', label: 'Institución', Icon: ApartmentRoundedIcon, grupo: 'Gestión Institucional', permiso: 'institucion' },
                { id: 'administradores', label: 'Administradores', Icon: AdminPanelSettingsRoundedIcon, grupo: 'Seguridad', permiso: 'administradores' },
                { id: 'auditoria', label: 'Auditoría', Icon: HistoryEduRoundedIcon, grupo: 'Seguridad', permiso: 'auditoria' },
                { id: 'papelera', label: 'Papelera', Icon: DeleteSweepRoundedIcon, grupo: 'Seguridad', permiso: 'papelera' }
            ]
                .filter((item) => !item.permiso || puede(item.permiso))
                .map((item) => ({ ...item, activo: pagina === item.id, onClick: () => setPagina(item.id) }))}
            usuario={{ inicial: 'A', nombre: 'Administrador', detalle: nombreAdmin }}
            accionesFooter={[
                { label: 'Cerrar sesión', Icon: LogoutRoundedIcon, onClick: cerrarSesion }
            ]}
        >
                    <div className="admin-vista">
                        {error && (
                            <div className="aviso-migracion" role="alert">
                                <p>{error}</p>
                                <button onClick={() => setError('')}>Cerrar</button>
                            </div>
                        )}
                        {avisoOk && (
                            <div className="admin-aviso-ok" role="status">
                                <p>{avisoOk}</p>
                                <button onClick={() => setAvisoOk('')}>OK</button>
                            </div>
                        )}

                        {/* INICIO — resumen real de la institución (RFC-004). */}
                        {pagina === 'inicio' && (
                            <div className="dash-secciones">
                                <header className="admin-hero">
                                    <div className="admin-hero-avatar" aria-hidden="true">🏫</div>
                                    <div className="admin-hero-meta">
                                        <h1>Centro de administración</h1>
                                        <p>{getInstitucionCache()?.nombre || 'Institución educativa'} · Resumen general de la institución.</p>
                                    </div>
                                </header>

                                <div className="stats-row">
                                    {puede('docentes') && (
                                        <StatCard
                                            Icon={SchoolRoundedIcon}
                                            valor={docentes.length}
                                            etiqueta={docentes.length === 1 ? 'Docente registrado' : 'Docentes registrados'}
                                            tono="primary"
                                        />
                                    )}
                                    {puede('estudiantes') && (
                                        <StatCard
                                            Icon={GroupsRoundedIcon}
                                            valor={estudiantes.length}
                                            etiqueta={estudiantes.length === 1 ? 'Estudiante registrado' : 'Estudiantes registrados'}
                                            tono="accent"
                                        />
                                    )}
                                    {puede('invitaciones') && (
                                        <StatCard
                                            Icon={VpnKeyRoundedIcon}
                                            valor={invitacionesPendientes}
                                            etiqueta="Invitaciones pendientes"
                                            tono="fire"
                                        />
                                    )}
                                </div>

                                <div className="admin-accesos-grid">
                                    {puede('docentes') && (
                                        <button type="button" className="admin-acceso" onClick={() => setPagina('docentes')}>
                                            <span className="admin-acceso-icono is-primary"><SchoolRoundedIcon /></span>
                                            <span className="admin-acceso-texto">
                                                <strong>Docentes</strong>
                                                <span>Crea cuentas y asigna sus materias.</span>
                                            </span>
                                        </button>
                                    )}
                                    {puede('estudiantes') && (
                                        <button type="button" className="admin-acceso" onClick={() => setPagina('estudiantes')}>
                                            <span className="admin-acceso-icono is-accent"><GroupsRoundedIcon /></span>
                                            <span className="admin-acceso-texto">
                                                <strong>Estudiantes</strong>
                                                <span>Restablece PINs o da de baja cuentas.</span>
                                            </span>
                                        </button>
                                    )}
                                    {puede('invitaciones') && (
                                        <button type="button" className="admin-acceso" onClick={() => setPagina('invitaciones')}>
                                            <span className="admin-acceso-icono is-fire"><VpnKeyRoundedIcon /></span>
                                            <span className="admin-acceso-texto">
                                                <strong>Invitaciones</strong>
                                                <span>Revisa los códigos emitidos y su uso.</span>
                                            </span>
                                        </button>
                                    )}
                                </div>

                                {/* Actividad reciente (SPEC-003): últimos 5
                                    eventos reales de la auditoría. */}
                                <SectionCard
                                    titulo="Actividad reciente"
                                    Icon={TaskAltRoundedIcon}
                                    tag={eventosInicio.length ? `${eventosInicio.length} registros` : undefined}
                                >
                                    {eventosInicio.length ? (
                                        <ul className="actividad-lista">
                                            {eventosInicio.map((ev) => (
                                                <li key={ev.id} className="actividad-item">
                                                    <span className="actividad-icono"><ev.Icon /></span>
                                                    <div className="actividad-meta">
                                                        <strong>{ev.titulo}</strong>
                                                        <span>{ev.detalle}</span>
                                                    </div>
                                                    <span className="actividad-fecha">{formatearFecha(ev.fecha)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <EmptyState
                                            Icon={TaskAltRoundedIcon}
                                            titulo="Sin actividad registrada todavía"
                                            mensaje="Cuando docentes, estudiantes o administradores realicen acciones en la plataforma, los últimos movimientos aparecerán aquí."
                                        />
                                    )}
                                </SectionCard>
                            </div>
                        )}

                        {/* DOCENTES — asistente de creación + gestión con edición de materias. */}
                        {pagina === 'docentes' && (
                            <div className="dash-secciones">
                                <DashboardHeader
                                    titulo="Docentes"
                                    subtitulo="Crea cuentas de docentes y asígnales sus materias. Cada docente solo verá las suyas."
                                />

                                <SectionCard titulo="Crear un nuevo docente" Icon={PersonAddAlt1RoundedIcon}>
                                    <form className="docente-asistente" onSubmit={handleCrearDocente}>
                                        <div className="asistente-paso">
                                            <div className="asistente-paso-head">
                                                <span className="asistente-num">1</span>
                                                <div>
                                                    <strong>Datos de la cuenta</strong>
                                                    <p>Con este usuario y contraseña el docente iniciará sesión.</p>
                                                </div>
                                            </div>
                                            <div className="asistente-campos">
                                                <label className="asistente-campo">
                                                    <span>Usuario</span>
                                                    <input
                                                        placeholder="ej: juan.perez"
                                                        value={nuevoUsuario}
                                                        onChange={(e) => setNuevoUsuario(e.target.value)}
                                                    />
                                                </label>
                                                <label className="asistente-campo">
                                                    <span>Contraseña</span>
                                                    <input
                                                        type="password"
                                                        placeholder="Mínimo 8 caracteres"
                                                        value={nuevaClave}
                                                        onChange={(e) => setNuevaClave(e.target.value)}
                                                    />
                                                </label>
                                            </div>
                                        </div>

                                        <div className="asistente-paso">
                                            <div className="asistente-paso-head">
                                                <span className="asistente-num">2</span>
                                                <div>
                                                    <strong>Materias que enseñará</strong>
                                                    <p>Toca las materias para seleccionarlas. Podrás cambiarlas después.</p>
                                                </div>
                                            </div>
                                            <SelectorMaterias
                                                materias={materias.filter((m) => m.activa)}
                                                seleccion={materiasSel}
                                                onToggle={toggleMateria}
                                            />
                                        </div>

                                        <div className="asistente-paso">
                                            <div className="asistente-paso-head">
                                                <span className="asistente-num">3</span>
                                                <div>
                                                    <strong>Cursos que gestionará</strong>
                                                    <p>Solo podrá generar invitaciones para los cursos que le asignes. Podrás cambiarlos después.</p>
                                                </div>
                                            </div>
                                            <SelectorCursos
                                                cursos={cursos.filter((c) => c.activo)}
                                                seleccion={cursosSel}
                                                onToggle={toggleCurso}
                                            />
                                        </div>

                                        <div className="asistente-pie">
                                            <span className="asistente-resumen">
                                                {cursosSel.length
                                                    ? `${cursosSel.length} ${cursosSel.length === 1 ? 'curso' : 'cursos'} · ${materiasSel.length} ${materiasSel.length === 1 ? 'materia' : 'materias'}`
                                                    : materiasSel.length
                                                        ? `${materiasSel.length} ${materiasSel.length === 1 ? 'materia seleccionada' : 'materias seleccionadas'}`
                                                        : 'Sin materias ni cursos seleccionados'}
                                            </span>
                                            <button type="submit" className="quiz-generar-btn">
                                                <PersonAddAlt1RoundedIcon sx={{ fontSize: '1.2rem' }} />
                                                Crear docente
                                            </button>
                                        </div>
                                    </form>
                                </SectionCard>

                                <SectionCard
                                    titulo="Docentes registrados"
                                    Icon={SchoolRoundedIcon}
                                    tag={docentes.length ? `${docentes.length}` : undefined}
                                >
                                    {docentes.length ? (
                                        <ul className="docente-lista">
                                            {docentes.map((d) => (
                                                <li key={d.id} className="docente-fila">
                                                    <span className="docente-avatar" aria-hidden="true">
                                                        {d.username.charAt(0).toUpperCase()}
                                                    </span>
                                                    <div className="docente-info">
                                                        <strong>{d.username}</strong>
                                                        <ChipsMaterias materias={d.materias} catalogo={materias} />
                                                        <ChipsCursos cursos={d.cursos} />
                                                    </div>
                                                    <div className="docente-acciones">
                                                        <button
                                                            type="button"
                                                            className="docente-btn-editar"
                                                            onClick={() => abrirEdicionMaterias(d)}
                                                        >
                                                            <EditRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                                            Editar asignaciones
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="docente-btn-eliminar"
                                                            title="Eliminar docente"
                                                            aria-label={`Eliminar al docente ${d.username}`}
                                                            onClick={() => {
                                                                if (window.confirm(`¿Eliminar al docente "${d.username}"?`)) {
                                                                    ejecutar(() => adminService.eliminarDocente(d.id), 'Docente eliminado.');
                                                                }
                                                            }}
                                                        >
                                                            <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                                        </button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <EmptyState
                                            Icon={SchoolRoundedIcon}
                                            titulo="Aún no hay docentes"
                                            mensaje="Crea el primero con el asistente de arriba: usuario, contraseña y sus materias."
                                        />
                                    )}
                                </SectionCard>
                            </div>
                        )}

                        {/* ESTUDIANTES — gestión con reset de PIN y bajas. */}
                        {pagina === 'estudiantes' && (
                            <div className="dash-secciones">
                                <DashboardHeader
                                    titulo="Estudiantes"
                                    subtitulo="Todos los estudiantes registrados. Puedes restablecer su PIN (vuelve a su fecha de nacimiento) o darlos de baja."
                                />

                                <SectionCard
                                    titulo="Estudiantes registrados"
                                    Icon={GroupsRoundedIcon}
                                    tag={estudiantes.length ? `${estudiantes.length}` : undefined}
                                    accion={{ label: '📥 Importar desde Excel', onClick: () => setImportando(true) }}
                                >
                                    {estudiantes.length ? (
                                        <TablaPro
                                            filas={estudiantes}
                                            buscar={(e) => `${e.nombre_completo} ${e.curso}`}
                                            placeholderBusqueda="Buscar por nombre o curso…"
                                            cabecera={<tr><th>Estudiante</th><th>Curso</th><th>XP</th><th>Cód. emergencia</th><th>Acciones</th></tr>}
                                            renderFila={(e) => (
                                                <tr key={e.usuario_id}>
                                                            <td>
                                                                <div className="estudiante-celda">
                                                                    <span className="estudiante-avatar" aria-hidden="true">
                                                                        {e.nombre_completo.charAt(0).toUpperCase()}
                                                                    </span>
                                                                    <span className="estudiante-nombre">{e.nombre_completo}</span>
                                                                </div>
                                                            </td>
                                                            <td><span className="curso-chip">{e.curso}</span></td>
                                                            <td><span className="xp-valor">⭐ {e.xp_total}</span></td>
                                                            <td><code>{e.codigo_emergencia}</code></td>
                                                            <td>
                                                                <div className="admin-acciones">
                                                                    <button
                                                                        title="Restablecer PIN"
                                                                        aria-label={`Restablecer PIN de ${e.nombre_completo}`}
                                                                        onClick={() => ejecutar(
                                                                            () => adminService.resetearPinEstudiante(e.usuario_id),
                                                                            (r) => r.mensaje
                                                                        )}
                                                                    >
                                                                        <RestartAltRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                                                    </button>
                                                                    <button
                                                                        title="Eliminar estudiante"
                                                                        aria-label={`Eliminar a ${e.nombre_completo}`}
                                                                        className="accion-peligro"
                                                                        onClick={() => {
                                                                            if (window.confirm(`¿Eliminar a "${e.nombre_completo}" y todo su progreso?`)) {
                                                                                ejecutar(() => adminService.eliminarEstudiante(e.usuario_id), 'Estudiante eliminado.');
                                                                            }
                                                                        }}
                                                                    >
                                                                        <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                            )}
                                        />
                                    ) : (
                                        <EmptyState
                                            Icon={GroupsRoundedIcon}
                                            titulo="Aún no hay estudiantes"
                                            mensaje="Los estudiantes aparecerán aquí cuando se registren con un código de invitación de su docente."
                                            accion={{ label: 'Ver invitaciones', onClick: () => setPagina('invitaciones') }}
                                        />
                                    )}
                                </SectionCard>
                            </div>
                        )}

                        {/* MATERIAS — catálogo dinámico (SPEC-002). */}
                        {pagina === 'materias' && (
                            <div className="dash-secciones">
                                <DashboardHeader
                                    titulo="Materias"
                                    subtitulo="El catálogo oficial de la institución. Docentes y estudiantes ven estas materias con el color e icono que definas aquí."
                                />
                                <ModuloMaterias materias={materias} docentes={docentes} ejecutar={ejecutar} />
                            </div>
                        )}

                        {/* MISIONES — catálogo de misiones y progresión (SPEC-007). */}
                        {pagina === 'misiones' && (
                            <div className="dash-secciones">
                                <DashboardHeader
                                    titulo="Misiones"
                                    subtitulo="El catálogo de misiones que ven los estudiantes. Actívalas o desactívalas, ajusta recompensas o crea nuevas. El progreso se calcula automáticamente desde la actividad real."
                                />
                                <ModuloMisiones data={misionesData} ejecutar={ejecutar} />
                            </div>
                        )}

                        {/* CURSOS — catálogo de cursos y paralelos (SPEC-002). */}
                        {pagina === 'cursos' && (
                            <div className="dash-secciones">
                                <DashboardHeader
                                    titulo="Cursos"
                                    subtitulo="Los cursos y paralelos de la institución. Asígnalos a cada docente desde su ficha (Docentes → Editar asignaciones); solo así podrán generar invitaciones para ese curso."
                                />
                                <ModuloCursos cursos={cursos} ejecutar={ejecutar} />
                            </div>
                        )}

                        {/* ADMINISTRADORES — roles y permisos de admin. */}
                        {pagina === 'administradores' && puede('administradores') && (
                            <div className="dash-secciones">
                                <DashboardHeader
                                    titulo="Administradores"
                                    subtitulo="Las cuentas que gestionan la plataforma. El Administrador Principal controla la institución y a los demás administradores."
                                />
                                <ModuloAdministradores administradores={administradores} ejecutar={ejecutar} />
                            </div>
                        )}

                        {/* INSTITUCIÓN — configuración global (SPEC-002). */}
                        {pagina === 'institucion' && puede('institucion') && (
                            <div className="dash-secciones">
                                <DashboardHeader
                                    titulo="Institución"
                                    subtitulo="El nombre, logo y colores de la institución. Se aplican a toda la app al guardar."
                                />
                                <ModuloInstitucion ejecutar={ejecutar} />
                            </div>
                        )}

                        {/* AUDITORÍA — historial real de acciones (SPEC-003). */}
                        {pagina === 'auditoria' && puede('auditoria') && (
                            <div className="dash-secciones">
                                <DashboardHeader
                                    titulo="Auditoría"
                                    subtitulo="El registro de lo que sucede en la plataforma: qué hicieron los docentes, los estudiantes y los administradores, y cuándo."
                                />
                                <ModuloAuditoria eventos={auditoria} />
                            </div>
                        )}

                        {/* PAPELERA — eliminados restaurables (SPEC-003). */}
                        {pagina === 'papelera' && puede('papelera') && (
                            <div className="dash-secciones">
                                <DashboardHeader
                                    titulo="Papelera"
                                    subtitulo="Lo que se elimina llega aquí primero. Puedes restaurarlo tal como estaba o eliminarlo definitivamente."
                                />
                                <ModuloPapelera elementos={papelera} ejecutar={ejecutar} />
                            </div>
                        )}

                        {/* INVITACIONES — pendientes (gestionables) vs. historial de usadas. */}
                        {pagina === 'invitaciones' && (
                            <div className="dash-secciones">
                                <DashboardHeader
                                    titulo="Invitaciones"
                                    subtitulo="Los códigos que emiten los docentes para registrar estudiantes, separados entre los que siguen disponibles y los ya utilizados."
                                />

                                <SectionCard
                                    titulo="Invitaciones pendientes"
                                    Icon={VpnKeyRoundedIcon}
                                    tag={invitacionesSinUsar.length ? `${invitacionesSinUsar.length}` : undefined}
                                >
                                    {invitacionesSinUsar.length ? (
                                        <TablaPro
                                            filas={invitacionesSinUsar}
                                            buscar={(i) => `${i.codigo} ${i.docente} ${i.curso} ${i.estado}`}
                                            placeholderBusqueda="Buscar por código, docente o curso…"
                                            cabecera={<tr><th>Código</th><th>Docente</th><th>Curso</th><th>Estado</th><th>Expira</th><th>Acciones</th></tr>}
                                            renderFila={(i) => (
                                                <tr key={i.id}>
                                                            <td><code>{i.codigo}</code></td>
                                                            <td>{i.docente}</td>
                                                            <td><span className="curso-chip">{i.curso}</span></td>
                                                            <td><span className={`inv-estado inv-${i.estado}`}>{i.estado}</span></td>
                                                            <td>{formatearFecha(i.expira_en)}</td>
                                                            <td>
                                                                <div className="admin-acciones">
                                                                    <button
                                                                        title="Eliminar invitación"
                                                                        aria-label={`Eliminar la invitación ${i.codigo}`}
                                                                        className="accion-peligro"
                                                                        onClick={() => {
                                                                            if (window.confirm(`¿Eliminar la invitación "${i.codigo}" (${i.curso})? Ya no podrá usarse para registrarse.`)) {
                                                                                ejecutar(() => adminService.eliminarInvitacion(i.id), 'Invitación eliminada.');
                                                                            }
                                                                        }}
                                                                    >
                                                                        <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                            )}
                                        />
                                    ) : (
                                        <EmptyState
                                            Icon={VpnKeyRoundedIcon}
                                            titulo="No hay invitaciones pendientes"
                                            mensaje="Cuando un docente genere códigos para su curso, aparecerán aquí hasta que un estudiante los use."
                                        />
                                    )}
                                </SectionCard>

                                <SectionCard
                                    titulo="Historial de invitaciones utilizadas"
                                    Icon={HistoryRoundedIcon}
                                    tag={invitacionesUsadas.length ? `${invitacionesUsadas.length}` : undefined}
                                >
                                    {invitacionesUsadas.length ? (
                                        <TablaPro
                                            filas={invitacionesUsadas}
                                            buscar={(i) => `${i.codigo} ${i.docente} ${i.curso} ${i.usado_por || ''}`}
                                            placeholderBusqueda="Buscar por código, docente, curso o estudiante…"
                                            cabecera={<tr><th>Código</th><th>Docente</th><th>Curso</th><th>Estudiante</th><th>Fecha de uso</th></tr>}
                                            renderFila={(i) => (
                                                <tr key={i.id}>
                                                    <td><code>{i.codigo}</code></td>
                                                    <td>{i.docente}</td>
                                                    <td><span className="curso-chip">{i.curso}</span></td>
                                                    <td>{i.usado_por || '—'}</td>
                                                    <td>{i.usado_en ? formatearFecha(i.usado_en) : '—'}</td>
                                                </tr>
                                            )}
                                        />
                                    ) : (
                                        <EmptyState
                                            Icon={HistoryRoundedIcon}
                                            titulo="Ningún código se ha utilizado todavía"
                                            mensaje="Cuando un estudiante se registre con un código de invitación, quedará registrado en este historial."
                                        />
                                    )}
                                </SectionCard>
                            </div>
                        )}
                    </div>

            {/* Modal para editar las materias de un docente sin recrearlo. */}
            {docenteEditando && (
                <div className="preview-backdrop" onClick={() => !guardandoMaterias && setDocenteEditando(null)}>
                    <div className="preview-panel modal-materias" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Editar asignaciones del docente">
                        <div className="preview-head">
                            <div className="preview-head-file">
                                <span className="docente-avatar" aria-hidden="true">
                                    {docenteEditando.username.charAt(0).toUpperCase()}
                                </span>
                                <div className="preview-head-text">
                                    <h3>Editar asignaciones</h3>
                                    <span>{docenteEditando.username}</span>
                                </div>
                            </div>
                            <button className="preview-close" aria-label="Cerrar" onClick={() => setDocenteEditando(null)}>
                                <CloseRoundedIcon />
                            </button>
                        </div>
                        <div className="preview-body">
                            <p className="modal-materias-ayuda">
                                Toca una materia para agregarla o quitarla. El docente solo verá las materias seleccionadas.
                            </p>
                            <SelectorMaterias
                                materias={materias.filter((m) => m.activa)}
                                seleccion={materiasEdicion}
                                onToggle={toggleMateriaEdicion}
                            />
                            <p className="modal-materias-ayuda" style={{ marginTop: 18 }}>
                                Cursos que gestionará. Solo podrá generar invitaciones para los cursos seleccionados.
                            </p>
                            <SelectorCursos
                                cursos={cursos.filter((c) => c.activo)}
                                seleccion={cursosEdicion}
                                onToggle={toggleCursoEdicion}
                            />
                        </div>
                        <div className="preview-foot">
                            <button
                                type="button"
                                className="preview-action"
                                disabled={guardandoMaterias}
                                onClick={() => setDocenteEditando(null)}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="preview-action preview-action-primary"
                                disabled={guardandoMaterias}
                                onClick={guardarMaterias}
                            >
                                <TaskAltRoundedIcon />
                                {guardandoMaterias ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Asistente de importación de estudiantes por Excel (SPEC-014). */}
            {importando && (
                <ImportarEstudiantes
                    cursos={cursos.filter((c) => c.activo).map((c) => ({ id: c.id, etiqueta: c.etiqueta }))}
                    onCerrar={() => setImportando(false)}
                    onImportado={cargar}
                />
            )}
        </SidebarLayout>
    );
}
