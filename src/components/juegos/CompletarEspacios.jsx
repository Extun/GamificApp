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
import { mezclar, useRecompensa, PantallaFinal, LogroToast } from './juegosComunes';
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

export function CompletarEspacios({ reto, estudianteId, onSalir, onCompletado, soloPrueba }) {
    const frases = reto?.configuracion?.frases || [];
    const instruccion = reto?.configuracion?.instruccion || 'Elige la palabra que completa cada frase.';

    const [semilla, setSemilla] = useState(0);
    const [actual, setActual] = useState(0);
    const [elegida, setElegida] = useState(null);
    const [aciertos, setAciertos] = useState(0);
    const [terminadas, setTerminadas] = useState(0);

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
    const esCorrecta = respondida && elegida === frase?.correcta;

    const { puntosGanados, toast, setToast } = useRecompensa({
        completado, estudianteId, reto, tipo: 'completar', aciertos, total, semilla, onCompletado, soloPrueba
    });

    const elegir = (opcion) => {
        if (respondida || !frase) return;
        setElegida(opcion);
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
                        <Frase
                            texto={frase.texto}
                            relleno={respondida ? elegida : null}
                            estado={esCorrecta ? 'correcto' : 'incorrecto'}
                        />

                        <div className="completar-opciones">
                            {opciones.map((opcion) => {
                                let estado = '';
                                if (respondida) {
                                    if (opcion === frase.correcta) estado = 'opcion-correcta';
                                    else if (opcion === elegida) estado = 'opcion-incorrecta';
                                    else estado = 'opcion-atenuada';
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
                                        {respondida && opcion === frase.correcta && (
                                            <CheckCircleRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                        )}
                                        {respondida && opcion === elegida && opcion !== frase.correcta && (
                                            <CancelRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {respondida && (
                            <div className="completar-feedback" role="status">
                                <strong>{esCorrecta ? '¡Muy bien! 🎉' : `La palabra era "${frase.correcta}".`}</strong>
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
                <PantallaFinal
                    aciertos={aciertos}
                    total={total}
                    puntosGanados={puntosGanados}
                    onReiniciar={reiniciar}
                    onSalir={onSalir}
                />
            )}

            {toast && <LogroToast {...toast} onClose={() => setToast(null)} />}
        </div>
    );
}

export default CompletarEspacios;
