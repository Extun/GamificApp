import { useRef, useState } from 'react';
import './dashboard.css';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import HomeFilledIcon from '@mui/icons-material/HomeFilled';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import MilitaryTechRoundedIcon from '@mui/icons-material/MilitaryTechRounded';
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { FileChip, FilePreviewModal, getKind, formatSize, descargarArchivo } from '../../components/archivos/ArchivoChip';
import { procesarPdf } from '../../services/pdfService';
import { NOMBRES_MATERIAS } from '../../constants/materias';
import { migrarMateriasAntiguas } from '../../services/migracionMaterias';

// Lee un File como dataURL (base64) para persistirlo y poder descargarlo luego.
const leerComoDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

// Persiste el mapa de archivos en localStorage y lo devuelve para el setState.
const persistirArchivos = (mapa) => {
    try {
        localStorage.setItem('edu_archivosMateria', JSON.stringify(mapa));
    } catch {
        // Ignorar errores de cuota/persistencia de localStorage
    }
    return mapa;
};
import { AsistenteIA } from './asistenteIA';
import { GeneradorQuiz } from './GeneradorQuiz';
import { EditorClasificador } from '../../components/clasificador/EditorClasificador';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemButton,
  ListItemText,
  Grid,
  Card,
  CircularProgress
} from '@mui/material';

function WidgetsRendimiento({ materia, topEstudiantes, progreso, siguientePaso, onAccion }) {
    return (
        <Grid container spacing={2.5} className="widgets-rendimiento">
            {/* Widget 1 · Top estudiantes */}
            <Grid size={{ xs: 12, md: 4 }}>
                <Card elevation={0} className="widget-card">
                    <div className="widget-head">
                        <span className="widget-icon widget-icon-gold"><WorkspacePremiumRoundedIcon /></span>
                        <h4>Top estudiantes</h4>
                    </div>
                    <ol className="widget-rank">
                        {topEstudiantes.slice(0, 3).map((est, i) => (
                            <li key={i} className="widget-rank-item">
                                <span className={`rank-pos rank-pos-${i + 1}`}>{i + 1}</span>
                                <span className="widget-rank-name">{est.nombre}</span>
                                <span className="widget-rank-points">{est.puntos} pts</span>
                            </li>
                        ))}
                    </ol>
                </Card>
            </Grid>

            {/* Widget 2 · Progreso de la materia */}
            <Grid size={{ xs: 12, md: 4 }}>
                <Card elevation={0} className="widget-card widget-card-center">
                    <div className="widget-head">
                        <span className="widget-icon widget-icon-primary"><TrendingUpRoundedIcon /></span>
                        <h4>Progreso de la materia</h4>
                    </div>
                    <div className="widget-progress">
                        <CircularProgress
                            variant="determinate"
                            value={progreso}
                            size={120}
                            thickness={5}
                            className="widget-progress-ring"
                        />
                        <CircularProgress
                            variant="determinate"
                            value={100}
                            size={120}
                            thickness={5}
                            className="widget-progress-track"
                        />
                        <span className="widget-progress-label">{progreso}%</span>
                    </div>
                    <p className="widget-progress-sub">Completado en {materia}</p>
                </Card>
            </Grid>

            {/* Widget 3 · Acción rápida / siguiente paso */}
            <Grid size={{ xs: 12, md: 4 }}>
                <Card elevation={0} className="widget-card widget-card-action">
                    <div className="widget-head">
                        <span className="widget-icon widget-icon-accent"><AutoAwesomeRoundedIcon /></span>
                        <h4>Siguiente paso</h4>
                    </div>
                    <p className="widget-action-text">{siguientePaso.descripcion}</p>
                    <button className="widget-action-btn" onClick={() => onAccion(siguientePaso.destino)}>
                        {siguientePaso.label}
                        <ArrowForwardRoundedIcon sx={{ fontSize: '1.1rem' }} />
                    </button>
                </Card>
            </Grid>
        </Grid>
    );
}

// Contenedor de material con uploader minimalista en la cabecera. La privacidad
// es implícita: cada contenedor sube con su propio `isPrivate` sin pedirlo al docente.
function MaterialContenedor({ titulo, subtitulo, Icon, vacioMsg, archivos, isPrivate, onUpload, onPreview }) {
    const inputRef = useRef(null);
    const [subiendo, setSubiendo] = useState(false);

    const handleChange = async (e) => {
        const file = e.target.files?.[0];
        if (inputRef.current) inputRef.current.value = "";
        if (!file) return;
        setSubiendo(true);
        try {
            await onUpload(file, { isPrivate });
        } finally {
            setSubiendo(false);
        }
    };

    return (
        <section className={`card material-cont ${isPrivate ? 'material-cont-privado' : ''}`}>
            <div className="card-head material-cont-head">
                <div className="material-cont-title">
                    <span className={`material-cont-icon ${isPrivate ? 'is-privado' : 'is-publico'}`}>
                        <Icon />
                    </span>
                    <div>
                        <h3>{titulo}</h3>
                        <span className="material-cont-sub">{subtitulo}</span>
                    </div>
                </div>
                <button
                    className="upload-mini-btn"
                    onClick={() => inputRef.current?.click()}
                    disabled={subiendo}
                >
                    <AddRoundedIcon sx={{ fontSize: '1.1rem' }} />
                    {subiendo ? 'Subiendo…' : 'Subir archivo'}
                </button>
                <input ref={inputRef} type="file" hidden onChange={handleChange} />
            </div>

            {archivos.length > 0 ? (
                <div className="file-chip-grid">
                    {archivos.map((archivo) => (
                        <FileChip
                            key={archivo.id}
                            archivo={archivo}
                            onClick={() => onPreview(archivo)}
                        />
                    ))}
                </div>
            ) : (
                <p className="vacio-msg">{vacioMsg}</p>
            )}
        </section>
    );
}

export function Dashboard() {

    const [pagina, setPagina] = useState("");
    const [materiaSeleccionada, setMateriaSeleccionada] = useState(null);
    const [subVistaMateria, setSubVistaMateria] = useState('');
    // Migra el contenido guardado bajo nombres de materias antiguos antes de
    // leerlo; si algo no tiene equivalente en las 5 oficiales, se avisa aquí.
    const [materiasSinEquivalente, setMateriasSinEquivalente] = useState(
        () => migrarMateriasAntiguas().sinEquivalente
    );
    const [archivosPorMateria, setArchivosPorMateria] = useState(() => {
        try {
            const guardado = localStorage.getItem('edu_archivosMateria');
            return guardado ? JSON.parse(guardado) : {};
        } catch {
            return {};
        }
    });
    const [archivoPreview, setArchivoPreview] = useState(null);

    const materias = NOMBRES_MATERIAS;

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

    const handleUploadMateria = async (materia, file, { isPrivate = false } = {}) => {
        const kind = getKind(file.name);
        const archivo = {
            id: `${Date.now()}-${file.name}`,
            name: file.name,
            sizeLabel: formatSize(file.size),
            kind,
            isPrivate,
            pageCount: null,
            thumbnail: null,
            dataUrl: null
        };

        // Guardamos el archivo original (dataURL) para permitir su descarga, y
        // para PDFs obtenemos además páginas y miniatura reales antes de persistir.
        try {
            archivo.dataUrl = await leerComoDataUrl(file);
        } catch {
            // Sin dataURL no habrá descarga, pero el resto del flujo continúa.
        }
        if (kind === "pdf") {
            try {
                const { pageCount, thumbnail } = await procesarPdf(file);
                archivo.pageCount = pageCount;
                archivo.thumbnail = thumbnail;
            } catch {
                // Si el procesamiento falla, se guarda el archivo sin metadatos extra.
            }
        }

        setArchivosPorMateria((prev) => persistirArchivos({
            ...prev,
            [materia]: [...(prev[materia] || []), archivo]
        }));
    };

    const handleEliminarArchivo = (materia, id) => {
        setArchivosPorMateria((prev) => persistirArchivos({
            ...prev,
            [materia]: (prev[materia] || []).filter((a) => a.id !== id)
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
                        <ListItem disablePadding>
                            <ListItemButton className="nav-item" onClick={() => setPagina("asistente")}>
                                <ListItemIcon className="nav-icon">
                                <AutoAwesomeRoundedIcon sx={{ fontSize: "1.3rem" }} />
                            </ListItemIcon>
                            <ListItemText primary="Asistente IA" />
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

                {/* Aviso de migración: material de materias que ya no existen
                    en el catálogo oficial (se conserva, pero no se muestra). */}
                {materiasSinEquivalente.length > 0 && (
                    <div className="aviso-migracion" role="alert">
                        <p>
                            Hay material guardado de materias que ya no están en el catálogo
                            ({materiasSinEquivalente.join(', ')}). No se ha borrado, pero no se
                            mostrará: vuelve a subirlo en una de las 5 materias oficiales.
                        </p>
                        <button onClick={() => setMateriasSinEquivalente([])}>Entendido</button>
                    </div>
                )}

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
                            onClick={() => { setMateriaSeleccionada(null); setArchivoPreview(null); setSubVistaMateria('recursos'); }}
                        >
                            ← Volver
                        </button>

                        <h1 style={{pointerEvents:"none"}}>{materiaSeleccionada}</h1>

                        <WidgetsRendimiento
                            materia={materiaSeleccionada}
                            topEstudiantes={ranking}
                            progreso={68}
                            siguientePaso={
                                (archivosPorMateria[materiaSeleccionada] || []).length > 0
                                    ? { descripcion: "Ya tienes material cargado. Pon a prueba a tus estudiantes generando un quiz.", label: "Ir al Quiz", destino: "quiz" }
                                    : { descripcion: "Aún no hay material en esta materia. Súbelo desde los contenedores y luego genera un quiz.", label: "Generar Quiz", destino: "quiz" }
                            }
                            onAccion={(destino) => setSubVistaMateria(destino)}
                        />

                        {/* Área de archivos siempre visible, dividida por audiencia */}
                        <div className="materia-archivos-grid">
                            <MaterialContenedor
                                titulo="Material para Estudiantes"
                                subtitulo="Visible para toda la clase"
                                Icon={GroupsRoundedIcon}
                                vacioMsg="Aún no has publicado material para los estudiantes."
                                archivos={(archivosPorMateria[materiaSeleccionada] || []).filter((a) => !a.isPrivate)}
                                isPrivate={false}
                                onUpload={(file, opts) => handleUploadMateria(materiaSeleccionada, file, opts)}
                                onPreview={setArchivoPreview}
                            />
                            <MaterialContenedor
                                titulo="Material Exclusivo del Docente"
                                subtitulo="Privado · solo tú puedes verlo"
                                Icon={LockRoundedIcon}
                                vacioMsg="No tienes material privado en esta materia."
                                archivos={(archivosPorMateria[materiaSeleccionada] || []).filter((a) => a.isPrivate)}
                                isPrivate={true}
                                onUpload={(file, opts) => handleUploadMateria(materiaSeleccionada, file, opts)}
                                onPreview={setArchivoPreview}
                            />
                        </div>

                        <div className="materia-panel">
                            <button
                                className={`opcion ${subVistaMateria === 'quiz' ? 'opcion-activa' : ''}`}
                                onClick={() => setSubVistaMateria('quiz')}
                            >
                                Generar Quiz
                            </button>
                            <button
                                className={`opcion ${subVistaMateria === 'clasificador' ? 'opcion-activa' : ''}`}
                                onClick={() => setSubVistaMateria('clasificador')}
                            >
                                Juego Clasificador
                            </button>
                            <button
                                className={`opcion ${subVistaMateria === 'calificaciones' ? 'opcion-activa' : ''}`}
                                onClick={() => setSubVistaMateria('calificaciones')}
                            >
                                Libro de Calificaciones
                            </button>
                        </div>

                        {subVistaMateria === 'quiz' && (
                            <GeneradorQuiz materia={materiaSeleccionada} />
                        )}

                        {subVistaMateria === 'clasificador' && (
                            <EditorClasificador materia={materiaSeleccionada} />
                        )}

                        {subVistaMateria === 'calificaciones' && (
                            <section className="card materia-subvista">
                                <h3>Libro de Calificaciones de {materiaSeleccionada}</h3>
                            </section>
                        )}
                    </>
                )}

                {/* ASISTENTE IA */}
                {pagina === "asistente" && (
                    <AsistenteIA />
                )}

            </main>
            </div>

            <FilePreviewModal
                archivo={archivoPreview}
                onClose={() => setArchivoPreview(null)}
                onDownload={descargarArchivo}
                onDelete={(a) => handleEliminarArchivo(materiaSeleccionada, a.id)}
            />
        </div>
    );
}
