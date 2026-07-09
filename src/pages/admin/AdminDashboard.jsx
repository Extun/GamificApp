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
import { List, ListItem, ListItemIcon, ListItemButton, ListItemText } from '@mui/material';
import MATERIAS from '../../constants/materias';
import authService from '../../services/authService';
import adminService from '../../services/adminService';
import {
    DashboardHeader,
    StatCard,
    SectionCard,
    EmptyState,
    formatearFecha
} from '../../components/dashboard/DashboardWidgets';

// Emoji y tono pastel por materia: la misma identidad que ven estudiantes
// y docentes en sus "mundos" (ver MATERIA_UI en dashboard.jsx).
const MATERIA_UI = {
    'Matemáticas': { emoji: '🔢', tono: 1 },
    'Lenguaje': { emoji: '📖', tono: 2 },
    'Ciencias Naturales': { emoji: '🌱', tono: 3 },
    'Ciencias Sociales': { emoji: '🌎', tono: 4 },
    'Educación Física': { emoji: '⚽', tono: 5 }
};

// Selector de materias como tarjetas pastel (se usa en el asistente de
// creación de docentes y en el modal de edición de materias).
function SelectorMaterias({ seleccion, onToggle }) {
    return (
        <div className="materia-pick-grid">
            {MATERIAS.map((m) => {
                const ui = MATERIA_UI[m.nombre] || { emoji: '📚', tono: 1 };
                const activa = seleccion.includes(m.id);
                return (
                    <button
                        type="button"
                        key={m.id}
                        className={`materia-pick materia-pick-${ui.tono} ${activa ? 'is-activa' : ''}`}
                        aria-pressed={activa}
                        onClick={() => onToggle(m.id)}
                    >
                        <span className="materia-pick-emoji" aria-hidden="true">{ui.emoji}</span>
                        <span className="materia-pick-nombre">{m.nombre}</span>
                        {activa && <TaskAltRoundedIcon className="materia-pick-check" />}
                    </button>
                );
            })}
        </div>
    );
}

// Chips de solo lectura con las materias de un docente.
function ChipsMaterias({ materias }) {
    if (!materias.length) return <span className="docente-sin-materias">Sin materias asignadas</span>;
    return (
        <div className="docente-chips">
            {materias.map((m) => {
                const ui = MATERIA_UI[m.nombre] || { emoji: '📚', tono: 1 };
                return (
                    <span key={m.id} className={`docente-chip docente-chip-${ui.tono}`}>
                        <span aria-hidden="true">{ui.emoji}</span> {m.nombre}
                    </span>
                );
            })}
        </div>
    );
}

// Panel exclusivo del rol 'admin': alta/baja de docentes con sus materias
// asignadas (ahora también editables), gestión de estudiantes (reset de PIN,
// bajas) y monitoreo de los códigos de invitación de toda la institución.
export function AdminDashboard() {
    const navigate = useNavigate();
    const [pagina, setPagina] = useState('inicio');
    const [docentes, setDocentes] = useState([]);
    const [estudiantes, setEstudiantes] = useState([]);
    const [invitaciones, setInvitaciones] = useState([]);
    const [error, setError] = useState('');
    const [avisoOk, setAvisoOk] = useState('');

    // Formulario de nuevo docente.
    const [nuevoUsuario, setNuevoUsuario] = useState('');
    const [nuevaClave, setNuevaClave] = useState('');
    const [materiasSel, setMateriasSel] = useState([]);

    // Modal "Editar materias" de un docente existente.
    const [docenteEditando, setDocenteEditando] = useState(null);
    const [materiasEdicion, setMateriasEdicion] = useState([]);
    const [guardandoMaterias, setGuardandoMaterias] = useState(false);

    const cargar = async () => {
        try {
            setError('');
            const [d, e, i] = await Promise.all([
                adminService.listarDocentes(),
                adminService.listarEstudiantes(),
                adminService.listarInvitaciones()
            ]);
            setDocentes(d);
            setEstudiantes(e);
            setInvitaciones(i);
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => { cargar(); }, []);

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
                materiaIds: materiasSel
            });
            setNuevoUsuario('');
            setNuevaClave('');
            setMateriasSel([]);
        }, 'Docente creado correctamente.');
    };

    const toggleMateria = (id) =>
        setMateriasSel((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);

    const abrirEdicionMaterias = (docente) => {
        setDocenteEditando(docente);
        setMateriasEdicion(docente.materias.map((m) => m.id));
    };

    const toggleMateriaEdicion = (id) =>
        setMateriasEdicion((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);

    const guardarMaterias = async () => {
        if (!docenteEditando) return;
        setGuardandoMaterias(true);
        await ejecutar(async () => {
            await adminService.actualizarDocente(docenteEditando.id, { materiaIds: materiasEdicion });
            setDocenteEditando(null);
        }, `Materias de "${docenteEditando.username}" actualizadas.`);
        setGuardandoMaterias(false);
    };

    const cerrarSesion = () => {
        authService.logout();
        navigate('/');
    };

    // Altas recientes de la institución (docentes y estudiantes traen su
    // `creado_en` real desde la API). Sin datos inventados: si no hay
    // registros, la sección muestra su estado vacío.
    const actividadReciente = useMemo(() => {
        const eventos = [
            ...docentes.map((d) => ({
                id: `docente-${d.id}`,
                fecha: d.creado_en,
                titulo: d.username,
                detalle: 'Nuevo docente',
                Icon: SchoolRoundedIcon
            })),
            ...estudiantes.map((e) => ({
                id: `estudiante-${e.usuario_id}`,
                fecha: e.creado_en,
                titulo: e.nombre_completo,
                detalle: `Nuevo estudiante · ${e.curso}`,
                Icon: GroupsRoundedIcon
            }))
        ].filter((ev) => ev.fecha);
        eventos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        return eventos.slice(0, 8);
    }, [docentes, estudiantes]);

    // Invitaciones divididas por estado: pendientes/expiradas (gestionables)
    // vs. utilizadas (historial de solo lectura).
    const invitacionesSinUsar = invitaciones.filter((i) => i.estado !== 'usado');
    const invitacionesUsadas = invitaciones.filter((i) => i.estado === 'usado');
    const invitacionesPendientes = invitaciones.filter((i) => i.estado === 'pendiente').length;

    const nombreAdmin = authService.getUsuario()?.username || 'admin';

    return (
        <div className="dashboard">
            <div className="sidebar-container">
                <aside className="sidebar">
                    <div className="aside-content-options">
                        <h2 style={{ pointerEvents: 'none' }}>GamificApp · Administración</h2>
                        <List>
                            {[
                                { id: 'inicio', label: 'Inicio', Icon: HomeFilledIcon },
                                { id: 'docentes', label: 'Docentes', Icon: SchoolRoundedIcon },
                                { id: 'estudiantes', label: 'Estudiantes', Icon: GroupsRoundedIcon },
                                { id: 'invitaciones', label: 'Invitaciones', Icon: VpnKeyRoundedIcon }
                            ].map(({ id, label, Icon }) => (
                                <ListItem disablePadding key={id}>
                                    <ListItemButton
                                        className={`nav-item ${pagina === id ? 'nav-item-activo' : ''}`}
                                        onClick={() => setPagina(id)}
                                    >
                                        <ListItemIcon className="nav-icon"><Icon sx={{ fontSize: '1.3rem' }} /></ListItemIcon>
                                        <ListItemText primary={label} />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    </div>
                    <div className="aside-bottom">
                        <div className="aside-content-user">
                            <div className="user-avatar">A</div>
                            <div className="user-meta">
                                <span className="user-name">Administrador</span>
                                <span className="email-user-account">{nombreAdmin}</span>
                            </div>
                        </div>
                        <button className="logout-btn" onClick={cerrarSesion}>
                            <LogoutRoundedIcon sx={{ fontSize: '1.1rem' }} />
                            Cerrar sesión
                        </button>
                    </div>
                </aside>

                <main className="contenido">
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
                                        <p>Unidad Educativa Fiscal Clemencia Coronel de Pincay · Resumen general de la institución.</p>
                                    </div>
                                </header>

                                <div className="stats-row">
                                    <StatCard
                                        Icon={SchoolRoundedIcon}
                                        valor={docentes.length}
                                        etiqueta={docentes.length === 1 ? 'Docente registrado' : 'Docentes registrados'}
                                        tono="primary"
                                    />
                                    <StatCard
                                        Icon={GroupsRoundedIcon}
                                        valor={estudiantes.length}
                                        etiqueta={estudiantes.length === 1 ? 'Estudiante registrado' : 'Estudiantes registrados'}
                                        tono="accent"
                                    />
                                    <StatCard
                                        Icon={VpnKeyRoundedIcon}
                                        valor={invitacionesPendientes}
                                        etiqueta="Invitaciones pendientes"
                                        tono="fire"
                                    />
                                </div>

                                <div className="admin-accesos-grid">
                                    <button type="button" className="admin-acceso" onClick={() => setPagina('docentes')}>
                                        <span className="admin-acceso-icono is-primary"><SchoolRoundedIcon /></span>
                                        <span className="admin-acceso-texto">
                                            <strong>Docentes</strong>
                                            <span>Crea cuentas y asigna sus materias.</span>
                                        </span>
                                    </button>
                                    <button type="button" className="admin-acceso" onClick={() => setPagina('estudiantes')}>
                                        <span className="admin-acceso-icono is-accent"><GroupsRoundedIcon /></span>
                                        <span className="admin-acceso-texto">
                                            <strong>Estudiantes</strong>
                                            <span>Restablece PINs o da de baja cuentas.</span>
                                        </span>
                                    </button>
                                    <button type="button" className="admin-acceso" onClick={() => setPagina('invitaciones')}>
                                        <span className="admin-acceso-icono is-fire"><VpnKeyRoundedIcon /></span>
                                        <span className="admin-acceso-texto">
                                            <strong>Invitaciones</strong>
                                            <span>Revisa los códigos emitidos y su uso.</span>
                                        </span>
                                    </button>
                                </div>

                                <SectionCard
                                    titulo="Actividad reciente"
                                    Icon={TaskAltRoundedIcon}
                                    tag={actividadReciente.length ? `${actividadReciente.length} registros` : undefined}
                                >
                                    {actividadReciente.length ? (
                                        <ul className="actividad-lista">
                                            {actividadReciente.map((ev) => (
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
                                            titulo="Sin registros todavía"
                                            mensaje="Cuando se creen docentes o se registren estudiantes, sus altas aparecerán aquí."
                                            accion={{ label: 'Crear el primer docente', onClick: () => setPagina('docentes') }}
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
                                            <SelectorMaterias seleccion={materiasSel} onToggle={toggleMateria} />
                                        </div>

                                        <div className="asistente-pie">
                                            <span className="asistente-resumen">
                                                {materiasSel.length
                                                    ? `${materiasSel.length} ${materiasSel.length === 1 ? 'materia seleccionada' : 'materias seleccionadas'}`
                                                    : 'Ninguna materia seleccionada'}
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
                                                        <ChipsMaterias materias={d.materias} />
                                                    </div>
                                                    <div className="docente-acciones">
                                                        <button
                                                            type="button"
                                                            className="docente-btn-editar"
                                                            onClick={() => abrirEdicionMaterias(d)}
                                                        >
                                                            <EditRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                                            Editar materias
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
                                >
                                    {estudiantes.length ? (
                                        <div className="tabla-scroll">
                                            <table className="admin-tabla admin-tabla-moderna">
                                                <thead>
                                                    <tr><th>Estudiante</th><th>Curso</th><th>XP</th><th>Cód. emergencia</th><th>Acciones</th></tr>
                                                </thead>
                                                <tbody>
                                                    {estudiantes.map((e) => (
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
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
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
                                        <div className="tabla-scroll">
                                            <table className="admin-tabla admin-tabla-moderna">
                                                <thead>
                                                    <tr><th>Código</th><th>Docente</th><th>Curso</th><th>Estado</th><th>Expira</th><th>Acciones</th></tr>
                                                </thead>
                                                <tbody>
                                                    {invitacionesSinUsar.map((i) => (
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
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
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
                                        <div className="tabla-scroll">
                                            <table className="admin-tabla admin-tabla-moderna">
                                                <thead>
                                                    <tr><th>Código</th><th>Docente</th><th>Curso</th><th>Estudiante</th><th>Fecha de uso</th></tr>
                                                </thead>
                                                <tbody>
                                                    {invitacionesUsadas.map((i) => (
                                                        <tr key={i.id}>
                                                            <td><code>{i.codigo}</code></td>
                                                            <td>{i.docente}</td>
                                                            <td><span className="curso-chip">{i.curso}</span></td>
                                                            <td>{i.usado_por || '—'}</td>
                                                            <td>{i.usado_en ? formatearFecha(i.usado_en) : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
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
                </main>
            </div>

            {/* Modal para editar las materias de un docente sin recrearlo. */}
            {docenteEditando && (
                <div className="preview-backdrop" onClick={() => !guardandoMaterias && setDocenteEditando(null)}>
                    <div className="preview-panel modal-materias" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Editar materias del docente">
                        <div className="preview-head">
                            <div className="preview-head-file">
                                <span className="docente-avatar" aria-hidden="true">
                                    {docenteEditando.username.charAt(0).toUpperCase()}
                                </span>
                                <div className="preview-head-text">
                                    <h3>Editar materias</h3>
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
                            <SelectorMaterias seleccion={materiasEdicion} onToggle={toggleMateriaEdicion} />
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
        </div>
    );
}
