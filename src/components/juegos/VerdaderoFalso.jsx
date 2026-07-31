// Reproductor de VERDADERO O FALSO (SPEC-017, Fase 7).
// configuracion_json: { instruccion, afirmaciones: [{ texto, esVerdadera, explicacion? }] }
//
// Una afirmación a la vez, igual que CompletarEspacios y MisionNarrativa.
// CORRECCIÓN DIFERIDA (mismo criterio pedagógico que el Quiz): durante el
// intento la respuesta elegida solo se marca en neutro —nunca en verde— y no
// se revela si acertó; el verde/rojo, la respuesta correcta y la explicación
// aparecen en la revisión final.
//
// La calificación, el XP, el overlay de resultado, los reintentos y la guardia
// de salida son los COMUNES (juegosComunes.jsx): este archivo no define
// ninguna fórmula propia.
import { useMemo, useState } from 'react';
import TouchAppRoundedIcon from '@mui/icons-material/TouchAppRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { mezclar, useRecompensa, useReporteIntento, PantallaFinal, LogroToast } from './juegosComunes';
import { useFocoConfirmacion } from '../../hooks/useFocoConfirmacion';
import './juegos.css';
import './verdaderoFalso.css';

const ETIQUETA = { true: 'Verdadero', false: 'Falso' };

// Mismas confirmaciones que Completar espacios (POLISH SPRINT v1.0.1 Etapa B):
// los dos juegos comparten el bloque `.completar-feedback`, así que también
// comparten la voz. Neutras a propósito — la corrección es diferida y ninguna
// puede insinuar el acierto.
const CONFIRMACIONES = ['¡Anotado! ✏️', '¡Listo! 👍', '¡Guardado! 🌟', '¡Ahí va! 🚀'];

export function VerdaderoFalso({ reto, estudianteId, onSalir, onCompletado, soloPrueba, onEstadoIntento }) {
    const originales = reto?.configuracion?.afirmaciones || [];
    const instruccion = reto?.configuracion?.instruccion
        || '¿Es verdadero o falso? Piensa bien antes de responder.';

    const [semilla, setSemilla] = useState(0);
    const [actual, setActual] = useState(0);
    const [elegida, setElegida] = useState(null);
    const [aciertos, setAciertos] = useState(0);
    const [terminadas, setTerminadas] = useState(0);
    // Respuesta por afirmación (índice → booleano): alimenta la revisión final.
    const [respuestas, setRespuestas] = useState([]);

    // Se barajan las afirmaciones en cada intento (mismo `mezclar` compartido
    // que usan los demás juegos genéricos: el orden no es contenido evaluable).
    const afirmaciones = useMemo(
        () => mezclar(originales),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [reto?.id, semilla, originales.length]
    );

    const afirmacion = afirmaciones[actual] || null;
    const total = afirmaciones.length;
    const completado = total > 0 && terminadas === total;
    const respondida = elegida !== null;
    // Al responder, la opción pulsada pasa a `disabled` y el navegador tira el
    // foco a <body>; este ref lo recoge en el bloque de confirmación (P1-5).
    const refConfirmacion = useFocoConfirmacion(respondida);

    const { puntosGanados, toast, setToast, xpIntento } = useRecompensa({
        completado, estudianteId, reto, tipo: 'verdadero-falso', aciertos, total, semilla, onCompletado, soloPrueba
    });

    // Guardia de salida: hay progreso real desde la primera respuesta.
    useReporteIntento(
        onEstadoIntento,
        !soloPrueba && !completado && (terminadas > 0 || respondida)
    );

    const responder = (valor) => {
        if (respondida || !afirmacion) return;
        setElegida(valor);
        setRespuestas((prev) => [...prev, valor]);
        if (valor === afirmacion.esVerdadera) setAciertos((n) => n + 1);
    };

    const siguiente = () => {
        setTerminadas((n) => n + 1);
        setElegida(null);
        setActual((i) => Math.min(i + 1, afirmaciones.length - 1));
    };

    const reiniciar = () => {
        setActual(0);
        setElegida(null);
        setAciertos(0);
        setTerminadas(0);
        setRespuestas([]);
        setSemilla((s) => s + 1);
    };

    if (!originales.length) {
        return <p className="vacio-msg">Este juego no tiene configuración válida.</p>;
    }

    return (
        <div className="juego-vf">
            {!completado && (
                <>
                    <p className="juego-dnd-instruccion">
                        <TouchAppRoundedIcon sx={{ fontSize: '1.2rem' }} />
                        {instruccion}
                    </p>

                    {/* role="status": el avance se anunciaba solo visualmente, así
                        que quien usa lector de pantalla respondía y no recibía
                        ninguna señal de que había avanzado (SPEC-021 P2-11). */}
                    <div className="juego-dnd-avance" role="status">
                        <div className="progress-track">
                            <div
                                className="progress-fill progress-fill-accent"
                                style={{ width: `${(terminadas / total) * 100}%` }}
                            />
                        </div>
                        {/* `key` cambia al avanzar de afirmación: React remonta
                            el contador y la animación se reproduce otra vez. */}
                        <span
                            key={terminadas}
                            className={`avance-cuenta ${terminadas > 0 ? 'is-pulso' : ''}`}
                        >
                            {terminadas} / {total}
                        </span>
                    </div>

                    {/* `key` cambia al pasar de afirmación: React remonta la
                        tarjeta y la entrada de CSS se reproduce. Mismo
                        mecanismo que el contador de avance — sin estado ni
                        temporizadores nuevos. El estado del intento vive en
                        este componente, así que remontar la tarjeta no pierde
                        nada. */}
                    <div className="vf-tarjeta" key={actual}>
                        <p className="vf-afirmacion">{afirmacion.texto}</p>

                        {/* Corrección diferida: al elegir, la opción queda
                            marcada en neutro ("tu respuesta"), NUNCA en verde. */}
                        <div className="vf-opciones">
                            {[true, false].map((valor) => {
                                let estado = '';
                                if (respondida) {
                                    estado = valor === elegida ? 'is-elegida' : 'is-atenuada';
                                }
                                return (
                                    <button
                                        key={String(valor)}
                                        type="button"
                                        className={`vf-opcion ${estado}`}
                                        onClick={() => responder(valor)}
                                        disabled={respondida}
                                    >
                                        <span aria-hidden="true">{valor ? '👍' : '👎'}</span>
                                        {ETIQUETA[valor]}
                                    </button>
                                );
                            })}
                        </div>

                        {respondida && (
                            <div className="completar-feedback" role="status" ref={refConfirmacion} tabIndex={-1}>
                                <strong className="completar-sello">
                                    {CONFIRMACIONES[terminadas % CONFIRMACIONES.length]}
                                </strong>
                                <button type="button" className="completar-btn-siguiente" onClick={siguiente}>
                                    {terminadas + 1 === total ? 'Ver mi resultado' : 'Siguiente afirmación'}
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
                    {/* Revisión: qué respondió, si acertó, cuál era la respuesta
                        correcta y por qué (recién aquí aparecen verde y rojo). */}
                    <div className="completar-revision">
                        <h4>Así respondiste</h4>
                        {afirmaciones.map((a, i) => {
                            const respuesta = respuestas[i];
                            const acerto = respuesta === a.esVerdadera;
                            return (
                                <div key={i} className="completar-revision-item">
                                    <span className="completar-revision-icono" aria-hidden="true">
                                        {acerto
                                            ? <CheckCircleRoundedIcon sx={{ fontSize: '1.2rem', color: 'var(--color-success)' }} />
                                            : <CancelRoundedIcon sx={{ fontSize: '1.2rem', color: '#ef4444' }} />}
                                    </span>
                                    <div>
                                        <p className="vf-revision-texto">{a.texto}</p>
                                        <p className={`vf-revision-respuesta ${acerto ? 'is-correcta' : 'is-incorrecta'}`}>
                                            Respondiste <strong>{ETIQUETA[respuesta]}</strong>
                                            {!acerto && <> · Era <strong>{ETIQUETA[a.esVerdadera]}</strong></>}
                                        </p>
                                        {a.explicacion && (
                                            <p className="vf-revision-explicacion">{a.explicacion}</p>
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

export default VerdaderoFalso;
