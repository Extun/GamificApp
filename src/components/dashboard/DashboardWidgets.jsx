// Piezas compartidas de los dashboards (RFC-004). Son componentes de
// presentación puros: reciben datos REALES por props y no consultan APIs.
// La regla de la casa: si no hay datos, el contenedor muestra <EmptyState />
// en lugar de inventar valores.
import { useMemo, useState } from 'react';
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

// Modal estándar de los paneles (SPEC-002): reutiliza las clases del
// FilePreviewModal (backdrop con blur + panel) para que todos los diálogos
// se vean idénticos. `pie` recibe los botones de acción.
export function ModalPanel({ titulo, subtitulo, avatar, onCerrar, pie, children, className = '' }) {
    return (
        <div className="preview-backdrop" onClick={onCerrar}>
            <div
                className={`preview-panel ${className}`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={titulo}
            >
                <div className="preview-head">
                    <div className="preview-head-file">
                        {avatar}
                        <div className="preview-head-text">
                            <h3>{titulo}</h3>
                            {subtitulo && <span>{subtitulo}</span>}
                        </div>
                    </div>
                    <button type="button" className="preview-close" aria-label="Cerrar" onClick={onCerrar}>✕</button>
                </div>
                <div className="preview-body">{children}</div>
                {pie && <div className="preview-foot">{pie}</div>}
            </div>
        </div>
    );
}

// Tabla profesional (SPEC-002): búsqueda instantánea en cliente + paginación.
// `cabecera` es el <tr> del thead; `renderFila` pinta cada fila (los datos
// llegan REALES por props, como el resto de widgets). `buscar(item)` devuelve
// el texto contra el que se filtra; si se omite, no hay buscador.
const TAMANOS_PAGINA = [10, 25, 50, 100];

export function TablaPro({ cabecera, filas, renderFila, buscar, placeholderBusqueda = 'Buscar…' }) {
    const [texto, setTexto] = useState('');
    const [tamano, setTamano] = useState(TAMANOS_PAGINA[0]);
    const [pagina, setPagina] = useState(1);

    const filtradas = useMemo(() => {
        const q = texto.trim().toLowerCase();
        if (!buscar || !q) return filas;
        return filas.filter((f) => String(buscar(f)).toLowerCase().includes(q));
    }, [filas, texto, buscar]);

    const totalPaginas = Math.max(1, Math.ceil(filtradas.length / tamano));
    const paginaActual = Math.min(pagina, totalPaginas);
    const visibles = filtradas.slice((paginaActual - 1) * tamano, paginaActual * tamano);

    return (
        <div className="tablapro">
            {buscar && filas.length > TAMANOS_PAGINA[0] / 2 && (
                <div className="tablapro-toolbar">
                    <input
                        type="search"
                        className="tablapro-buscar"
                        placeholder={placeholderBusqueda}
                        value={texto}
                        aria-label={placeholderBusqueda}
                        onChange={(e) => { setTexto(e.target.value); setPagina(1); }}
                    />
                    {texto && (
                        <span className="tablapro-resultado">
                            {filtradas.length} resultado{filtradas.length === 1 ? '' : 's'}
                        </span>
                    )}
                </div>
            )}

            {filtradas.length ? (
                <div className="tabla-scroll">
                    <table className="admin-tabla admin-tabla-moderna">
                        <thead>{cabecera}</thead>
                        <tbody>{visibles.map(renderFila)}</tbody>
                    </table>
                </div>
            ) : (
                <p className="tablapro-vacio">Ningún registro coincide con la búsqueda.</p>
            )}

            {(totalPaginas > 1 || filtradas.length > TAMANOS_PAGINA[0]) && (
                <div className="tablapro-pie">
                    <label className="tablapro-tamano">
                        Ver
                        <select value={tamano} onChange={(e) => { setTamano(Number(e.target.value)); setPagina(1); }}>
                            {TAMANOS_PAGINA.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        por página
                    </label>
                    <div className="tablapro-paginas">
                        <button
                            type="button"
                            aria-label="Página anterior"
                            disabled={paginaActual <= 1}
                            onClick={() => setPagina(paginaActual - 1)}
                        >
                            ‹
                        </button>
                        <span>Página {paginaActual} de {totalPaginas}</span>
                        <button
                            type="button"
                            aria-label="Página siguiente"
                            disabled={paginaActual >= totalPaginas}
                            onClick={() => setPagina(paginaActual + 1)}
                        >
                            ›
                        </button>
                    </div>
                </div>
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
