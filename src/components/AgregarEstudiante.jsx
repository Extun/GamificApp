import { useState } from 'react';
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { ModalPanel } from './dashboard/DashboardWidgets';
import estudiantesService from '../services/estudiantesService';
import './importarEstudiantes.css';

// SPEC-014 — Alta manual de UN estudiante: la versión individual de la
// importación por Excel (mismo endpoint de validación y creación en el
// servidor, mismo resultado: pendiente + código de activación individual).
// Dos pasos: formulario → código en claro, que se ve UNA sola vez.
export function AgregarEstudiante({ cursos, onCerrar, onCreado }) {
    const [nombres, setNombres] = useState('');
    const [apellidos, setApellidos] = useState('');
    const [fecha, setFecha] = useState('');
    const [cursoId, setCursoId] = useState(cursos.length === 1 ? String(cursos[0].id) : '');
    const [creado, setCreado] = useState(null);
    const [error, setError] = useState('');
    const [guardando, setGuardando] = useState(false);

    const completo = nombres.trim() && apellidos.trim() && fecha && cursoId;

    const guardar = async (e) => {
        e.preventDefault();
        if (guardando || !completo) return;
        setError('');
        setGuardando(true);
        try {
            const data = await estudiantesService.crearEstudiante(Number(cursoId), {
                nombres: nombres.trim(),
                apellidos: apellidos.trim(),
                fecha_nacimiento: fecha
            });
            setCreado(data);
            onCreado?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <ModalPanel
            titulo={creado ? 'Estudiante registrado' : 'Añadir estudiante'}
            subtitulo={creado ? creado.nombre : 'Se creará con su código de activación'}
            avatar={<span className="imp-avatar" aria-hidden="true"><PersonAddAlt1RoundedIcon /></span>}
            onCerrar={onCerrar}
            pie={creado ? (
                <button type="button" className="imp-btn-pri" onClick={onCerrar}>Ya lo anoté</button>
            ) : (
                <>
                    <button type="button" className="imp-btn-sec" onClick={onCerrar}>Cancelar</button>
                    <button
                        type="submit"
                        form="form-agregar-estudiante"
                        className="imp-btn-pri"
                        disabled={guardando || !completo}
                    >
                        {guardando ? 'Registrando…' : 'Registrar estudiante'}
                    </button>
                </>
            )}
        >
            {error && (
                <div className="imp-aviso imp-aviso-error" role="alert">
                    <ErrorOutlineRoundedIcon /> <span>{error}</span>
                </div>
            )}

            {creado ? (
                <div className="imp-paso" style={{ textAlign: 'center' }}>
                    <p className="contenido-sub" style={{ margin: 0 }}>
                        Su código de activación es:
                    </p>
                    <code style={{ fontSize: '2rem', letterSpacing: '0.35em', fontWeight: 700 }}>
                        {creado.codigo_activacion}
                    </code>
                    <p className="imp-nota imp-nota-importante" style={{ justifyContent: 'center' }}>
                        <ErrorOutlineRoundedIcon sx={{ fontSize: '1rem' }} /> Anótalo o entrégaselo
                        ahora: no se puede volver a ver, solo regenerar.
                    </p>
                    <p className="imp-nota">
                        Con ese código entrará por primera vez (elige su curso, su nombre y lo
                        escribe). Después inicia sesión con su nombre y su PIN: <code>{creado.pin_inicial}</code>.
                    </p>
                </div>
            ) : (
                <form id="form-agregar-estudiante" className="imp-paso" onSubmit={guardar}>
                    <label className="imp-campo">
                        <span>Nombres</span>
                        <input type="text" value={nombres} maxLength={80} autoFocus
                            onChange={(e) => setNombres(e.target.value)} />
                    </label>
                    <label className="imp-campo">
                        <span>Apellidos</span>
                        <input type="text" value={apellidos} maxLength={80}
                            onChange={(e) => setApellidos(e.target.value)} />
                    </label>
                    <label className="imp-campo">
                        <span>Fecha de nacimiento</span>
                        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                    </label>
                    <label className="imp-campo">
                        <span>Curso</span>
                        <select value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
                            <option value="">Elige el curso…</option>
                            {cursos.map((c) => (
                                <option key={c.id} value={c.id}>{c.etiqueta}</option>
                            ))}
                        </select>
                    </label>
                    <p className="imp-nota">
                        Su PIN inicial será su fecha de nacimiento (DDMMAA). Podrá cambiarlo
                        después desde su perfil.
                    </p>
                </form>
            )}
        </ModalPanel>
    );
}

export default AgregarEstudiante;
