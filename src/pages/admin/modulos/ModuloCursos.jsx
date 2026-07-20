// Módulo Cursos del panel admin (SPEC-002): catálogo de cursos y paralelos.
// Los docentes eligen de aquí el curso al generar invitaciones.
import { useState } from 'react';
import Diversity3RoundedIcon from '@mui/icons-material/Diversity3Rounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import adminService from '../../../services/adminService';
import { SectionCard, EmptyState, ModalPanel, TablaPro } from '../../../components/dashboard/DashboardWidgets';
import { useConfirmacion } from '../../../hooks/useConfirmacion';

const FORM_VACIO = { nombre: '', paralelo: '', nivel: '', activo: true };

export function ModuloCursos({ cursos, ejecutar }) {
    const { pedirConfirmacion, dialogoConfirmacion } = useConfirmacion();
    // `editando`: null = cerrado, 'nuevo' = crear, objeto = editar existente.
    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState(FORM_VACIO);

    const abrirNuevo = () => {
        setForm(FORM_VACIO);
        setEditando('nuevo');
    };

    const abrirEdicion = (c) => {
        setForm({ nombre: c.nombre, paralelo: c.paralelo, nivel: c.nivel || '', activo: Boolean(c.activo) });
        setEditando(c);
    };

    const guardar = () => {
        const esNuevo = editando === 'nuevo';
        const etiqueta = `${form.nombre} ${form.paralelo}`.trim();
        ejecutar(async () => {
            if (esNuevo) await adminService.crearCurso(form);
            else await adminService.actualizarCurso(editando.id, form);
            setEditando(null);
        }, esNuevo ? `Curso "${etiqueta}" creado.` : `Curso "${etiqueta}" actualizado.`);
    };

    const alternarEstado = (c) => {
        const activar = !c.activo;
        ejecutar(
            () => adminService.actualizarCurso(c.id, { nombre: c.nombre, paralelo: c.paralelo, nivel: c.nivel, activo: activar }),
            `Curso "${c.etiqueta}" ${activar ? 'activado' : 'desactivado'}.`
        );
    };

    const eliminar = (c) => {
        pedirConfirmacion({
            titulo: 'Eliminar curso',
            mensaje: `¿Eliminar el curso "${c.etiqueta}"? Solo es posible si no tiene estudiantes.`,
            confirmarTexto: 'Eliminar',
            variante: 'danger',
            accion: () => ejecutar(() => adminService.eliminarCurso(c.id), `Curso "${c.etiqueta}" eliminado.`)
        });
    };

    return (
        <>
            {dialogoConfirmacion}
            <SectionCard
                titulo="Cursos y paralelos"
                Icon={Diversity3RoundedIcon}
                tag={cursos.length ? `${cursos.length}` : undefined}
                accion={{ label: '+ Nuevo curso', onClick: abrirNuevo }}
            >
                {cursos.length ? (
                    <TablaPro
                        filas={cursos}
                        buscar={(c) => `${c.etiqueta} ${c.nivel || ''}`}
                        placeholderBusqueda="Buscar por curso o nivel…"
                        cabecera={<tr><th>Curso</th><th>Nivel</th><th>Estado</th><th>Estudiantes</th><th>Docentes</th><th>Acciones</th></tr>}
                        renderFila={(c) => (
                                    <tr key={c.id}>
                                        <td><span className="curso-chip">{c.etiqueta}</span></td>
                                        <td>{c.nivel || '—'}</td>
                                        <td>
                                            <span className={`curso-estado ${c.activo ? 'is-activo' : ''}`}>
                                                {c.activo ? 'Activo' : 'Desactivado'}
                                            </span>
                                        </td>
                                        <td className="xp-valor">{c.estudiantes}</td>
                                        <td className="xp-valor">{c.docentes}</td>
                                        <td>
                                            <div className="admin-acciones">
                                                <button
                                                    type="button"
                                                    title="Editar curso"
                                                    aria-label={`Editar el curso ${c.etiqueta}`}
                                                    onClick={() => abrirEdicion(c)}
                                                >
                                                    <EditRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                                </button>
                                                <button type="button" onClick={() => alternarEstado(c)}>
                                                    {c.activo ? 'Desactivar' : 'Activar'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="accion-peligro"
                                                    title="Eliminar curso"
                                                    aria-label={`Eliminar el curso ${c.etiqueta}`}
                                                    onClick={() => eliminar(c)}
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
                        Icon={Diversity3RoundedIcon}
                        titulo="Sin cursos registrados"
                        mensaje="Crea los cursos de la institución (ej: 2do A). Luego asígnalos a cada docente desde su ficha (Docentes → Editar asignaciones)."
                        accion={{ label: 'Crear curso', onClick: abrirNuevo }}
                    />
                )}
            </SectionCard>

            {editando !== null && (
                <ModalPanel
                    className="modal-materias"
                    titulo={editando === 'nuevo' ? 'Nuevo curso' : 'Editar curso'}
                    subtitulo={editando === 'nuevo' ? 'Luego asígnalo a los docentes desde su ficha' : editando.etiqueta}
                    onCerrar={() => setEditando(null)}
                    pie={
                        <>
                            <button type="button" className="preview-action" onClick={() => setEditando(null)}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="preview-action preview-action-primary"
                                disabled={!form.nombre.trim() || !form.paralelo.trim()}
                                onClick={guardar}
                            >
                                <TaskAltRoundedIcon />
                                Guardar
                            </button>
                        </>
                    }
                >
                    <div className="materia-form">
                        <div className="curso-form-campos">
                            <label className="asistente-campo">
                                <span>Curso</span>
                                <input
                                    value={form.nombre}
                                    placeholder="ej: 2do"
                                    maxLength={20}
                                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                                />
                            </label>
                            <label className="asistente-campo">
                                <span>Paralelo</span>
                                <input
                                    value={form.paralelo}
                                    placeholder="ej: A"
                                    maxLength={5}
                                    onChange={(e) => setForm({ ...form, paralelo: e.target.value.toUpperCase() })}
                                />
                            </label>
                        </div>
                        <label className="asistente-campo">
                            <span>Nivel (opcional)</span>
                            <input
                                value={form.nivel}
                                placeholder="ej: Básica elemental"
                                maxLength={30}
                                onChange={(e) => setForm({ ...form, nivel: e.target.value })}
                            />
                        </label>
                        {editando !== 'nuevo' && (
                            <label className="materia-form-switch">
                                <input
                                    type="checkbox"
                                    checked={form.activo}
                                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                                />
                                Curso activo (se puede asignar a docentes y generar invitaciones)
                            </label>
                        )}
                    </div>
                </ModalPanel>
            )}
        </>
    );
}

export default ModuloCursos;
