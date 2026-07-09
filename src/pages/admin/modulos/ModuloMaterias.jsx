// Módulo Materias del panel admin (SPEC-002): catálogo dinámico.
// Crear, editar, activar/desactivar y eliminar materias sin tocar código.
import { useState } from 'react';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import adminService from '../../../services/adminService';
import { oscurecerColor } from '../../../services/materiasService';
import { SectionCard, EmptyState, ModalPanel } from '../../../components/dashboard/DashboardWidgets';

// Paleta pastel sugerida (misma familia que los "mundos" del estudiante).
const COLORES_SUGERIDOS = ['#e0f2fe', '#fce7f3', '#dcfce7', '#fef3c7', '#ede9fe', '#ffe4e6', '#ccfbf1', '#fef9c3'];
const ICONOS_SUGERIDOS = ['🔢', '📖', '🌱', '🌎', '⚽', '🗣️', '🎨', '🎵', '💻', '🧪', '📐', '✍️'];

const FORM_VACIO = { nombre: '', color: COLORES_SUGERIDOS[0], icono: ICONOS_SUGERIDOS[0], activa: true };

export function ModuloMaterias({ materias, ejecutar }) {
    // `editando`: null = cerrado, 'nueva' = crear, objeto = editar existente.
    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState(FORM_VACIO);

    const abrirNueva = () => {
        setForm(FORM_VACIO);
        setEditando('nueva');
    };

    const abrirEdicion = (m) => {
        setForm({ nombre: m.nombre, color: m.color, icono: m.icono, activa: Boolean(m.activa) });
        setEditando(m);
    };

    const guardar = () => {
        const esNueva = editando === 'nueva';
        ejecutar(async () => {
            if (esNueva) await adminService.crearMateria(form);
            else await adminService.actualizarMateria(editando.id, form);
            setEditando(null);
        }, esNueva ? `Materia "${form.nombre}" creada.` : `Materia "${form.nombre}" actualizada.`);
    };

    const alternarEstado = (m) => {
        const activar = !m.activa;
        ejecutar(
            () => adminService.actualizarMateria(m.id, { nombre: m.nombre, color: m.color, icono: m.icono, activa: activar }),
            `Materia "${m.nombre}" ${activar ? 'activada' : 'desactivada'}.`
        );
    };

    const eliminar = (m) => {
        if (window.confirm(`¿Eliminar la materia "${m.nombre}"? Solo es posible si no tiene contenido ni docentes.`)) {
            ejecutar(() => adminService.eliminarMateria(m.id), `Materia "${m.nombre}" eliminada.`);
        }
    };

    return (
        <>
            <SectionCard
                titulo="Catálogo de materias"
                Icon={MenuBookRoundedIcon}
                tag={materias.length ? `${materias.length}` : undefined}
                accion={{ label: '+ Nueva materia', onClick: abrirNueva }}
            >
                {materias.length ? (
                    <div className="materia-admin-grid">
                        {materias.map((m) => (
                            <div
                                key={m.id}
                                className={`materia-admin-card ${m.activa ? '' : 'is-inactiva'}`}
                                style={{ background: m.color, borderColor: oscurecerColor(m.color) }}
                            >
                                <span className="materia-admin-icono" aria-hidden="true">{m.icono}</span>
                                <strong className="materia-admin-nombre">{m.nombre}</strong>
                                <span className={`materia-admin-estado ${m.activa ? 'is-activa' : ''}`}>
                                    {m.activa ? 'Activa' : 'Desactivada'}
                                </span>
                                <div className="materia-admin-acciones">
                                    <button type="button" className="docente-btn-editar" onClick={() => abrirEdicion(m)}>
                                        <EditRoundedIcon sx={{ fontSize: '1rem' }} />
                                        Editar
                                    </button>
                                    <button
                                        type="button"
                                        className="docente-btn-editar"
                                        onClick={() => alternarEstado(m)}
                                    >
                                        {m.activa ? 'Desactivar' : 'Activar'}
                                    </button>
                                    <button
                                        type="button"
                                        className="docente-btn-eliminar"
                                        title="Eliminar materia"
                                        aria-label={`Eliminar la materia ${m.nombre}`}
                                        onClick={() => eliminar(m)}
                                    >
                                        <DeleteOutlineRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        Icon={MenuBookRoundedIcon}
                        titulo="Sin materias en el catálogo"
                        mensaje="Crea la primera materia: los docentes y estudiantes la verán al instante."
                        accion={{ label: 'Crear materia', onClick: abrirNueva }}
                    />
                )}
            </SectionCard>

            {editando !== null && (
                <ModalPanel
                    className="modal-materias"
                    titulo={editando === 'nueva' ? 'Nueva materia' : 'Editar materia'}
                    subtitulo={editando === 'nueva' ? 'Se mostrará a docentes y estudiantes' : editando.nombre}
                    avatar={
                        <span
                            className="materia-form-preview"
                            style={{ background: form.color, borderColor: oscurecerColor(form.color) }}
                            aria-hidden="true"
                        >
                            {form.icono}
                        </span>
                    }
                    onCerrar={() => setEditando(null)}
                    pie={
                        <>
                            <button type="button" className="preview-action" onClick={() => setEditando(null)}>
                                Cancelar
                            </button>
                            <button type="button" className="preview-action preview-action-primary" onClick={guardar}>
                                <TaskAltRoundedIcon />
                                Guardar
                            </button>
                        </>
                    }
                >
                    <div className="materia-form">
                        <label className="asistente-campo">
                            <span>Nombre de la materia</span>
                            <input
                                value={form.nombre}
                                placeholder="ej: Inglés"
                                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                            />
                        </label>

                        <div className="asistente-campo">
                            <span>Icono</span>
                            <div className="materia-form-opciones">
                                {ICONOS_SUGERIDOS.map((icono) => (
                                    <button
                                        type="button"
                                        key={icono}
                                        className={`materia-form-icono ${form.icono === icono ? 'is-sel' : ''}`}
                                        aria-pressed={form.icono === icono}
                                        onClick={() => setForm({ ...form, icono })}
                                    >
                                        {icono}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="asistente-campo">
                            <span>Color</span>
                            <div className="materia-form-opciones">
                                {COLORES_SUGERIDOS.map((color) => (
                                    <button
                                        type="button"
                                        key={color}
                                        className={`materia-form-color ${form.color === color ? 'is-sel' : ''}`}
                                        style={{ background: color }}
                                        aria-label={`Color ${color}`}
                                        aria-pressed={form.color === color}
                                        onClick={() => setForm({ ...form, color })}
                                    />
                                ))}
                            </div>
                        </div>

                        {editando !== 'nueva' && (
                            <label className="materia-form-switch">
                                <input
                                    type="checkbox"
                                    checked={form.activa}
                                    onChange={(e) => setForm({ ...form, activa: e.target.checked })}
                                />
                                Materia activa (visible para docentes y estudiantes)
                            </label>
                        )}
                    </div>
                </ModalPanel>
            )}
        </>
    );
}

export default ModuloMaterias;
