import { useState } from 'react';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import { ModalPanel } from './dashboard/DashboardWidgets';
import estudiantesService from '../services/estudiantesService';
import './importarEstudiantes.css';

// Fecha en formato del <input type="date"> (AAAA-MM-DD) desde lo que mande
// la API (Date serializada o string).
const fechaParaInput = (valor) => String(valor || '').slice(0, 10);

// SPEC-014 — Corrección de datos de un estudiante (nombres/apellidos y
// fecha de nacimiento). Un solo modal para los paneles de docente y admin:
// actualiza la ficha y el nombre con el que inicia sesión; XP, progreso y
// código de activación no cambian. Si el estudiante está PENDIENTE y se
// corrige la fecha, su PIN inicial se recalcula (el servidor lo informa).
// `estudiante` necesita usuario_id, nombre_completo, nombres, apellidos,
// fecha_nacimiento y pendiente.
export function EditarEstudiante({ estudiante, onCerrar, onGuardado }) {
    const [nombres, setNombres] = useState(estudiante.nombres || '');
    const [apellidos, setApellidos] = useState(estudiante.apellidos || '');
    const [fecha, setFecha] = useState(fechaParaInput(estudiante.fecha_nacimiento));
    const [error, setError] = useState('');
    const [guardando, setGuardando] = useState(false);

    const fechaCambia = fecha && fecha !== fechaParaInput(estudiante.fecha_nacimiento);

    const guardar = async (e) => {
        e.preventDefault();
        if (guardando) return;
        setError('');
        setGuardando(true);
        try {
            const data = await estudiantesService.editarEstudiante(estudiante.usuario_id, {
                nombres: nombres.trim(),
                apellidos: apellidos.trim(),
                fecha_nacimiento: fecha
            });
            onGuardado?.(data.mensaje);
            onCerrar();
        } catch (err) {
            setError(err.message);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <ModalPanel
            titulo="Editar estudiante"
            subtitulo={estudiante.nombre_completo}
            avatar={<span className="imp-avatar" aria-hidden="true"><EditRoundedIcon /></span>}
            onCerrar={onCerrar}
            pie={
                <>
                    <button type="button" className="imp-btn-sec" onClick={onCerrar}>Cancelar</button>
                    <button
                        type="submit"
                        form="form-editar-estudiante"
                        className="imp-btn-pri"
                        disabled={guardando || !nombres.trim() || !apellidos.trim()}
                    >
                        {guardando ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                </>
            }
        >
            <form id="form-editar-estudiante" className="imp-paso" onSubmit={guardar}>
                {error && (
                    <div className="imp-aviso imp-aviso-error" role="alert">
                        <span>{error}</span>
                    </div>
                )}
                <label className="imp-campo">
                    <span>Nombres</span>
                    <input
                        type="text"
                        value={nombres}
                        onChange={(e) => setNombres(e.target.value)}
                        maxLength={80}
                        autoFocus
                    />
                </label>
                <label className="imp-campo">
                    <span>Apellidos</span>
                    <input
                        type="text"
                        value={apellidos}
                        onChange={(e) => setApellidos(e.target.value)}
                        maxLength={80}
                    />
                </label>
                <label className="imp-campo">
                    <span>Fecha de nacimiento</span>
                    <input
                        type="date"
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                    />
                </label>
                {fechaCambia && (
                    <p className="imp-nota imp-nota-importante">
                        {estudiante.pendiente
                            ? 'Al corregir la fecha, su PIN inicial cambiará a la fecha nueva (DDMMAA). Si descargaste sus credenciales, el PIN de ese archivo dejará de valer; su código de activación sigue siendo el mismo.'
                            : 'Su PIN actual no cambia al corregir la fecha; solo se usará la fecha nueva si algún día le restableces el PIN.'}
                    </p>
                )}
                <p className="imp-nota">
                    Al guardar, el estudiante inicia sesión con su nombre nuevo y su PIN
                    de siempre. Su código de activación, XP y progreso no cambian.
                </p>
            </form>
        </ModalPanel>
    );
}

export default EditarEstudiante;
