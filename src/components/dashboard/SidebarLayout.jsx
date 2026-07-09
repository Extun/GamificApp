import { List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { getInstitucionCache } from '../../services/institucionService';

/**
 * Layout base compartido por los paneles de Administrador, Docente y
 * Estudiante. El sidebar ocupa siempre el alto de la ventana y se divide
 * en tres zonas: header (logo + nombre), navegación (con scroll propio si
 * hay muchos apartados) y footer (usuario + acciones) siempre visible.
 * El scroll del panel ocurre únicamente dentro de <main class="contenido">.
 *
 * - titulo: texto bajo el logo institucional.
 * - items: [{ id, label, Icon, activo, onClick, grupo? }] para la navegación.
 *   `grupo` (SPEC-003) es opcional: los ítems consecutivos con el mismo
 *   grupo se encabezan con su rótulo y un separador. Sin grupo, el sidebar
 *   se ve exactamente igual que antes (Docente y Estudiante no cambian).
 * - usuario: { inicial, nombre, detalle } mostrado en el footer.
 * - accionesFooter: [{ label, Icon, onClick }] botones bajo el usuario
 *   (p. ej. "Cerrar sesión").
 * - children: contenido principal del panel.
 * - extra: nodos fuera del layout (modales de pantalla completa).
 */
export function SidebarLayout({ titulo, items, usuario, accionesFooter = [], children, extra = null }) {
    const logo = getInstitucionCache()?.logo_data;

    return (
        <div className="dashboard">
            <div className="sidebar-container">
                <aside className="sidebar">
                    <div className="sidebar-header">
                        {logo && <img className="sidebar-logo" src={logo} alt="" />}
                        <h2 style={{ pointerEvents: 'none' }}>{titulo}</h2>
                    </div>

                    <nav className="sidebar-nav" aria-label="Secciones del panel">
                        <List>
                            {items.map(({ id, label, Icon, activo, onClick, grupo }, indice) => {
                                const nuevoGrupo = grupo && grupo !== items[indice - 1]?.grupo;
                                return (
                                    <ListItem disablePadding key={id} className="nav-item-wrap">
                                        {nuevoGrupo && (
                                            <span className="sidebar-grupo" aria-hidden="true">{grupo}</span>
                                        )}
                                        <ListItemButton
                                            className={`nav-item ${activo ? 'nav-item-activo' : ''}`}
                                            onClick={onClick}
                                        >
                                            <ListItemIcon className="nav-icon">
                                                <Icon sx={{ fontSize: '1.3rem' }} />
                                            </ListItemIcon>
                                            <ListItemText primary={label} />
                                        </ListItemButton>
                                    </ListItem>
                                );
                            })}
                        </List>
                    </nav>

                    <div className="sidebar-footer">
                        <div className="aside-content-user">
                            <div className="user-avatar">{usuario.inicial}</div>
                            <div className="user-meta">
                                <span className="user-name">{usuario.nombre}</span>
                                <span className="email-user-account">{usuario.detalle}</span>
                            </div>
                        </div>
                        {accionesFooter.map(({ label, Icon, onClick }) => (
                            <button key={label} className="logout-btn" onClick={onClick}>
                                <Icon sx={{ fontSize: '1.1rem' }} />
                                {label}
                            </button>
                        ))}
                    </div>
                </aside>

                <main className="contenido">
                    {children}
                </main>
            </div>
            {extra}
        </div>
    );
}
