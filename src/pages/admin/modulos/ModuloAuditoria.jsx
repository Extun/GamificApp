// Módulo Auditoría (SPEC-003): historial real de acciones registradas en la
// tabla `auditoria`. Dos tarjetas: actividad de docentes y de estudiantes
// (las acciones del propio panel admin también quedan registradas y se ven
// en el detalle del Inicio/Actividad reciente). Sin datos inventados: el
// modal "Más detalles" muestra solo lo realmente registrado y los campos
// ausentes se presentan como "No registrado".
import { useState } from 'react';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import { SectionCard, EmptyState, ModalPanel, TablaPro } from '../../../components/dashboard/DashboardWidgets';

// Fecha completa para auditoría ("3 jul, 14:25"): aquí sí importa la hora.
const formatearFechaHora = (valor) => {
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime())
        ? 'No registrado'
        : fecha.toLocaleDateString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const NO_REGISTRADO = <span className="auditoria-nulo">No registrado</span>;

// Traducción legible de las claves del detalle JSON.
const etiquetaCampo = (clave) => clave.replaceAll('_', ' ');

function TablaAuditoria({ eventos, onDetalles }) {
    return (
        <TablaPro
            filas={eventos}
            buscar={(ev) => `${ev.nombre} ${ev.descripcion} ${ev.materia || ''}`}
            placeholderBusqueda="Buscar por nombre, acción o materia…"
            cabecera={<tr><th>Quién</th><th>Acción</th><th>Materia</th><th>Fecha</th><th></th></tr>}
            renderFila={(ev) => (
                <tr key={ev.id}>
                    <td>
                        <div className="estudiante-celda">
                            <span className="estudiante-avatar" aria-hidden="true">
                                {ev.nombre.charAt(0).toUpperCase()}
                            </span>
                            <span className="estudiante-nombre">{ev.nombre}</span>
                        </div>
                    </td>
                    <td className="auditoria-descripcion">{ev.descripcion}</td>
                    <td>{ev.materia ? <span className="curso-chip">{ev.materia}</span> : NO_REGISTRADO}</td>
                    <td className="auditoria-fecha">{formatearFechaHora(ev.creado_en)}</td>
                    <td>
                        <button type="button" className="auditoria-btn-detalles" onClick={() => onDetalles(ev)}>
                            Más detalles
                        </button>
                    </td>
                </tr>
            )}
        />
    );
}

export function ModuloAuditoria({ eventos }) {
    const [detalle, setDetalle] = useState(null);

    const docentes = eventos.filter((ev) => ev.rol === 'docente');
    const estudiantes = eventos.filter((ev) => ev.rol === 'estudiante');
    const admins = eventos.filter((ev) => ev.rol === 'admin');

    // El detalle JSON viene ya parseado (mysql2) o como string: se normaliza.
    const detalleJson = (() => {
        if (!detalle?.detalle_json) return null;
        if (typeof detalle.detalle_json === 'string') {
            try { return JSON.parse(detalle.detalle_json); } catch { return null; }
        }
        return detalle.detalle_json;
    })();

    return (
        <>
            <SectionCard
                titulo="Actividad Docente"
                Icon={SchoolRoundedIcon}
                tag={docentes.length ? `${docentes.length}` : undefined}
            >
                {docentes.length ? (
                    <TablaAuditoria eventos={docentes} onDetalles={setDetalle} />
                ) : (
                    <EmptyState
                        Icon={SchoolRoundedIcon}
                        titulo="Sin actividad docente registrada"
                        mensaje="Cuando un docente publique actividades, suba material o genere invitaciones, sus acciones aparecerán aquí."
                    />
                )}
            </SectionCard>

            <SectionCard
                titulo="Actividad Estudiantes"
                Icon={GroupsRoundedIcon}
                tag={estudiantes.length ? `${estudiantes.length}` : undefined}
            >
                {estudiantes.length ? (
                    <TablaAuditoria eventos={estudiantes} onDetalles={setDetalle} />
                ) : (
                    <EmptyState
                        Icon={GroupsRoundedIcon}
                        titulo="Sin actividad de estudiantes registrada"
                        mensaje="Cuando los estudiantes inicien sesión, resuelvan actividades o cambien su PIN, quedará registrado aquí."
                    />
                )}
            </SectionCard>

            <SectionCard
                titulo="Actividad de Administradores"
                Icon={AdminPanelSettingsRoundedIcon}
                tag={admins.length ? `${admins.length}` : undefined}
            >
                {admins.length ? (
                    <TablaAuditoria eventos={admins} onDetalles={setDetalle} />
                ) : (
                    <EmptyState
                        Icon={AdminPanelSettingsRoundedIcon}
                        titulo="Sin acciones administrativas registradas"
                        mensaje="Las altas, ediciones, eliminaciones y restauraciones hechas desde este panel quedarán registradas aquí."
                    />
                )}
            </SectionCard>

            {detalle && (
                <ModalPanel
                    className="modal-materias"
                    titulo="Detalles del registro"
                    subtitulo={detalle.descripcion}
                    avatar={
                        <span className="estudiante-avatar" aria-hidden="true">
                            {detalle.nombre.charAt(0).toUpperCase()}
                        </span>
                    }
                    onCerrar={() => setDetalle(null)}
                    pie={
                        <button type="button" className="preview-action" onClick={() => setDetalle(null)}>
                            Cerrar
                        </button>
                    }
                >
                    <dl className="auditoria-detalle">
                        <div><dt>Quién</dt><dd>{detalle.nombre || NO_REGISTRADO}</dd></div>
                        <div><dt>Rol</dt><dd>{detalle.rol || NO_REGISTRADO}</dd></div>
                        <div><dt>Acción</dt><dd>{detalle.descripcion || NO_REGISTRADO}</dd></div>
                        <div><dt>Materia</dt><dd>{detalle.materia || NO_REGISTRADO}</dd></div>
                        <div><dt>Fecha y hora</dt><dd>{formatearFechaHora(detalle.creado_en)}</dd></div>
                        {detalleJson && Object.entries(detalleJson).map(([clave, valor]) => (
                            <div key={clave}>
                                <dt>{etiquetaCampo(clave)}</dt>
                                <dd>
                                    {valor === null || valor === undefined || valor === ''
                                        ? NO_REGISTRADO
                                        : Array.isArray(valor) ? valor.join(', ') : String(valor)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    {!detalleJson && (
                        <p className="modal-materias-ayuda">
                            Este registro no tiene información adicional guardada.
                        </p>
                    )}
                </ModalPanel>
            )}
        </>
    );
}

export default ModuloAuditoria;
