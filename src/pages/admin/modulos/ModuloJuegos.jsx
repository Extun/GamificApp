// Módulo Gestión de juegos del panel admin (SPEC-017, Fase 5).
//
// QUÉ HACE Y QUÉ NO (importante para la lectura del revisor):
// el administrador gestiona la DISPONIBILIDAD de los tipos de juego que ya
// están implementados en la aplicación. NO programa mecánicas nuevas desde
// aquí: incorporar un juego es trabajo de un desarrollador siguiendo el
// contrato documentado (docs/COMO-AGREGAR-UN-JUEGO.md). La interfaz lo dice
// explícitamente para no dar a entender lo contrario.
//
// Cambiar de estado NUNCA elimina actividades, progreso, calificaciones ni XP.
import { useEffect, useState } from 'react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RemoveRoundedIcon from '@mui/icons-material/Remove';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import { SectionCard, EmptyState, ModalPanel } from '../../../components/dashboard/DashboardWidgets';
import { listarJuegos, cambiarEstadoJuego } from '../../../services/juegosService';
import './moduloJuegos.css';

const ETIQUETA_ESTADO = {
    activo: 'Activo',
    solo_jugar: 'Solo jugar',
    deshabilitado: 'Deshabilitado'
};

const AYUDA_ESTADO = {
    activo: 'Los docentes pueden crear actividades y los estudiantes jugarlas.',
    solo_jugar: 'No se crean actividades nuevas. Las que ya existen siguen funcionando.',
    deshabilitado: 'Oculto para los estudiantes. Las actividades y el progreso se conservan.'
};

// Capacidades e integración que se muestran como chips por juego.
const INTEGRACION = [
    ['reproductor', 'Reproductor'],
    ['editor', 'Editor'],
    ['ia', 'IA'],
    ['banco', 'Banco/Reutilización'],
    ['evaluacion', 'Evaluación']
];

export default function ModuloJuegos() {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [confirmar, setConfirmar] = useState(null);   // { juego, estado }
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState(null);

    useEffect(() => {
        let vivo = true;
        listarJuegos()
            .then((d) => vivo && setDatos(d))
            .catch((e) => vivo && setError(e.message));
        return () => { vivo = false; };
    }, []);

    const pedirCambio = (juego, estado) => {
        if (juego.estado === estado) return;
        setAviso(null);
        // Reducir disponibilidad afecta a lo que ya existe: se confirma siempre.
        if (estado === 'activo') aplicar(juego, estado);
        else setConfirmar({ juego, estado });
    };

    const aplicar = async (juego, estado) => {
        setGuardando(true); setError(null);
        try {
            setDatos(await cambiarEstadoJuego(juego.tipo, estado));
            setAviso(`"${juego.etiqueta}" ahora está en «${ETIQUETA_ESTADO[estado]}». No se eliminó ninguna actividad.`);
        } catch (e) { setError(e.message); }
        finally { setGuardando(false); setConfirmar(null); }
    };

    if (error && !datos) return <EmptyState titulo="No se pudieron cargar los juegos" descripcion={error} />;
    if (!datos) return <EmptyState titulo="Cargando…" descripcion="Consultando los tipos de juego instalados." />;

    return (
        <div className="dash-secciones">
            <SectionCard
                titulo="Tipos de juego instalados"
                subtitulo="Estos son los juegos implementados en GamificApp. Aquí decides cuáles están disponibles; no se elimina ninguno."
            >
                <p className="juegos-nota">
                    <InfoRoundedIcon fontSize="small" />
                    Incorporar un juego con una mecánica nueva es trabajo de desarrollo: se implementa en el
                    código siguiendo el contrato del sistema y aparece aquí automáticamente. Desde este panel
                    se gestiona su disponibilidad, no su programación.
                </p>

                {aviso && <p className="juegos-aviso is-ok">{aviso}</p>}
                {error && <p className="juegos-aviso is-error">{error}</p>}

                <ul className="juegos-lista">
                    {datos.juegos.map((j) => (
                        <li key={j.tipo} className={`juego-fila is-${j.estado}`}>
                            <div className="juego-cabecera">
                                <span className="juego-emoji" aria-hidden="true">{j.emoji}</span>
                                <div className="juego-identidad">
                                    <strong>{j.etiqueta}</strong>
                                    <span className="juego-desc">{j.descripcion}</span>
                                </div>
                                <span className={`juego-badge is-${j.estado}`}>{ETIQUETA_ESTADO[j.estado]}</span>
                            </div>

                            <div className="juego-integracion">
                                {INTEGRACION.map(([clave, nombre]) => {
                                    const activo = j.integracion?.[clave] ?? j.capacidades?.[clave] ?? false;
                                    return (
                                        <span key={clave} className={`juego-chip ${activo ? 'is-si' : 'is-no'}`}>
                                            {activo
                                                ? <CheckCircleRoundedIcon fontSize="inherit" />
                                                : <RemoveRoundedIcon fontSize="inherit" />}
                                            {nombre}
                                        </span>
                                    );
                                })}
                            </div>

                            <p className="juego-uso">
                                {j.actividades === 0
                                    ? 'Todavía no hay actividades de este tipo.'
                                    : `${j.actividades} actividad${j.actividades === 1 ? '' : 'es'} creada${j.actividades === 1 ? '' : 's'} · ${j.publicadas} publicada${j.publicadas === 1 ? '' : 's'}`}
                            </p>

                            <div className="juego-estados" role="group" aria-label={`Estado de ${j.etiqueta}`}>
                                {datos.estados.map((e) => (
                                    <button
                                        key={e}
                                        type="button"
                                        className={`juego-estado-btn ${j.estado === e ? 'is-activo' : ''}`}
                                        onClick={() => pedirCambio(j, e)}
                                        disabled={guardando}
                                        title={AYUDA_ESTADO[e]}
                                        aria-pressed={j.estado === e}
                                    >
                                        {ETIQUETA_ESTADO[e]}
                                    </button>
                                ))}
                            </div>
                            <p className="juego-ayuda-estado">{AYUDA_ESTADO[j.estado]}</p>
                        </li>
                    ))}
                </ul>

                <p className="juegos-nota-final">
                    Cambiar el estado de un juego nunca elimina actividades, calificaciones, progreso ni XP
                    de los estudiantes.
                </p>
            </SectionCard>

            {confirmar && (
                <ModalPanel
                    titulo={`¿Cambiar "${confirmar.juego.etiqueta}" a «${ETIQUETA_ESTADO[confirmar.estado]}»?`}
                    subtitulo={AYUDA_ESTADO[confirmar.estado]}
                    onCerrar={() => setConfirmar(null)}
                >
                    <p className="juego-confirma-uso">
                        {confirmar.juego.actividades === 0
                            ? 'No hay ninguna actividad de este tipo todavía.'
                            : `Hay ${confirmar.juego.actividades} actividad${confirmar.juego.actividades === 1 ? '' : 'es'} de este tipo (${confirmar.juego.publicadas} publicada${confirmar.juego.publicadas === 1 ? '' : 's'}).`}
                    </p>
                    <p className="juego-confirma-seguro">
                        <strong>Nada se elimina.</strong> Las actividades, las calificaciones, el progreso y el XP
                        que los estudiantes ya obtuvieron se conservan intactos. Podrás volver a activarlo cuando quieras.
                        {confirmar.estado === 'deshabilitado' &&
                            ' Los estudiantes dejarán de ver estas actividades, pero quien esté jugando una ahora podrá terminarla.'}
                    </p>
                    <div className="juego-confirma-acciones">
                        <button type="button" className="preview-action" onClick={() => setConfirmar(null)} disabled={guardando}>
                            Cancelar
                        </button>
                        <button type="button" className="preview-action preview-action-primary" onClick={() => aplicar(confirmar.juego, confirmar.estado)} disabled={guardando}>
                            {guardando ? 'Aplicando…' : `Sí, cambiar a ${ETIQUETA_ESTADO[confirmar.estado]}`}
                        </button>
                    </div>
                </ModalPanel>
            )}
        </div>
    );
}
