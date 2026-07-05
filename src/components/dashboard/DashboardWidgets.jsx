// Piezas compartidas de los dashboards (RFC-004). Son componentes de
// presentación puros: reciben datos REALES por props y no consultan APIs.
// La regla de la casa: si no hay datos, el contenedor muestra <EmptyState />
// en lugar de inventar valores.
import './dashboardWidgets.css';

// Fecha corta para listas de actividad ("3 jul").
export const formatearFecha = (valor) => {
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime())
        ? ''
        : fecha.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
};

// Encabezado de bienvenida: título + subtítulo + chips con datos reales
// (nivel, XP, conteos). Los chips se omiten si no hay datos que mostrar.
export function DashboardHeader({ titulo, subtitulo, chips = [] }) {
    return (
        <header className="dash-header">
            <h1>{titulo}</h1>
            {subtitulo && <p className="dash-header-sub">{subtitulo}</p>}
            {chips.length > 0 && (
                <div className="dash-header-chips">
                    {chips.map((chip) => <span key={chip} className="dash-chip">{chip}</span>)}
                </div>
            )}
        </header>
    );
}

// Indicador numérico con icono. `tono` elige la paleta del icono.
export function StatCard({ Icon, valor, etiqueta, tono = 'primary' }) {
    return (
        <div className="stat-card">
            <div className={`stat-icon stat-icon-${tono}`}>{Icon && <Icon />}</div>
            <div>
                <span className="stat-value">{valor}</span>
                <span className="stat-label">{etiqueta}</span>
            </div>
        </div>
    );
}

// Contenedor de sección del dashboard: título con icono, tag informativo
// opcional y una acción opcional en la cabecera (p. ej. "Gestionar").
export function SectionCard({ titulo, Icon, tag, accion, children }) {
    return (
        <section className="card">
            <div className="card-head">
                <h3 className="section-titulo">
                    {Icon && <Icon className="section-titulo-icono" />}
                    {titulo}
                </h3>
                <div className="section-head-extra">
                    {tag && <span className="card-tag">{tag}</span>}
                    {accion && (
                        <button type="button" className="section-accion" onClick={accion.onClick}>
                            {accion.label}
                        </button>
                    )}
                </div>
            </div>
            {children}
        </section>
    );
}

// Estado vacío estándar: comunica la ausencia de datos y, si aplica,
// ofrece la acción que llenaría esta sección.
export function EmptyState({ Icon, titulo, mensaje, accion }) {
    return (
        <div className="empty-state" role="status">
            {Icon && <span className="empty-state-icon"><Icon /></span>}
            <h4>{titulo}</h4>
            {mensaje && <p>{mensaje}</p>}
            {accion && (
                <button type="button" className="empty-state-btn" onClick={accion.onClick}>
                    {accion.label}
                </button>
            )}
        </div>
    );
}

// Tarjeta de acción sugerida: le dice al usuario qué hacer a continuación
// con un solo botón. Es el corazón de "Continuar aprendiendo/trabajando".
export function QuickActionCard({ Icon, titulo, descripcion, cta, onClick }) {
    return (
        <div className="quick-action-card">
            {Icon && <span className="quick-action-icon"><Icon /></span>}
            <div className="quick-action-meta">
                <h4>{titulo}</h4>
                {descripcion && <p>{descripcion}</p>}
            </div>
            <button type="button" className="quick-action-btn" onClick={onClick}>
                {cta}
            </button>
        </div>
    );
}
