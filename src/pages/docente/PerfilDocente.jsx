// Perfil del docente (SPEC-004): identidad (foto, nombre, usuario,
// institución, materias, fecha de alta), estadísticas reales (misma fuente
// que el Home), reconocimientos (sección preparada, sin reglas inventadas) y
// su actividad reciente. Editable: foto, nombre visible y contraseña.
import { useEffect, useRef, useState } from 'react';
import BadgeRoundedIcon from '@mui/icons-material/BadgeRounded';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded';
import MapRoundedIcon from '@mui/icons-material/MapRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import PercentRoundedIcon from '@mui/icons-material/PercentRounded';
import docenteService from '../../services/docenteService';
import { getInstitucionCache } from '../../services/institucionService';
import {
    SectionCard, StatCard, EmptyState, formatearFecha
} from '../../components/dashboard/DashboardWidgets';

// Reduce la foto a un cuadrado de 256px como data URL (mismo enfoque en
// canvas que el logo institucional) para no engordar la BD.
const procesarFoto = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
        const lado = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        canvas.getContext('2d').drawImage(
            img,
            (img.width - lado) / 2, (img.height - lado) / 2, lado, lado,
            0, 0, 256, 256
        );
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
});

export function PerfilDocente({ stats, materias, onAviso, onError }) {
    const [perfil, setPerfil] = useState(null);
    const [nombre, setNombre] = useState('');
    const [passActual, setPassActual] = useState('');
    const [passNueva, setPassNueva] = useState('');
    const [guardando, setGuardando] = useState(false);
    const fotoRef = useRef(null);

    const cargar = () => docenteService.miPerfil()
        .then((p) => { setPerfil(p); setNombre(p.nombre_completo || ''); })
        .catch((err) => onError?.(`No se pudo cargar tu perfil: ${err.message}`));

    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
    useEffect(() => { cargar(); }, []);

    const ejecutar = async (accion, mensajeOk) => {
        setGuardando(true);
        try {
            await accion();
            onAviso?.(mensajeOk);
            await cargar();
        } catch (err) {
            onError?.(err.message);
        } finally {
            setGuardando(false);
        }
    };

    const subirFoto = async (ev) => {
        const file = ev.target.files?.[0];
        if (fotoRef.current) fotoRef.current.value = '';
        if (!file) return;
        try {
            const foto = await procesarFoto(file);
            await ejecutar(() => docenteService.actualizarPerfil({ foto_data: foto }), 'Foto de perfil actualizada.');
        } catch (err) {
            onError?.(err.message);
        }
    };

    const guardarNombre = (ev) => {
        ev.preventDefault();
        ejecutar(() => docenteService.actualizarPerfil({ nombre_completo: nombre }), 'Nombre visible actualizado.');
    };

    const cambiarPassword = (ev) => {
        ev.preventDefault();
        ejecutar(async () => {
            const r = await docenteService.cambiarPassword(passActual, passNueva);
            setPassActual('');
            setPassNueva('');
            return r;
        }, 'Contraseña actualizada. Úsala desde tu próximo ingreso.');
    };

    if (!perfil) return null;
    const institucion = getInstitucionCache()?.nombre;

    return (
        <div className="perfil-grid">
            {/* Columna izquierda: identidad + edición */}
            <div className="dash-secciones">
                <SectionCard titulo="Mi identidad" Icon={BadgeRoundedIcon}>
                    <div className="perfil-identidad">
                        <span className="perfil-foto" aria-hidden="true">
                            {perfil.foto_data
                                ? <img src={perfil.foto_data} alt="" />
                                : (perfil.nombre_completo || perfil.username).charAt(0).toUpperCase()}
                        </span>
                        <h2>{perfil.nombre_completo || perfil.username}</h2>
                        <span className="perfil-usuario">@{perfil.username} · Docente</span>
                        <button type="button" className="upload-mini-btn" onClick={() => fotoRef.current?.click()} disabled={guardando}>
                            Cambiar foto
                        </button>
                        <input ref={fotoRef} type="file" accept="image/*" hidden onChange={subirFoto} />

                        <div className="perfil-datos">
                            {institucion && (
                                <div className="perfil-dato"><span>Institución</span><span>{institucion}</span></div>
                            )}
                            <div className="perfil-dato">
                                <span>Materias</span>
                                <span>{materias.length ? materias.join(', ') : 'Sin asignar'}</span>
                            </div>
                            <div className="perfil-dato">
                                <span>Cuenta creada</span>
                                <span>{new Date(perfil.creado_en).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard titulo="Editar mi perfil" Icon={TaskAltRoundedIcon}>
                    <form className="perfil-form" onSubmit={guardarNombre}>
                        <label>
                            Nombre visible
                            <input
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                                placeholder="Ej: Prof. María Sánchez"
                                maxLength={120}
                            />
                        </label>
                        <div className="perfil-form-acciones">
                            <button type="submit" className="upload-mini-btn" disabled={guardando || !nombre.trim()}>
                                Guardar nombre
                            </button>
                        </div>
                    </form>
                    <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '14px 0' }} />
                    <form className="perfil-form" onSubmit={cambiarPassword}>
                        <label>
                            Contraseña actual
                            <input
                                type="password"
                                value={passActual}
                                onChange={(e) => setPassActual(e.target.value)}
                                autoComplete="current-password"
                            />
                        </label>
                        <label>
                            Nueva contraseña (mínimo 8 caracteres)
                            <input
                                type="password"
                                value={passNueva}
                                onChange={(e) => setPassNueva(e.target.value)}
                                autoComplete="new-password"
                            />
                        </label>
                        <div className="perfil-form-acciones">
                            <button
                                type="submit"
                                className="upload-mini-btn"
                                disabled={guardando || !passActual || passNueva.length < 8}
                            >
                                Cambiar contraseña
                            </button>
                        </div>
                    </form>
                </SectionCard>
            </div>

            {/* Columna derecha: estadísticas, reconocimientos y actividad */}
            <div className="dash-secciones">
                <SectionCard titulo="Mis estadísticas" Icon={QueryStatsRoundedIcon}>
                    {stats ? (
                        <div className="stats-row" style={{ marginBottom: 0 }}>
                            <StatCard Icon={TaskAltRoundedIcon} valor={stats.actividades} etiqueta="Actividades creadas" tono="primary" />
                            <StatCard Icon={AutoAwesomeRoundedIcon} valor={stats.quizzes} etiqueta="Quizzes" tono="accent" />
                            <StatCard Icon={MapRoundedIcon} valor={stats.misiones} etiqueta="Misiones" tono="primary" />
                            <StatCard Icon={ExtensionRoundedIcon} valor={stats.clasificadores} etiqueta="Clasificadores" tono="accent" />
                            <StatCard Icon={DescriptionRoundedIcon} valor={stats.materiales} etiqueta="Materiales" tono="primary" />
                            <StatCard Icon={GroupsRoundedIcon} valor={stats.estudiantes} etiqueta="Estudiantes" tono="accent" />
                            <StatCard Icon={StarRoundedIcon} valor={stats.xp_entregada} etiqueta="XP generada" tono="fire" />
                            <StatCard
                                Icon={PercentRoundedIcon}
                                valor={stats.promedio === null ? '—' : `${stats.promedio}%`}
                                etiqueta="Promedio obtenido"
                                tono="primary"
                            />
                        </div>
                    ) : (
                        <EmptyState
                            Icon={QueryStatsRoundedIcon}
                            titulo="Sin estadísticas todavía"
                            mensaje="Cuando crees actividades y tus estudiantes las resuelvan, tus números aparecerán aquí."
                        />
                    )}
                </SectionCard>

                <SectionCard titulo="Reconocimientos" Icon={WorkspacePremiumRoundedIcon}>
                    <EmptyState
                        Icon={WorkspacePremiumRoundedIcon}
                        titulo="Aún no hay medallas para docentes"
                        mensaje="Este espacio ya está preparado: cuando la institución active los reconocimientos docentes, tus medallas aparecerán aquí."
                    />
                </SectionCard>

                <SectionCard
                    titulo="Mi actividad reciente"
                    Icon={HistoryRoundedIcon}
                    tag={perfil.actividad.length ? `${perfil.actividad.length}` : undefined}
                >
                    {perfil.actividad.length ? (
                        <ul className="actividad-lista">
                            {perfil.actividad.map((ev) => (
                                <li key={ev.id} className="actividad-item">
                                    <span className="actividad-icono"><HistoryRoundedIcon /></span>
                                    <div className="actividad-meta">
                                        <strong>{ev.descripcion}</strong>
                                        {ev.materia && <span>{ev.materia}</span>}
                                    </div>
                                    <span className="actividad-fecha">{formatearFecha(ev.creado_en)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <EmptyState
                            Icon={HistoryRoundedIcon}
                            titulo="Sin actividad registrada"
                            mensaje="Tus publicaciones, ediciones y materiales quedarán registrados aquí."
                        />
                    )}
                </SectionCard>
            </div>
        </div>
    );
}

export default PerfilDocente;
