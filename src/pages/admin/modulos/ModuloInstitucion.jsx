// Módulo Institución del panel admin (SPEC-002): fila única de configuración
// (nombre, logo, colores, año lectivo). Los colores y el logo se aplican en
// vivo a toda la app vía institucionService.
import { useEffect, useState } from 'react';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import adminService from '../../../services/adminService';
import authService from '../../../services/authService';
import { obtenerInstitucion, aplicarInstitucion, getInstitucionCache } from '../../../services/institucionService';
import { SectionCard, ModalPanel } from '../../../components/dashboard/DashboardWidgets';

const FORM_VACIO = {
    nombre: '', ciudad: '', provincia: '', pais: '',
    logo_data: null, favicon_data: null,
    color_principal: '', color_secundario: '',
    anio_lectivo: '', xp_escala_max: 1000
};

// Redimensiona una imagen en canvas antes de subirla (nunca base64 gigante).
const redimensionar = (file, maxLado, calidad = 0.85) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        URL.revokeObjectURL(url);
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * escala));
        canvas.height = Math.max(1, Math.round(img.height * escala));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png', calidad));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
});

// Favicon cuadrado 64×64 generado desde el logo (centrado, fondo transparente).
const generarFavicon = (dataUrl) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const escala = Math.min(64 / img.width, 64 / img.height);
        const w = img.width * escala;
        const h = img.height * escala;
        canvas.getContext('2d').drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('No se pudo generar el favicon'));
    img.src = dataUrl;
});

export function ModuloInstitucion({ ejecutar }) {
    const [form, setForm] = useState(() => ({ ...FORM_VACIO, ...(getInstitucionCache() || {}) }));
    const [errorImagen, setErrorImagen] = useState('');

    // ---- Restablecer aplicación (SPEC-008): solo el Administrador Principal ----
    const [resetPaso, setResetPaso] = useState(0); // 0 cerrado · 1 advertencia · 2 confirmación textual
    const [resetTexto, setResetTexto] = useState('');
    const [resetCargando, setResetCargando] = useState(false);
    const [resetResultado, setResetResultado] = useState(null);
    const cerrarReset = () => { setResetPaso(0); setResetTexto(''); setResetResultado(null); };
    const confirmarReset = () => {
        if (resetTexto.trim() !== 'RESET') return;
        setResetCargando(true);
        ejecutar(async () => {
            const data = await adminService.restablecerAplicacion();
            setResetResultado(data);
            return data;
        }, 'Aplicación restablecida a una instalación nueva.').finally(() => setResetCargando(false));
    };

    useEffect(() => {
        let vigente = true;
        obtenerInstitucion()
            .then((inst) => { if (vigente && inst) setForm((f) => ({ ...f, ...inst })); })
            .catch(() => { /* sin red: se edita sobre la caché */ });
        return () => { vigente = false; };
    }, []);

    const campo = (clave) => ({
        value: form[clave] ?? '',
        onChange: (e) => setForm({ ...form, [clave]: e.target.value })
    });

    const subirLogo = async (file) => {
        if (!file) return;
        setErrorImagen('');
        if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
            setErrorImagen('Formato no permitido: usa png, jpg, webp o svg.');
            return;
        }
        try {
            const logo = await redimensionar(file, 512);
            const favicon = await generarFavicon(logo);
            setForm((f) => ({ ...f, logo_data: logo, favicon_data: favicon }));
        } catch (err) {
            setErrorImagen(err.message);
        }
    };

    const quitarLogo = () => setForm((f) => ({ ...f, logo_data: null, favicon_data: null }));

    const guardar = () => {
        ejecutar(async () => {
            await adminService.actualizarInstitucion(form);
            const inst = await obtenerInstitucion();
            aplicarInstitucion(inst);
        }, 'Configuración institucional guardada.');
    };

    return (
        <>
            <SectionCard titulo="Información de la institución" Icon={ApartmentRoundedIcon}>
                <div className="institucion-campos">
                    <label className="asistente-campo institucion-campo-ancho">
                        <span>Nombre oficial</span>
                        <input maxLength={160} placeholder="Nombre de la institución" {...campo('nombre')} />
                    </label>
                    <label className="asistente-campo">
                        <span>Ciudad</span>
                        <input maxLength={80} placeholder="Guayaquil" {...campo('ciudad')} />
                    </label>
                    <label className="asistente-campo">
                        <span>Provincia</span>
                        <input maxLength={80} placeholder="Guayas" {...campo('provincia')} />
                    </label>
                    <label className="asistente-campo">
                        <span>País</span>
                        <input maxLength={80} placeholder="Ecuador" {...campo('pais')} />
                    </label>
                </div>
            </SectionCard>

            <SectionCard titulo="Imagen institucional" Icon={ImageRoundedIcon}>
                <div className="institucion-logo-fila">
                    <div className="institucion-logo-preview" aria-hidden="true">
                        {form.logo_data
                            ? <img src={form.logo_data} alt="" />
                            : <ImageRoundedIcon sx={{ fontSize: '2rem', color: '#94a3b8' }} />}
                    </div>
                    <div className="institucion-logo-acciones">
                        <p>El logo aparece en la pantalla de ingreso. El favicon (icono de la pestaña) se genera solo a partir del logo.</p>
                        <div className="admin-acciones">
                            <label className="docente-btn-editar institucion-btn-subir">
                                Subir logo
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                    hidden
                                    onChange={(e) => { subirLogo(e.target.files?.[0]); e.target.value = ''; }}
                                />
                            </label>
                            {form.logo_data && (
                                <button type="button" className="docente-btn-editar" onClick={quitarLogo}>
                                    Quitar logo
                                </button>
                            )}
                        </div>
                        {errorImagen && <p className="institucion-error" role="alert">{errorImagen}</p>}
                    </div>
                </div>
            </SectionCard>

            <SectionCard titulo="Apariencia y año académico" Icon={PaletteRoundedIcon}>
                <div className="institucion-campos">
                    <label className="asistente-campo">
                        <span>Color principal</span>
                        <div className="institucion-color-fila">
                            <input
                                type="color"
                                value={form.color_principal || '#0f766e'}
                                onChange={(e) => setForm({ ...form, color_principal: e.target.value })}
                                aria-label="Color principal"
                            />
                            {form.color_principal && (
                                <button
                                    type="button"
                                    className="docente-btn-editar"
                                    onClick={() => setForm({ ...form, color_principal: '' })}
                                >
                                    Usar el color por defecto
                                </button>
                            )}
                        </div>
                    </label>
                    <label className="asistente-campo">
                        <span>Color secundario</span>
                        <div className="institucion-color-fila">
                            <input
                                type="color"
                                value={form.color_secundario || '#f59e0b'}
                                onChange={(e) => setForm({ ...form, color_secundario: e.target.value })}
                                aria-label="Color secundario"
                            />
                            {form.color_secundario && (
                                <button
                                    type="button"
                                    className="docente-btn-editar"
                                    onClick={() => setForm({ ...form, color_secundario: '' })}
                                >
                                    Usar el color por defecto
                                </button>
                            )}
                        </div>
                    </label>
                    <label className="asistente-campo">
                        <span>Año lectivo</span>
                        <input maxLength={20} placeholder="2026-2027" {...campo('anio_lectivo')} />
                    </label>
                    <label className="asistente-campo">
                        <span>Escala de XP (meta visual de la barra)</span>
                        <input
                            type="number"
                            min="100"
                            step="100"
                            value={form.xp_escala_max ?? 1000}
                            onChange={(e) => setForm({ ...form, xp_escala_max: Number(e.target.value) })}
                        />
                    </label>
                </div>
                <p className="institucion-nota">Los colores se aplican a toda la app (los tres paneles y el ingreso) al guardar.</p>
            </SectionCard>

            <div className="institucion-guardar">
                <button
                    type="button"
                    className="preview-action preview-action-primary"
                    disabled={!String(form.nombre || '').trim()}
                    onClick={guardar}
                >
                    <TaskAltRoundedIcon />
                    Guardar cambios
                </button>
            </div>

            {/* Zona peligrosa (SPEC-008): solo el Administrador Principal la ve.
                El servidor revalida el rol en cada petición, esto solo oculta. */}
            {authService.esPrincipal() && (
                <div className="institucion-zona-peligrosa">
                    <SectionCard titulo="Zona peligrosa" Icon={WarningRoundedIcon}>
                        <p className="institucion-nota">
                            Restablecer la aplicación borra estudiantes, docentes, cursos, materias, actividades,
                            material, progreso, XP, ranking, misiones y auditoría. Conserva únicamente tu cuenta
                            de Administrador Principal y la configuración institucional. Se genera un respaldo
                            antes de borrar, pero la acción no se puede deshacer desde la app.
                        </p>
                        <button
                            type="button"
                            className="preview-action institucion-btn-peligro"
                            onClick={() => setResetPaso(1)}
                        >
                            <WarningRoundedIcon />
                            Restablecer aplicación
                        </button>
                    </SectionCard>
                </div>
            )}

            {resetPaso === 1 && (
                <ModalPanel
                    titulo="¿Restablecer la aplicación?"
                    subtitulo="Esta acción borra casi todos los datos generados por usuarios."
                    onCerrar={cerrarReset}
                    pie={(
                        <>
                            <button type="button" className="docente-btn-editar" onClick={cerrarReset}>Cancelar</button>
                            <button type="button" className="institucion-btn-peligro" onClick={() => setResetPaso(2)}>
                                Entiendo, continuar
                            </button>
                        </>
                    )}
                >
                    <p>
                        Se eliminarán: estudiantes, docentes y administradores secundarios, cursos, materias,
                        actividades, biblioteca, material, progreso, XP, ranking, misiones y auditoría.
                    </p>
                    <p>Se conservan: tu cuenta de Administrador Principal y la configuración institucional.</p>
                    <p><strong>Se genera un respaldo antes de borrar, pero esta acción no tiene "deshacer" en la app.</strong></p>
                </ModalPanel>
            )}

            {resetPaso === 2 && (
                <ModalPanel
                    titulo="Confirmación final"
                    subtitulo='Escribe la palabra "RESET" para confirmar.'
                    onCerrar={cerrarReset}
                    pie={resetResultado ? (
                        <button type="button" className="preview-action preview-action-primary" onClick={cerrarReset}>
                            Cerrar
                        </button>
                    ) : (
                        <>
                            <button type="button" className="docente-btn-editar" onClick={cerrarReset} disabled={resetCargando}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="institucion-btn-peligro"
                                disabled={resetTexto.trim() !== 'RESET' || resetCargando}
                                onClick={confirmarReset}
                            >
                                {resetCargando ? 'Restableciendo…' : 'Restablecer definitivamente'}
                            </button>
                        </>
                    )}
                >
                    {resetResultado ? (
                        <>
                            <p>✅ Aplicación restablecida. Respaldo guardado como <code>{resetResultado.backup?.archivo}</code>.</p>
                            <p>Cierra sesión y vuelve a entrar para ver el panel limpio.</p>
                        </>
                    ) : (
                        <input
                            type="text"
                            value={resetTexto}
                            onChange={(e) => setResetTexto(e.target.value)}
                            placeholder="Escribe RESET"
                            autoFocus
                        />
                    )}
                </ModalPanel>
            )}
        </>
    );
}

export default ModuloInstitucion;
