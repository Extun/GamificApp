// Módulo Administradores (solo visible/usable por el Administrador Principal;
// el servidor lo revalida en cada ruta). Dos roles:
//   · Administrador Principal: todo el sistema (institución y administradores).
//   · Administrador: operación diaria (docentes, estudiantes, cursos, materias,
//     invitaciones) sin tocar la configuración institucional ni los admins.
// El backend garantiza que siempre quede al menos un Principal activo.
import { useState } from 'react';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import authService from '../../../services/authService';
import adminService from '../../../services/adminService';
import { SectionCard, EmptyState, ModalPanel, TablaPro, formatearFecha } from '../../../components/dashboard/DashboardWidgets';

// Permisos por administrador (SPEC-003), agrupados como en el sidebar.
// El Principal los tiene todos siempre; solo el Principal puede repartirlos
// (la UI lo oculta a los demás y el servidor lo revalida).
const GRUPOS_PERMISOS = [
    { nombre: 'Gestión Académica', claves: [['docentes', 'Docentes'], ['estudiantes', 'Estudiantes'], ['materias', 'Materias'], ['cursos', 'Cursos']] },
    { nombre: 'Gestión Institucional', claves: [['invitaciones', 'Invitaciones'], ['institucion', 'Institución']] },
    { nombre: 'Seguridad', claves: [['administradores', 'Administradores'], ['auditoria', 'Auditoría'], ['papelera', 'Papelera']] }
];
const PERMISOS_OPERATIVOS = ['docentes', 'estudiantes', 'materias', 'cursos', 'invitaciones'];

const FORM_VACIO = { username: '', password: '', es_principal: false, activo: true, permisos: PERMISOS_OPERATIVOS };

export function ModuloAdministradores({ administradores, ejecutar }) {
    // `editando`: null = cerrado, 'nuevo' = crear, objeto = editar existente.
    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState(FORM_VACIO);

    const yo = authService.getUsuario()?.id;
    const soyPrincipal = authService.esPrincipal();

    const abrirNuevo = () => {
        setForm(FORM_VACIO);
        setEditando('nuevo');
    };

    const abrirEdicion = (a) => {
        setForm({
            username: a.username,
            password: '',
            es_principal: Boolean(a.es_principal),
            activo: Boolean(a.activo),
            permisos: Array.isArray(a.permisos) ? a.permisos : PERMISOS_OPERATIVOS
        });
        setEditando(a);
    };

    const togglePermiso = (clave) =>
        setForm((prev) => ({
            ...prev,
            permisos: prev.permisos.includes(clave)
                ? prev.permisos.filter((p) => p !== clave)
                : [...prev.permisos, clave]
        }));

    const guardar = () => {
        const esNuevo = editando === 'nuevo';
        // Solo el Principal envía permisos/rol; el servidor lo revalida igual.
        const camposPrincipal = soyPrincipal
            ? { es_principal: form.es_principal, ...(form.es_principal ? {} : { permisos: form.permisos }) }
            : {};
        ejecutar(async () => {
            if (esNuevo) {
                await adminService.crearAdministrador({
                    username: form.username,
                    password: form.password,
                    ...camposPrincipal
                });
            } else {
                await adminService.actualizarAdministrador(editando.id, {
                    ...(form.password ? { password: form.password } : {}),
                    ...camposPrincipal,
                    activo: form.activo
                });
            }
            setEditando(null);
        }, esNuevo ? `Administrador "${form.username}" creado.` : `Administrador "${form.username}" actualizado.`);
    };

    const alternarEstado = (a) => {
        const activar = !a.activo;
        ejecutar(
            () => adminService.actualizarAdministrador(a.id, { activo: activar }),
            `Cuenta "${a.username}" ${activar ? 'activada' : 'desactivada'}.`
        );
    };

    const eliminar = (a) => {
        if (window.confirm(`¿Eliminar la cuenta de administrador "${a.username}"? Esta acción no se puede deshacer.`)) {
            ejecutar(() => adminService.eliminarAdministrador(a.id), `Administrador "${a.username}" eliminado.`);
        }
    };

    return (
        <>
            <SectionCard
                titulo="Cuentas de administrador"
                Icon={AdminPanelSettingsRoundedIcon}
                tag={administradores.length ? `${administradores.length}` : undefined}
                accion={{ label: '+ Nuevo administrador', onClick: abrirNuevo }}
            >
                {administradores.length ? (
                    <TablaPro
                        filas={administradores}
                        buscar={(a) => `${a.username} ${a.es_principal ? 'principal' : 'administrador'}`}
                        placeholderBusqueda="Buscar por usuario o rol…"
                        cabecera={<tr><th>Usuario</th><th>Rol</th><th>Permisos</th><th>Estado</th><th>Creado</th><th>Acciones</th></tr>}
                        renderFila={(a) => (
                            <tr key={a.id}>
                                <td>
                                    <div className="estudiante-celda">
                                        <span className="estudiante-avatar" aria-hidden="true">
                                            {a.username.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="estudiante-nombre">
                                            {a.username}
                                            {a.id === yo && <span className="admin-yo-chip"> (tú)</span>}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <span className={`rol-chip ${a.es_principal ? 'is-principal' : ''}`}>
                                        {a.es_principal ? 'Principal' : 'Administrador'}
                                    </span>
                                </td>
                                <td>
                                    <span className="permisos-resumen">
                                        {a.es_principal
                                            ? 'Todos'
                                            : `${(a.permisos || []).length} de 9`}
                                    </span>
                                </td>
                                <td>
                                    <span className={`curso-estado ${a.activo ? 'is-activo' : ''}`}>
                                        {a.activo ? 'Activo' : 'Desactivado'}
                                    </span>
                                </td>
                                <td>{a.creado_en ? formatearFecha(a.creado_en) : '—'}</td>
                                <td>
                                    <div className="admin-acciones">
                                        <button
                                            type="button"
                                            title="Editar administrador"
                                            aria-label={`Editar a ${a.username}`}
                                            onClick={() => abrirEdicion(a)}
                                        >
                                            <EditRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={a.id === yo}
                                            title={a.id === yo ? 'No puedes desactivar tu propia cuenta' : (a.activo ? 'Desactivar cuenta' : 'Activar cuenta')}
                                            onClick={() => alternarEstado(a)}
                                        >
                                            {a.activo ? 'Desactivar' : 'Activar'}
                                        </button>
                                        <button
                                            type="button"
                                            className="accion-peligro"
                                            disabled={a.id === yo}
                                            title={a.id === yo ? 'No puedes eliminar tu propia cuenta' : 'Eliminar administrador'}
                                            aria-label={`Eliminar a ${a.username}`}
                                            onClick={() => eliminar(a)}
                                        >
                                            <DeleteOutlineRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}
                    />
                ) : (
                    <EmptyState
                        Icon={AdminPanelSettingsRoundedIcon}
                        titulo="Sin administradores registrados"
                        mensaje="Crea cuentas de administrador para repartir la gestión diaria sin compartir tu contraseña."
                        accion={{ label: 'Crear administrador', onClick: abrirNuevo }}
                    />
                )}
            </SectionCard>

            {editando !== null && (
                <ModalPanel
                    className="modal-materias"
                    titulo={editando === 'nuevo' ? 'Nuevo administrador' : 'Editar administrador'}
                    subtitulo={editando === 'nuevo' ? 'Podrá gestionar la operación diaria de la institución' : editando.username}
                    onCerrar={() => setEditando(null)}
                    pie={
                        <>
                            <button type="button" className="preview-action" onClick={() => setEditando(null)}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="preview-action preview-action-primary"
                                disabled={
                                    editando === 'nuevo'
                                        ? !form.username.trim() || form.password.length < 8
                                        : Boolean(form.password) && form.password.length < 8
                                }
                                onClick={guardar}
                            >
                                <TaskAltRoundedIcon />
                                Guardar
                            </button>
                        </>
                    }
                >
                    <div className="materia-form">
                        {editando === 'nuevo' ? (
                            <label className="asistente-campo">
                                <span>Usuario</span>
                                <input
                                    value={form.username}
                                    placeholder="ej: subdireccion"
                                    autoComplete="off"
                                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                                />
                            </label>
                        ) : null}
                        <label className="asistente-campo">
                            <span>{editando === 'nuevo' ? 'Contraseña (mínimo 8 caracteres)' : 'Nueva contraseña (opcional, mínimo 8)'}</span>
                            <input
                                type="password"
                                value={form.password}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                            />
                        </label>

                        {soyPrincipal && (
                            <label className="materia-form-switch">
                                <input
                                    type="checkbox"
                                    checked={form.es_principal}
                                    onChange={(e) => setForm({ ...form, es_principal: e.target.checked })}
                                />
                                Administrador Principal (tiene TODOS los permisos, siempre)
                            </label>
                        )}

                        {/* Permisos por módulo (SPEC-003): solo el Principal
                            los reparte, y solo para cuentas no-Principal. */}
                        {soyPrincipal && !form.es_principal && (
                            <div className="permisos-editor">
                                <p className="modal-materias-ayuda" style={{ margin: '0 0 4px' }}>
                                    Marca las secciones del panel que esta cuenta podrá usar:
                                </p>
                                {GRUPOS_PERMISOS.map((grupo) => (
                                    <fieldset key={grupo.nombre} className="permisos-grupo">
                                        <legend>{grupo.nombre}</legend>
                                        <div className="permisos-lista">
                                            {grupo.claves.map(([clave, etiqueta]) => (
                                                <label key={clave} className="permiso-item">
                                                    <input
                                                        type="checkbox"
                                                        checked={form.permisos.includes(clave)}
                                                        onChange={() => togglePermiso(clave)}
                                                    />
                                                    {etiqueta}
                                                </label>
                                            ))}
                                        </div>
                                    </fieldset>
                                ))}
                            </div>
                        )}

                        {editando !== 'nuevo' && (
                            <label className="materia-form-switch">
                                <input
                                    type="checkbox"
                                    checked={form.activo}
                                    disabled={editando.id === yo}
                                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                                />
                                Cuenta activa (puede iniciar sesión)
                            </label>
                        )}

                        <p className="modal-materias-ayuda" style={{ margin: 0 }}>
                            Siempre debe quedar al menos un Administrador Principal activo: el sistema
                            no permitirá quitarle el rol, desactivar ni eliminar al último.
                        </p>
                    </div>
                </ModalPanel>
            )}
        </>
    );
}

export default ModuloAdministradores;
