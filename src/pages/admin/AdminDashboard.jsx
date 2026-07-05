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
import { List, ListItem, ListItemIcon, ListItemButton, ListItemText } from '@mui/material';
import MATERIAS from '../../constants/materias';
import authService from '../../services/authService';
import adminService from '../../services/adminService';
import {
    DashboardHeader,
    StatCard,
    SectionCard,
    EmptyState,
    QuickActionCard,
    formatearFecha
} from '../../components/dashboard/DashboardWidgets';

// Panel exclusivo del rol 'admin': alta/baja de docentes con sus materias
// asignadas, gestión de estudiantes (reset de PIN, bajas) y monitoreo de
// los códigos de invitación de toda la institución.
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

    const invitacionesPendientes = invitaciones.filter((i) => i.estado === 'pendiente').length;

    return (
        <div className="dashboard">
            <div className="sidebar-container">
                <aside className="sidebar">
                    <div className="aside-content-options">
                        <h2 style={{ pointerEvents: 'none' }}>GamificApp · Administración</h2>
                        <List>
                            <ListItem disablePadding>
                                <ListItemButton className="nav-item" onClick={() => setPagina('inicio')}>
                                    <ListItemIcon className="nav-icon"><HomeFilledIcon sx={{ fontSize: '1.3rem' }} /></ListItemIcon>
                                    <ListItemText primary="Inicio" />
                                </ListItemButton>
                            </ListItem>
                            <ListItem disablePadding>
                                <ListItemButton className="nav-item" onClick={() => setPagina('docentes')}>
                                    <ListItemIcon className="nav-icon"><SchoolRoundedIcon sx={{ fontSize: '1.3rem' }} /></ListItemIcon>
                                    <ListItemText primary="Docentes" />
                                </ListItemButton>
                            </ListItem>
                            <ListItem disablePadding>
                                <ListItemButton className="nav-item" onClick={() => setPagina('estudiantes')}>
                                    <ListItemIcon className="nav-icon"><GroupsRoundedIcon sx={{ fontSize: '1.3rem' }} /></ListItemIcon>
                                    <ListItemText primary="Estudiantes" />
                                </ListItemButton>
                            </ListItem>
                            <ListItem disablePadding>
                                <ListItemButton className="nav-item" onClick={() => setPagina('invitaciones')}>
                                    <ListItemIcon className="nav-icon"><VpnKeyRoundedIcon sx={{ fontSize: '1.3rem' }} /></ListItemIcon>
                                    <ListItemText primary="Invitaciones" />
                                </ListItemButton>
                            </ListItem>
                        </List>
                    </div>
                    <div className="aside-bottom">
                        <div className="aside-content-user">
                            <div className="user-avatar">A</div>
                            <div className="user-meta">
                                <span className="user-name">Administrador</span>
                                <span className="email-user-account">{authService.getUsuario()?.username}</span>
                            </div>
                        </div>
                        <button className="logout-btn" onClick={cerrarSesion}>
                            <LogoutRoundedIcon sx={{ fontSize: '1.1rem' }} />
                            Cerrar sesión
                        </button>
                    </div>
                </aside>

                <main className="contenido">
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
                            <DashboardHeader
                                titulo="Panel de Administración"
                                subtitulo="Resumen general de la institución."
                            />

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

                            <div className="quick-actions-grid">
                                <QuickActionCard
                                    Icon={SchoolRoundedIcon}
                                    titulo="Crear un docente"
                                    descripcion="Da de alta una cuenta y asígnale sus materias."
                                    cta="Ir a Docentes"
                                    onClick={() => setPagina('docentes')}
                                />
                                <QuickActionCard
                                    Icon={GroupsRoundedIcon}
                                    titulo="Gestionar estudiantes"
                                    descripcion="Restablece PINs o da de baja cuentas de estudiantes."
                                    cta="Ir a Estudiantes"
                                    onClick={() => setPagina('estudiantes')}
                                />
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

                    {pagina === 'docentes' && (
                        <>
                            <h1 style={{ pointerEvents: 'none' }}>Docentes</h1>
                            <p className="contenido-sub">Crea cuentas de docentes y asígnales sus materias. Cada docente solo verá las suyas.</p>

                            <section className="card">
                                <div className="card-head"><h3>Nuevo docente</h3></div>
                                <form className="admin-form" onSubmit={handleCrearDocente}>
                                    <input
                                        placeholder="Usuario (ej: juan.perez)"
                                        value={nuevoUsuario}
                                        onChange={(e) => setNuevoUsuario(e.target.value)}
                                    />
                                    <input
                                        type="password"
                                        placeholder="Contraseña (mínimo 8 caracteres)"
                                        value={nuevaClave}
                                        onChange={(e) => setNuevaClave(e.target.value)}
                                    />
                                    <div className="admin-materias-check">
                                        {MATERIAS.map((m) => (
                                            <label key={m.id} className={materiasSel.includes(m.id) ? 'sel' : ''}>
                                                <input
                                                    type="checkbox"
                                                    checked={materiasSel.includes(m.id)}
                                                    onChange={() => toggleMateria(m.id)}
                                                />
                                                {m.nombre}
                                            </label>
                                        ))}
                                    </div>
                                    <button type="submit" className="upload-mini-btn">Crear docente</button>
                                </form>
                            </section>

                            <section className="card">
                                <div className="card-head">
                                    <h3>Docentes registrados</h3>
                                    <span className="card-tag">{docentes.length}</span>
                                </div>
                                <table className="admin-tabla">
                                    <thead>
                                        <tr><th>Usuario</th><th>Materias asignadas</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        {docentes.map((d) => (
                                            <tr key={d.id}>
                                                <td>{d.username}</td>
                                                <td>{d.materias.length ? d.materias.map((m) => m.nombre).join(', ') : 'Sin materias'}</td>
                                                <td className="admin-acciones">
                                                    <button
                                                        title="Eliminar docente"
                                                        onClick={() => {
                                                            if (window.confirm(`¿Eliminar al docente "${d.username}"?`)) {
                                                                ejecutar(() => adminService.eliminarDocente(d.id), 'Docente eliminado.');
                                                            }
                                                        }}
                                                    >
                                                        <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {!docentes.length && <tr><td colSpan={3} className="vacio-msg">Aún no hay docentes.</td></tr>}
                                    </tbody>
                                </table>
                            </section>
                        </>
                    )}

                    {pagina === 'estudiantes' && (
                        <>
                            <h1 style={{ pointerEvents: 'none' }}>Estudiantes</h1>
                            <p className="contenido-sub">Todos los estudiantes registrados. Puedes restablecer su PIN (vuelve a su fecha de nacimiento) o darlos de baja.</p>

                            <section className="card">
                                <div className="card-head">
                                    <h3>Estudiantes registrados</h3>
                                    <span className="card-tag">{estudiantes.length}</span>
                                </div>
                                <table className="admin-tabla">
                                    <thead>
                                        <tr><th>Nombre</th><th>Curso</th><th>XP</th><th>Cód. emergencia</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        {estudiantes.map((e) => (
                                            <tr key={e.usuario_id}>
                                                <td>{e.nombre_completo}</td>
                                                <td>{e.curso}</td>
                                                <td>{e.xp_total}</td>
                                                <td><code>{e.codigo_emergencia}</code></td>
                                                <td className="admin-acciones">
                                                    <button
                                                        title="Restablecer PIN"
                                                        onClick={() => ejecutar(
                                                            () => adminService.resetearPinEstudiante(e.usuario_id),
                                                            (r) => r.mensaje
                                                        )}
                                                    >
                                                        <RestartAltRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                                    </button>
                                                    <button
                                                        title="Eliminar estudiante"
                                                        onClick={() => {
                                                            if (window.confirm(`¿Eliminar a "${e.nombre_completo}" y todo su progreso?`)) {
                                                                ejecutar(() => adminService.eliminarEstudiante(e.usuario_id), 'Estudiante eliminado.');
                                                            }
                                                        }}
                                                    >
                                                        <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {!estudiantes.length && <tr><td colSpan={5} className="vacio-msg">Aún no hay estudiantes registrados.</td></tr>}
                                    </tbody>
                                </table>
                            </section>
                        </>
                    )}

                    {pagina === 'invitaciones' && (
                        <>
                            <h1 style={{ pointerEvents: 'none' }}>Invitaciones</h1>
                            <p className="contenido-sub">Todos los códigos emitidos por los docentes y su estado.</p>

                            <section className="card">
                                <div className="card-head">
                                    <h3>Códigos de invitación</h3>
                                    <span className="card-tag">{invitaciones.length}</span>
                                </div>
                                <table className="admin-tabla">
                                    <thead>
                                        <tr><th>Código</th><th>Docente</th><th>Curso</th><th>Estado</th><th>Usado por</th></tr>
                                    </thead>
                                    <tbody>
                                        {invitaciones.map((i) => (
                                            <tr key={i.id}>
                                                <td><code>{i.codigo}</code></td>
                                                <td>{i.docente}</td>
                                                <td>{i.curso}</td>
                                                <td><span className={`inv-estado inv-${i.estado}`}>{i.estado}</span></td>
                                                <td>{i.usado_por || '—'}</td>
                                            </tr>
                                        ))}
                                        {!invitaciones.length && <tr><td colSpan={5} className="vacio-msg">Aún no se han generado invitaciones.</td></tr>}
                                    </tbody>
                                </table>
                            </section>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
