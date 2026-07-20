// Piezas compartidas de los dashboards (RFC-004). Son componentes de
// presentación puros: reciben datos REALES por props y no consultan APIs.
// La regla de la casa: si no hay datos, el contenedor muestra <EmptyState />
// en lugar de inventar valores.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
                    {/* `accion` admite una o varias acciones (array). */}
                    {accion && [].concat(accion).map((a) => (
                        <button key={a.label} type="button" className="section-accion" onClick={a.onClick}>
                            {a.label}
                        </button>
                    ))}
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
//
// Accesibilidad (SPEC-018 Fase 3): foco inicial en el panel, focus trap con
// Tab/Shift+Tab, Escape = onCerrar (la MISMA función que el backdrop y la ✕,
// así hereda las guardas tipo `!guardando && cerrar` de cada consumidor),
// restauración del foco al elemento que abrió el modal y bloqueo del scroll
// de fondo. El contrato de props no cambia.

// Elementos enfocables dentro del panel (suficiente para los modales de la casa).
const SELECTOR_ENFOCABLES =
    'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Bloqueo de scroll con contador: si se abren modales consecutivos o anidados,
// el overflow original del body se restaura solo al cerrar el último.
let modalesAbiertos = 0;
let overflowPrevioBody = '';

export function ModalPanel({ titulo, subtitulo, avatar, onCerrar, pie, children, className = '' }) {
    const panelRef = useRef(null);
    const tituloId = useId();
    const subtituloId = useId();

    // Scroll del fondo bloqueado mientras el modal está abierto.
    useEffect(() => {
        if (modalesAbiertos === 0) {
            overflowPrevioBody = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        modalesAbiertos += 1;
        return () => {
            modalesAbiertos -= 1;
            if (modalesAbiertos === 0) document.body.style.overflow = overflowPrevioBody;
        };
    }, []);

    // Mismo patrón de foco que el overlay de resultado: foco al abrir,
    // restauración al cerrar (si el elemento sigue en pantalla y enfocable).
    useEffect(() => {
        const previo = document.activeElement;
        panelRef.current?.focus();
        return () => {
            if (previo instanceof HTMLElement && previo.isConnected && !previo.disabled) {
                previo.focus();
            }
        };
    }, []);

    // Teclado por bubbling del propio modal (no `window`): con modales
    // consecutivos solo responde el que contiene el foco.
    const onTecla = (e) => {
        if (e.key === 'Escape') {
            if (onCerrar) {
                e.stopPropagation();
                onCerrar();
            }
            return;
        }
        if (e.key !== 'Tab') return;
        const panel = panelRef.current;
        if (!panel) return;
        const enfocables = [...panel.querySelectorAll(SELECTOR_ENFOCABLES)]
            .filter((el) => el.offsetParent !== null);
        if (enfocables.length === 0) {
            e.preventDefault();
            return;
        }
        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];
        const activo = document.activeElement;
        if (e.shiftKey) {
            // Desde el primero (o el propio panel recién enfocado), volver al último.
            if (activo === primero || activo === panel || !panel.contains(activo)) {
                e.preventDefault();
                ultimo.focus();
            }
        } else if (activo === ultimo || !panel.contains(activo)) {
            e.preventDefault();
            primero.focus();
        }
    };

    return (
        <div className="preview-backdrop" onClick={onCerrar} onKeyDown={onTecla}>
            <div
                ref={panelRef}
                className={`preview-panel ${className}`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={tituloId}
                aria-describedby={subtitulo ? subtituloId : undefined}
                tabIndex={-1}
            >
                <div className="preview-head">
                    <div className="preview-head-file">
                        {avatar}
                        <div className="preview-head-text">
                            <h3 id={tituloId}>{titulo}</h3>
                            {subtitulo && <span id={subtituloId}>{subtitulo}</span>}
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
