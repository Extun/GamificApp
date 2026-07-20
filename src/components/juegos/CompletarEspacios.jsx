// Reproductor de COMPLETAR ESPACIOS (SPEC-006, Fase 1).
// configuracion_json: { instruccion, frases: [{ texto (con ___), opciones, correcta }] }
// Una frase a la vez (mismo lenguaje "una decisión a la vez" de MisionNarrativa):
// el niño elige la palabra que llena el espacio; acierto al primer intento
// puntúa; si falla, ve la correcta y avanza igual (siempre termina).
import { useMemo, useState } from 'react';
import TouchAppRoundedIcon from '@mui/icons-material/TouchAppRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { mezclar, useRecompensa, useReporteIntento, PantallaFinal, LogroToast } from './juegosComunes';
import './juegos.css';

// Pinta la frase con el espacio como hueco o con la palabra elegida.
const Frase = ({ texto, relleno, estado }) => {
    const [antes, despues] = texto.split('___');
    return (
        <p className="completar-frase">
            {antes}
            <span className={`completar-hueco ${relleno ? `is-${estado}` : ''}`}>
                {relleno || '______'}
            </span>
            {despues}
        </p>
    );
};

export function CompletarEspacios({ reto, estudianteId, onSalir, onCompletado, soloPrueba, onEstadoIntento }) {
    const frases = reto?.configuracion?.frases || [];
    const instruccion = reto?.configuracion?.instruccion || 'Elige la palabra que completa cada frase.';

    const [semilla, setSemilla] = useState(0);
    const [actual, setActual] = useState(0);
    const [elegida, setElegida] = useState(null);
    const [aciertos, setAciertos] = useState(0);
    const [terminadas, setTerminadas] = useState(0);
    // Palabra elegida por frase (índice → opción): alimenta la revisión final.
    // La corrección es DIFERIDA: durante el intento solo se registra.
    const [elegidas, setElegidas] = useState([]);

    const frase = frases[actual] || null;
    // Baraja las opciones de la frase actual para que la correcta cambie de lugar.
    const opciones = useMemo(
        () => (frase ? mezclar(frase.opciones) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [reto?.id, actual, semilla]
    );

    const total = frases.length;
    const completado = total > 0 && terminadas === total;
    const respondida = elegida !== null;

    const { puntosGanados, toast, setToast, xpIntento } = useRecompensa({
        completado, estudianteId, reto, tipo: 'completar', aciertos, total, semilla, onCompletado, soloPrueba
    });

    // Guardia de salida: hay progreso real desde la primera palabra elegida.
    useReporteIntento(
        onEstadoIntento,
        !soloPrueba && !completado && (terminadas > 0 || respondida)
    );

    const elegir = (opcion) => {
        if (respondida || !frase) return;
        setElegida(opcion);
        setElegidas((prev) => [...prev, opcion]);
        if (opcion === frase.correcta) setAciertos((n) => n + 1);
    };

    const siguiente = () => {
        setTerminadas((n) => n + 1);
        setElegida(null);
        setActual((i) => Math.min(i + 1, frases.length - 1));
    };

    const reiniciar = () => {
        setActual(0);
        setElegida(null);
        setAciertos(0);
        setTerminadas(0);
        setElegidas([]);
        setSemilla((s) => s + 1);
    };

    if (!frases.length) {
        return <p className="vacio-msg">Este juego no tiene configuración válida.</p>;
    }

    return (
        <div className="juego-completar">
            {!completado && (
                <>
                    <p className="juego-dnd-instruccion">
                        <TouchAppRoundedIcon sx={{ fontSize: '1.2rem' }} />
                        {instruccion}
                    </p>

                    <div className="juego-dnd-avance">
                        <div className="progress-track">
                            <div
                                className="progress-fill progress-fill-accent"
                                style={{ width: `${(terminadas / total) * 100}%` }}
                            />
                        </div>
                        <span>{terminadas} / {total}</span>
                    </div>

                    <div className="completar-tarjeta">
                        {/* Corrección diferida: durante el intento la elección
                            solo se marca en ámbar ("tu respuesta"), sin revelar
                            si es correcta; el verde/rojo llega en la revisión. */}
                        <Frase
                            texto={frase.texto}
                            relleno={respondida ? elegida : null}
                            estado="elegido"
                        />

                        <div className="completar-opciones">
                            {opciones.map((opcion) => {
                                let estado = '';
                                if (respondida) {
                                    estado = opcion === elegida ? 'opcion-elegida' : 'opcion-atenuada';
                                }
                                return (
                                    <button
                                        key={opcion}
                                        type="button"
                                        className={`completar-opcion ${estado}`}
                                        onClick={() => elegir(opcion)}
                                        disabled={respondida}
                                    >
                                        {opcion}
                                    </button>
                                );
                            })}
                        </div>

                        {respondida && (
                            <div className="completar-feedback" role="status">
                                <strong>¡Respuesta guardada!</strong>
                                <button type="button" className="completar-btn-siguiente" onClick={siguiente}>
                                    {terminadas + 1 === total ? 'Ver mi resultado' : 'Siguiente frase'}
                                    <ArrowForwardRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {completado && (
                <>
                    <PantallaFinal
                        aciertos={aciertos}
                        total={total}
                        puntosGanados={puntosGanados}
                        xp={xpIntento}
                        detalle={`${aciertos} de ${total} correctas`}
                        etiquetaRevisar="Revisar respuestas"
                        onReiniciar={reiniciar}
                        onSalir={onSalir}
                    />
                    {/* Revisión del intento: cada frase con la palabra elegida
                        (verde/rojo recién aquí) y la correcta cuando falló. */}
                    <div className="completar-revision">
                        <h4>Así respondiste</h4>
                        {frases.map((f, i) => {
                            const eleccion = elegidas[i];
                            const acerto = eleccion === f.correcta;
                            return (
                                <div key={i} className="completar-revision-item">
                                    <span className="completar-revision-icono" aria-hidden="true">
                                        {acerto
                                            ? <CheckCircleRoundedIcon sx={{ fontSize: '1.2rem', color: 'var(--color-success)' }} />
                                            : <CancelRoundedIcon sx={{ fontSize: '1.2rem', color: '#ef4444' }} />}
                                    </span>
                                    <div>
                                        <Frase
                                            texto={f.texto}
                                            relleno={eleccion}
                                            estado={acerto ? 'correcto' : 'incorrecto'}
                                        />
                                        {!acerto && (
                                            <p className="completar-revision-correcta">
                                                La palabra era <strong>"{f.correcta}"</strong>.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {toast && <LogroToast {...toast} onClose={() => setToast(null)} />}
        </div>
    );
}

export default CompletarEspacios;
