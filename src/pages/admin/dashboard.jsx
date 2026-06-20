import { useState } from 'react';
import './dashboard.css';
import HomeFilledIcon from '@mui/icons-material/HomeFilled';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import MilitaryTechRoundedIcon from '@mui/icons-material/MilitaryTechRounded';
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded';
import SlideshowRoundedIcon from '@mui/icons-material/SlideshowRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { FileUpload } from '../../components/fileupload/fileupload';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemButton,
  ListItemText
} from '@mui/material';

const formatSize = (bytes) => {
    if (bytes === null || bytes === undefined) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getKind = (name = "") => {
    const ext = name.split(".").pop().toLowerCase();
    if (ext === "pdf") return "pdf";
    if (["doc", "docx"].includes(ext)) return "word";
    if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
    if (["ppt", "pptx"].includes(ext)) return "ppt";
    return "other";
};

const kindMeta = {
    pdf: { label: "Documento PDF", Icon: PictureAsPdfRoundedIcon, className: "file-pdf" },
    word: { label: "Documento Word", Icon: DescriptionRoundedIcon, className: "file-word" },
    excel: { label: "Hoja de cálculo Excel", Icon: TableChartRoundedIcon, className: "file-excel" },
    ppt: { label: "Presentación PowerPoint", Icon: SlideshowRoundedIcon, className: "file-ppt" },
    other: { label: "Documento", Icon: InsertDriveFileRoundedIcon, className: "file-other" }
};

function FileChip({ archivo, onClick }) {
    const { Icon, className } = kindMeta[archivo.kind];
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

function FilePreviewModal({ archivo, onClose }) {
    if (!archivo) return null;
    const { label, Icon, className } = kindMeta[archivo.kind];
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
                    {archivo.kind === "pdf" ? (
                        <div className="pdf-viewer">
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
                            <span className="pdf-foot">Vista previa simulada · Página 1 de 1</span>
                        </div>
                    ) : (
                        <div className="doc-preview">
                            <div className="doc-preview-head">
                                <span className="doc-preview-tag">Vista previa del documento</span>
                                <h4>{archivo.name.replace(/\.[^.]+$/, "")}</h4>
                            </div>
                            <p className="doc-preview-text">
                                Este es un contenido de ejemplo que simula la vista previa del
                                documento sin depender de librerías externas. Aquí se mostraría el
                                texto, las tablas o las diapositivas del archivo cargado por el docente.
                            </p>
                            <div className="doc-preview-meta">
                                <div><span>Tipo</span><strong>{label}</strong></div>
                                <div><span>Tamaño</span><strong>{archivo.sizeLabel}</strong></div>
                                <div><span>Estado</span><strong>Cargado</strong></div>
                            </div>
                        </div>
                    )}
            </div>
            </div>
        </div>
    );
}

export function Dashboard() {

    const [pagina, setPagina] = useState("");
    const [materiaSeleccionada, setMateriaSeleccionada] = useState(null);
    const [archivosPorMateria, setArchivosPorMateria] = useState({});
    const [archivoPreview, setArchivoPreview] = useState(null);

    const materias = [
        "Lengua y Literatura",
        "Matemáticas",
        "Ciencias Naturales y Sociales",
        "Educación Física",
        "Educación Socioemocional",
        "Lengua Extranjera",
        "Educación Cultural y Artística"
    ];

    const misiones = [
        { titulo: "Revisar entregas de Matemáticas", progreso: 80 },
        { titulo: "Crear quiz de Ciencias Naturales", progreso: 45 },
        { titulo: "Publicar logros de la semana", progreso: 20 }
    ];

    const ranking = [
        { nombre: "Ana Pérez", puntos: 1280 },
        { nombre: "Luis Mora", puntos: 1150 },
        { nombre: "Sofía Díaz", puntos: 1090 }
    ];

    const handleUploadMateria = (materia, file) => {
        const archivo = {
            id: `${Date.now()}-${file.name}`,
            name: file.name,
            sizeLabel: formatSize(file.size),
            kind: getKind(file.name)
        };
        setArchivosPorMateria((prev) => ({
            ...prev,
            [materia]: [...(prev[materia] || []), archivo]
        }));
    };

    return (
        <div className="dashboard">

            <div className ="sidebar-container">
                <aside className="sidebar">
                <div className="aside-content-options">
                    <h2 style={{pointerEvents:"none"}}>Unidad Educativa Benemérita Sociedad Filantrópica del Guayas</h2>
                    <List>
                        <ListItem disablePadding>
                            <ListItemButton className="nav-item" onClick={() => setPagina("")}>
                                <ListItemIcon className="nav-icon">
                                <HomeFilledIcon sx={{ fontSize: "1.3rem" }} />
                            </ListItemIcon>
                            <ListItemText primary="Home" />
                            </ListItemButton>
                        </ListItem>
                        <ListItem disablePadding>
                            <ListItemButton className="nav-item" onClick={() => setPagina("materias")}>
                                <ListItemIcon className="nav-icon">
                                <MenuBookIcon sx={{ fontSize: "1.3rem" }} />
                            </ListItemIcon>
                            <ListItemText primary="Materias" />
                                </ListItemButton>
                        </ListItem>
                    </List>
                </div>
                <div className="aside-content-user">
                    <div className="user-avatar">D</div>
                    <div className="user-meta">
                        <span className="user-name">Docente</span>
                        <span className='email-user-account'>docente@esclemencia.edu.ec</span>
                    </div>
                </div>
            </aside>

            <main className="contenido">

                {/* HOME */}
                {pagina === "" && (
                    <>
                        <h1 style={{pointerEvents:"none"}}>Panel de Administración</h1>
                        <p className="contenido-sub" style={{pointerEvents:"none"}}>Bienvenido al sistema de gamificación educativa.</p>

                        <div className="stats-row">
                            <div className="stat-card">
                                <div className="stat-icon stat-icon-primary"><TaskAltRoundedIcon /></div>
                                <div>
                                    <span className="stat-value">12</span>
                                    <span className="stat-label">Tareas activas</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon stat-icon-accent"><EmojiEventsRoundedIcon /></div>
                                <div>
                                    <span className="stat-value">48</span>
                                    <span className="stat-label">Logros otorgados</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon stat-icon-fire"><LocalFireDepartmentRoundedIcon /></div>
                                <div>
                                    <span className="stat-value">7</span>
                                    <span className="stat-label">Días de racha</span>
                                </div>
                            </div>
                        </div>

                        <div className="home-grid">
                            <section className="card">
                                <div className="card-head">
                                    <h3>Misiones de hoy</h3>
                                    <span className="card-tag">{misiones.length} pendientes</span>
                                </div>
                                <ul className="mission-list">
                                    {misiones.map((m, i) => (
                                        <li key={i} className="mission-item">
                                            <div className="mission-top">
                                                <span>{m.titulo}</span>
                                                <span className="mission-pct">{m.progreso}%</span>
                                            </div>
                                            <div className="progress-track">
                                                <div className="progress-fill" style={{ width: `${m.progreso}%` }} />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <aside className="card-stack">
                                <section className="card profile-card">
                                    <div className="profile-avatar">D</div>
                                    <h3>Docente</h3>
                                    <p className="profile-role">Administrador de aula</p>
                                    <div className="profile-level">
                                        <span>Nivel 5</span>
                                        <div className="progress-track">
                                            <div className="progress-fill progress-fill-accent" style={{ width: "65%" }} />
                                        </div>
                                        <span className="profile-xp">650 / 1000 XP</span>
                                    </div>
                                </section>

                                <section className="card">
                                    <div className="card-head">
                                        <h3>Ranking</h3>
                                        <MilitaryTechRoundedIcon className="rank-head-icon" />
                                    </div>
                                    <ol className="rank-list">
                                        {ranking.map((r, i) => (
                                            <li key={i} className="rank-item">
                                                <span className={`rank-pos rank-pos-${i + 1}`}>{i + 1}</span>
                                                <span className="rank-name">{r.nombre}</span>
                                                <span className="rank-points">{r.puntos} pts</span>
                                            </li>
                                        ))}
                                    </ol>
                                </section>
                            </aside>
                        </div>
                    </>
                )}

                {/* MATERIAS GRID */}
                {pagina === "materias" && !materiaSeleccionada && (
                    <>
                        <h1 style={{pointerEvents:"none"}}>Materias</h1>

                        <div className="materias-grid">
                            {materias.map((mat, index) => (
                                <div
                                    key={index}
                                    className="materia-card"
                                    onClick={() => setMateriaSeleccionada(mat)}
                                >
                                    <MenuBookIcon className="materia-card-icon" />
                                    <span>{mat}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* MATERIA DETALLE */}
                {pagina === "materias" && materiaSeleccionada && (
                    <>
                        <button
                            className="back-btn"
                            onClick={() => { setMateriaSeleccionada(null); setArchivoPreview(null); }}
                        >
                            ← Volver
                        </button>

                        <h1 style={{pointerEvents:"none"}}>{materiaSeleccionada}</h1>

                        <div className="materia-panel">
                            <div className="opcion">Generar Quiz</div>
                            <div className="opcion">Calificaciones</div>
                        </div>

                        {(archivosPorMateria[materiaSeleccionada] || []).length > 0 && (
                            <section className="card materia-cards">
                                <div className="card-head">
                                    <h3>Material subido</h3>
                                    <span className="card-tag">
                                        {archivosPorMateria[materiaSeleccionada].length} archivos
                                    </span>
                                </div>
                                <div className="file-chip-grid">
                                    {archivosPorMateria[materiaSeleccionada].map((archivo) => (
                                        <FileChip
                                            key={archivo.id}
                                            archivo={archivo}
                                            onClick={() => setArchivoPreview(archivo)}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        <section className="card materia-upload">
                            <div className="card-head card-head-center">
                                <h3>Cargar archivo</h3>
                            </div>
                            <FileUpload onUpload={(file) => handleUploadMateria(materiaSeleccionada, file)} />
                        </section>
                    </>
                )}

            </main>
            </div>

            <FilePreviewModal archivo={archivoPreview} onClose={() => setArchivoPreview(null)} />
        </div>
    );
}
