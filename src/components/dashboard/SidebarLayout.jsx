import { useEffect, useId, useRef, useState } from 'react';
import { List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { getInstitucionCache } from '../../services/institucionService';

// Punto donde el sidebar pasa a barra superior (= @media (max-width: 760px)
// de dashboard.css; var() no funciona en @media, así que se repite aquí).
const ANCHO_BARRA_MOVIL = 760;

/**
 * Layout base compartido por los paneles de Administrador, Docente y
 * Estudiante. El sidebar ocupa siempre el alto de la ventana y se divide
 * en tres zonas: header (logo + nombre), navegación (con scroll propio si
 * hay muchos apartados) y footer (usuario + acciones) siempre visible.
 * El scroll del panel ocurre únicamente dentro de <main class="contenido">.
 *
 * Móvil (≤760px, SPEC-018 Fase 5): la barra superior queda compacta (logo +
 * título + botón de menú) y la navegación + footer se colapsan en un panel
 * desplegable superpuesto al contenido. El menú se cierra al elegir una
 * sección, con Escape (foco de vuelta al botón), con clic fuera o al
 * agrandar la ventana a escritorio.
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
    const [menuAbierto, setMenuAbierto] = useState(false);
    const asideRef = useRef(null);
    const botonMenuRef = useRef(null);
    const menuRef = useRef(null);
    const menuId = useId();

    // Escape cierra el menú móvil y devuelve el foco al botón que lo abrió.
    useEffect(() => {
        if (!menuAbierto) return undefined;
        const onTecla = (e) => {
            if (e.key === 'Escape') {
                setMenuAbierto(false);
                botonMenuRef.current?.focus();
            }
        };
        window.addEventListener('keydown', onTecla);
        return () => window.removeEventListener('keydown', onTecla);
    }, [menuAbierto]);

    // Clic/toque fuera de la barra = cerrar (sin robar el foco).
    useEffect(() => {
        if (!menuAbierto) return undefined;
        const alPulsar = (e) => {
            if (asideRef.current && !asideRef.current.contains(e.target)) setMenuAbierto(false);
        };
        document.addEventListener('pointerdown', alPulsar);
        return () => document.removeEventListener('pointerdown', alPulsar);
    }, [menuAbierto]);

    // Si la ventana vuelve a tamaño escritorio con el menú abierto, se cierra
    // solo (en escritorio el sidebar completo ya está siempre visible).
    // Doble vía: matchMedia (cubre también rotaciones) + resize clásico.
    useEffect(() => {
        if (!menuAbierto) return undefined;
        const consulta = window.matchMedia(`(min-width: ${ANCHO_BARRA_MOVIL + 1}px)`);
        const alCambiarMedia = (e) => { if (e.matches) setMenuAbierto(false); };
        const alRedimensionar = () => {
            if (window.innerWidth > ANCHO_BARRA_MOVIL) setMenuAbierto(false);
        };
        consulta.addEventListener('change', alCambiarMedia);
        window.addEventListener('resize', alRedimensionar);
        return () => {
            consulta.removeEventListener('change', alCambiarMedia);
            window.removeEventListener('resize', alRedimensionar);
        };
    }, [menuAbierto]);

    // Con el menú superpuesto abierto, el fondo no scrollea (mismo patrón que
    // ModalPanel/overlays: se guarda y restaura el overflow previo).
    useEffect(() => {
        if (!menuAbierto) return undefined;
        const previo = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previo; };
    }, [menuAbierto]);

    // Foco al panel al abrirse (los ítems quedan a un Tab de distancia).
    useEffect(() => {
        if (menuAbierto) menuRef.current?.focus();
    }, [menuAbierto]);

    const alternarMenu = () => setMenuAbierto((v) => !v);
    const cerrarMenu = () => setMenuAbierto(false);

    return (
        <div className="dashboard">
            <div className="sidebar-container">
                <aside className="sidebar" ref={asideRef}>
                    <div className="sidebar-header">
                        {logo && <img className="sidebar-logo" src={logo} alt="" />}
                        <h2 style={{ pointerEvents: 'none' }}>{titulo}</h2>
                        <button
                            type="button"
                            ref={botonMenuRef}
                            className="sidebar-hamburguesa"
                            aria-label={menuAbierto ? 'Cerrar el menú de navegación' : 'Abrir el menú de navegación'}
                            aria-expanded={menuAbierto}
                            aria-controls={menuId}
                            onClick={alternarMenu}
                        >
                            {menuAbierto
                                ? <CloseRoundedIcon sx={{ fontSize: '1.4rem' }} />
                                : <MenuRoundedIcon sx={{ fontSize: '1.4rem' }} />}
                        </button>
                    </div>

                    <div
                        id={menuId}
                        ref={menuRef}
                        tabIndex={-1}
                        className={`sidebar-menu ${menuAbierto ? 'is-abierto' : ''}`}
                    >
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
                                                onClick={() => {
                                                    // En móvil, elegir una sección cierra el menú;
                                                    // en escritorio el estado ya está cerrado.
                                                    cerrarMenu();
                                                    onClick?.();
                                                }}
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
                                <button
                                    key={label}
                                    className="logout-btn"
                                    onClick={() => {
                                        cerrarMenu();
                                        onClick?.();
                                    }}
                                >
                                    <Icon sx={{ fontSize: '1.1rem' }} />
                                    {label}
                                </button>
                            ))}
                        </div>
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
