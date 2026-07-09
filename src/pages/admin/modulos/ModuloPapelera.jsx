// Módulo Papelera (SPEC-003): los elementos eliminados del panel llegan aquí
// antes de desaparecer de verdad. Restaurar devuelve la fila exactamente como
// estaba (nunca se tocó); eliminar definitivamente aplica las validaciones de
// integridad en el servidor y pide confirmación explícita.
import { useState } from 'react';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import RestoreRoundedIcon from '@mui/icons-material/RestoreRounded';
import adminService from '../../../services/adminService';
import { SectionCard, EmptyState, TablaPro, formatearFecha } from '../../../components/dashboard/DashboardWidgets';

const PESTANAS = [
    { id: 'todos', label: 'Todos' },
    { id: 'docente', label: 'Docentes' },
    { id: 'estudiante', label: 'Estudiantes' },
    { id: 'curso', label: 'Cursos' },
    { id: 'materia', label: 'Materias' },
    { id: 'administrador', label: 'Administradores' }
];

const NOMBRE_TIPO = {
    docente: 'Docente',
    estudiante: 'Estudiante',
    administrador: 'Administrador',
    materia: 'Materia',
    curso: 'Curso'
};

export function ModuloPapelera({ elementos, ejecutar }) {
    const [pestana, setPestana] = useState('todos');

    const visibles = pestana === 'todos'
        ? elementos
        : elementos.filter((el) => el.tipo === pestana);

    const restaurar = (el) => {
        ejecutar(
            () => adminService.restaurarDePapelera(el.tipo, el.id),
            `${NOMBRE_TIPO[el.tipo]} "${el.nombre}" restaurado correctamente.`
        );
    };

    const purgar = (el) => {
        if (window.confirm(
            `¿Eliminar DEFINITIVAMENTE ${NOMBRE_TIPO[el.tipo].toLowerCase()} "${el.nombre}"?\n\nEsta acción no se puede deshacer.`
        )) {
            ejecutar(
                () => adminService.purgarDePapelera(el.tipo, el.id),
                `${NOMBRE_TIPO[el.tipo]} "${el.nombre}" eliminado definitivamente.`
            );
        }
    };

    return (
        <SectionCard
            titulo="Elementos eliminados"
            Icon={DeleteOutlineRoundedIcon}
            tag={elementos.length ? `${elementos.length}` : undefined}
        >
            <div className="papelera-tabs" role="tablist" aria-label="Filtrar la papelera por tipo">
                {PESTANAS.map((p) => {
                    const total = p.id === 'todos'
                        ? elementos.length
                        : elementos.filter((el) => el.tipo === p.id).length;
                    return (
                        <button
                            key={p.id}
                            type="button"
                            role="tab"
                            aria-selected={pestana === p.id}
                            className={`papelera-tab ${pestana === p.id ? 'is-activa' : ''}`}
                            onClick={() => setPestana(p.id)}
                        >
                            {p.label}{total ? ` (${total})` : ''}
                        </button>
                    );
                })}
            </div>

            {visibles.length ? (
                <TablaPro
                    filas={visibles}
                    buscar={(el) => `${el.nombre} ${NOMBRE_TIPO[el.tipo]} ${el.eliminado_por || ''}`}
                    placeholderBusqueda="Buscar por nombre, tipo o quién eliminó…"
                    cabecera={<tr><th>Nombre</th><th>Tipo</th><th>Eliminado</th><th>Quién eliminó</th><th>Acciones</th></tr>}
                    renderFila={(el) => (
                        <tr key={`${el.tipo}-${el.id}`}>
                            <td>
                                <div className="estudiante-celda">
                                    <span className="estudiante-avatar" aria-hidden="true">
                                        {el.nombre.charAt(0).toUpperCase()}
                                    </span>
                                    <span className="estudiante-nombre">{el.nombre}</span>
                                </div>
                            </td>
                            <td><span className={`papelera-tipo papelera-tipo-${el.tipo}`}>{NOMBRE_TIPO[el.tipo]}</span></td>
                            <td>{formatearFecha(el.eliminado_en)}</td>
                            <td>{el.eliminado_por || <span className="auditoria-nulo">No registrado</span>}</td>
                            <td>
                                <div className="admin-acciones papelera-acciones">
                                    <button
                                        type="button"
                                        className="papelera-btn-restaurar"
                                        title={`Restaurar ${el.nombre}`}
                                        onClick={() => restaurar(el)}
                                    >
                                        <RestoreRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                        Restaurar
                                    </button>
                                    <button
                                        type="button"
                                        className="accion-peligro"
                                        title={`Eliminar definitivamente ${el.nombre}`}
                                        aria-label={`Eliminar definitivamente ${el.nombre}`}
                                        onClick={() => purgar(el)}
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
                    Icon={DeleteOutlineRoundedIcon}
                    titulo={pestana === 'todos' ? 'La papelera está vacía' : `No hay ${PESTANAS.find((p) => p.id === pestana)?.label.toLowerCase()} en la papelera`}
                    mensaje="Cuando elimines docentes, estudiantes, cursos, materias o administradores, llegarán aquí y podrás restaurarlos o eliminarlos definitivamente."
                />
            )}
        </SectionCard>
    );
}

export default ModuloPapelera;
