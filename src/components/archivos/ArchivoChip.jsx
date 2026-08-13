import { useCallback, useEffect, useRef, useState } from 'react';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded';
import SlideshowRoundedIcon from '@mui/icons-material/SlideshowRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { extraerTextoWord } from '../../services/officeService';
import { cargarDocumentoPdf, renderPaginaPdf } from '../../services/pdfService';

export const formatSize = (bytes) => {
    if (bytes === null || bytes === undefined) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const getKind = (name = "") => {
    const ext = name.split(".").pop().toLowerCase();
    if (ext === "pdf") return "pdf";
    if (["doc", "docx"].includes(ext)) return "word";
    if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
    if (["ppt", "pptx"].includes(ext)) return "ppt";
    return "other";
};

export const kindMeta = {
    pdf: { label: "Documento PDF", Icon: PictureAsPdfRoundedIcon, className: "file-pdf" },
    word: { label: "Documento Word", Icon: DescriptionRoundedIcon, className: "file-word" },
    excel: { label: "Hoja de cálculo Excel", Icon: TableChartRoundedIcon, className: "file-excel" },
    ppt: { label: "Presentación PowerPoint", Icon: SlideshowRoundedIcon, className: "file-ppt" },
    other: { label: "Documento", Icon: InsertDriveFileRoundedIcon, className: "file-other" }
};

// Metadatos de un `kind`, con respaldo genérico SIEMPRE.
//
// `kindMeta[archivo.kind]` a secas era una bomba de relojería: la columna
// `materiales.kind` es un VARCHAR(20) con DEFAULT 'file' —una clave que este
// mapa no conoce— y el servidor acepta cualquier cadena de hasta 20
// caracteres. Con una sola fila así, desestructurar `undefined` lanzaba
// "Cannot destructure property 'Icon'" y tumbaba la PANTALLA ENTERA del
// estudiante y del docente, no solo esa tarjeta. Hoy el frontend siempre
// calcula el kind con `getKind()` antes de subir, así que no se dispara por el
// camino normal; el respaldo cubre el valor por defecto de la propia base y
// cualquier tipo futuro que llegue de un cliente más nuevo.
//
// Sin `export` a propósito: los dos únicos usos viven en este archivo, y
// exportarla añadiría un error más de `react-refresh/only-export-components`
// a los que este archivo ya arrastra.
const metaDeKind = (kind) => kindMeta[kind] || kindMeta.other;

// Convierte el dataURL persistido en un Blob para generar un enlace de descarga.
const dataURLtoBlob = (dataUrl) => {
    const [head, b64] = dataUrl.split(",");
    const mime = head.match(/:(.*?);/)?.[1] || "application/octet-stream";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
};

// Descarga local del archivo original usando un enlace temporal (createObjectURL).
export function descargarArchivo(archivo) {
    if (!archivo?.dataUrl) return false;
    const blob = dataURLtoBlob(archivo.dataUrl);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = archivo.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
}

// Tarjeta minimalista: solo icono de tipo, nombre (truncado) y tamaño. Toda la
// interacción (descargar / eliminar / previsualizar) ocurre al abrir el modal.
export function FileChip({ archivo, onClick }) {
    const { Icon, className } = metaDeKind(archivo.kind);
    return (
        <button className={`file-chip ${className}`} onClick={onClick}>
            <span className="file-chip-icon"><Icon /></span>
            <span className="file-chip-meta">
                <span className="file-chip-name">{archivo.name}</span>
                <span className="file-chip-size">{archivo.sizeLabel}</span>
            </span>
        </button>
    );
}

// Cuerpo de la previsualización para archivos de Office (Word/Excel/PowerPoint).
// Intenta extraer texto (.docx vía mammoth); si no es posible, muestra un icono
// grande + metadatos y deja la descarga como acción principal.
function OfficePreview({ archivo, label, Icon, className }) {
    const [estado, setEstado] = useState('idle'); // idle | cargando | listo | sin-texto
    const [texto, setTexto] = useState('');

    useEffect(() => {
        let activo = true;
        setEstado('cargando');
        setTexto('');
        extraerTextoWord(archivo).then((res) => {
            if (!activo) return;
            if (res) { setTexto(res); setEstado('listo'); }
            else { setEstado('sin-texto'); }
        });
        return () => { activo = false; };
    }, [archivo]);

    if (estado === 'listo') {
        return (
            <div className="doc-preview">
                <div className="doc-preview-head">
                    <span className="doc-preview-tag">Texto extraído · {label}</span>
                    <h4>{archivo.name.replace(/\.[^.]+$/, "")}</h4>
                </div>
                <pre className="doc-preview-extract">{texto}</pre>
            </div>
        );
    }

    // Tarjeta de respaldo: icono grande llamativo + metadatos.
    return (
        <div className={`office-hero ${className}`}>
            <span className="office-hero-icon"><Icon /></span>
            <h4 className="office-hero-name">{archivo.name}</h4>
            <p className="office-hero-label">{label}</p>
            <div className="doc-preview-meta">
                <div><span>Tipo</span><strong>{label}</strong></div>
                <div><span>Tamaño</span><strong>{archivo.sizeLabel}</strong></div>
                <div><span>Estado</span><strong>{estado === 'cargando' ? 'Procesando…' : 'Cargado'}</strong></div>
            </div>
            <p className="office-hero-note">
                {estado === 'cargando'
                    ? 'Analizando el documento…'
                    : 'La vista previa completa no está disponible para este formato. Descárgalo para editarlo en su aplicación.'}
            </p>
        </div>
    );
}

// Visualizador de PDF con navegación de páginas, render bajo demanda y caché LRU
// en memoria (mantiene la página actual + las 2 visitadas más recientes).
const CACHE_LIMITE = 3;

function PdfViewer({ archivo }) {
    const pdfRef = useRef(null);
    const cacheRef = useRef(new Map());   // nº página -> dataURL (orden = recencia)
    const peticionRef = useRef(0);        // token anti-condición de carrera

    const [total, setTotal] = useState(archivo.pageCount || 0);
    const [pagina, setPagina] = useState(1);
    const [src, setSrc] = useState(archivo.thumbnail || null);
    const [cargando, setCargando] = useState(false);
    // Antes NINGÚN fallo llegaba a la interfaz: el `.catch` de la carga estaba
    // vacío, `mostrarPagina` no tenía `catch` y la salida por documento ausente
    // era un `return` mudo. Cualquiera de los tres dejaba el esqueleto de carga
    // puesto para siempre, sin mensaje ni rastro en consola: imposible saber si
    // el PDF tardaba o si estaba roto. `error` es el canal que faltaba.
    const [error, setError] = useState(null);
    const [intento, setIntento] = useState(0);   // reintento manual desde la tarjeta de error

    // Inserta en la caché y expulsa la entrada menos usada si se supera el límite.
    const guardarEnCache = useCallback((n, dataUrl) => {
        const cache = cacheRef.current;
        cache.delete(n);          // re-insertar al final = marcar como más reciente
        cache.set(n, dataUrl);
        while (cache.size > CACHE_LIMITE) {
            cache.delete(cache.keys().next().value); // la más antigua (LRU)
        }
    }, []);

    // Muestra una página: instantáneo si está en caché; si no, la renderiza.
    const mostrarPagina = useCallback(async (n) => {
        const cache = cacheRef.current;
        if (cache.has(n)) {
            const cached = cache.get(n);
            cache.delete(n); cache.set(n, cached); // refrescar recencia
            setSrc(cached);
            setCargando(false);
            return;
        }
        const pdf = pdfRef.current;
        if (!pdf) {
            setCargando(false);
            setError('El documento no llegó a cargarse.');
            return;
        }
        const id = ++peticionRef.current;
        setCargando(true);
        setError(null);
        try {
            const dataUrl = await renderPaginaPdf(pdf, n, 2.5);
            if (id !== peticionRef.current) return; // llegó una navegación más nueva
            guardarEnCache(n, dataUrl);
            setSrc(dataUrl);
        } catch (err) {
            if (id !== peticionRef.current) return;
            setError(err?.message || 'No se pudo dibujar la página.');
        } finally {
            if (id === peticionRef.current) setCargando(false);
        }
    }, [guardarEnCache]);

    // Carga el documento UNA vez por archivo y prepara la página 1.
    useEffect(() => {
        let activo = true;
        cacheRef.current = new Map();
        peticionRef.current = 0;
        setPagina(1);
        setSrc(archivo.thumbnail || null);
        setTotal(archivo.pageCount || 0);
        setError(null);

        if (!archivo.dataUrl) {
            // Archivo legacy sin bytes: con miniatura aún se ve algo; sin ella
            // no hay absolutamente nada que dibujar y hay que decirlo.
            if (!archivo.thumbnail) {
                setError('Este archivo se guardó sin su contenido, así que no hay nada que previsualizar.');
            }
            return;
        }

        cargarDocumentoPdf(archivo.dataUrl).then((pdf) => {
            if (!activo) { pdf.destroy?.(); return; }
            pdfRef.current = pdf;
            setTotal(pdf.numPages);
            // La miniatura ya es la página 1 en alta resolución: siembra la caché.
            if (archivo.thumbnail) guardarEnCache(1, archivo.thumbnail);
            mostrarPagina(1);
        }).catch((err) => {
            // PDF ilegible: se mantiene la miniatura si existe, pero el motivo
            // se muestra en vez de desaparecer.
            if (!activo) return;
            setError(err?.message || 'No se pudo abrir el PDF.');
        });

        return () => {
            activo = false;
            const pdf = pdfRef.current;
            pdfRef.current = null;
            pdf?.destroy?.();
        };
    }, [archivo, intento, guardarEnCache, mostrarPagina]);

    const irA = (n) => {
        if (n < 1 || (total && n > total)) return;
        setPagina(n);
        mostrarPagina(n);
    };

    const reintentar = () => setIntento((n) => n + 1);

    // Sin nada dibujado y con un fallo detrás, el esqueleto miente: parece que
    // sigue trabajando. Se cambia por la misma tarjeta de respaldo que ya usan
    // los archivos de Office, con el motivo real y la descarga como salida.
    if (error && !src) {
        return (
            <div className="office-hero file-pdf">
                <span className="office-hero-icon"><PictureAsPdfRoundedIcon /></span>
                <h4 className="office-hero-name">{archivo.name}</h4>
                <p className="office-hero-label">No se pudo mostrar la vista previa</p>
                <div className="doc-preview-meta">
                    <div><span>Tipo</span><strong>Documento PDF</strong></div>
                    <div><span>Tamaño</span><strong>{archivo.sizeLabel}</strong></div>
                    <div><span>Páginas</span><strong>{total || '—'}</strong></div>
                </div>
                <p className="office-hero-note">
                    {error} Puedes descargarlo e intentar abrirlo en tu lector de PDF habitual.
                </p>
                <button className="pdf-nav-btn" onClick={reintentar}>
                    <RefreshRoundedIcon /> Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="pdf-viewer">
            <div className="pdf-canvas-wrap">
                {src ? (
                    <img className="pdf-thumb" src={src} alt={`Página ${pagina} de ${archivo.name}`} />
                ) : (
                    <div className="pdf-page">
                        <span className="pdf-line w-70"></span>
                        <span className="pdf-line w-90"></span>
                        <span className="pdf-line w-60"></span>
                        <span className="pdf-line w-85"></span>
                        <span className="pdf-line w-40"></span>
                        <span className="pdf-block"></span>
                        <span className="pdf-line w-80"></span>
                        <span className="pdf-line w-50"></span>
                    </div>
                )}
                {cargando && <span className="pdf-loading">Renderizando…</span>}
                {/* Ya hay una página a la vista y ha fallado OTRA: se avisa sin
                    tirar lo que el usuario ya estaba mirando. */}
                {error && src && !cargando && (
                    <span className="pdf-loading pdf-loading-error" role="status">
                        No se pudo dibujar la página {pagina}
                    </span>
                )}
            </div>

            {total > 1 && (
                <div className="pdf-nav">
                    <button
                        className="pdf-nav-btn"
                        onClick={() => irA(pagina - 1)}
                        disabled={pagina <= 1}
                        aria-label="Página anterior"
                    >
                        <ChevronLeftRoundedIcon /> Anterior
                    </button>
                    <span className="pdf-counter">Página {pagina} de {total}</span>
                    <button
                        className="pdf-nav-btn"
                        onClick={() => irA(pagina + 1)}
                        disabled={pagina >= total}
                        aria-label="Página siguiente"
                    >
                        Siguiente <ChevronRightRoundedIcon />
                    </button>
                </div>
            )}
        </div>
    );
}

export function FilePreviewModal({ archivo, onClose, onDownload, onDelete }) {
    if (!archivo) return null;
    const { label, Icon, className } = metaDeKind(archivo.kind);
    const esPdf = archivo.kind === "pdf";
    const descargaLabel = esPdf ? "Descargar" : "Descargar para editar";

    return (
        <div className="preview-backdrop" onClick={onClose}>
            <div className="preview-panel" onClick={(e) => e.stopPropagation()}>
            <header className="preview-head">
                <div className={`preview-head-file ${className}`}>
                    <Icon />
                    <div className="preview-head-text">
                        <h3>{archivo.name}</h3>
                        <span>{label} · {archivo.sizeLabel}</span>
                    </div>
                </div>
                <button className="preview-close" aria-label="Cerrar" onClick={onClose}>
                    <CloseRoundedIcon />
                </button>
            </header>

            <div className="preview-body">
                    {esPdf ? (
                        <PdfViewer archivo={archivo} />
                    ) : (
                        <OfficePreview archivo={archivo} label={label} Icon={Icon} className={className} />
                    )}
            </div>

            {(onDownload || onDelete) && (
                <footer className="preview-foot">
                    {onDelete && (
                        <button
                            className="preview-action preview-action-danger"
                            onClick={() => { onDelete(archivo); onClose(); }}
                        >
                            <DeleteOutlineRoundedIcon /> Eliminar
                        </button>
                    )}
                    {onDownload && (
                        <button
                            className="preview-action preview-action-primary"
                            onClick={() => onDownload(archivo)}
                        >
                            <FileDownloadOutlinedIcon /> {descargaLabel}
                        </button>
                    )}
                </footer>
            )}
            </div>
        </div>
    );
}
