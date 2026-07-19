// Reproductor de la LÍNEA DEL TIEMPO (SPEC-006, Fase 1) — ordenar secuencias.
// configuracion_json: { instruccion, titulo_secuencia?, eventos: [{ texto, etiqueta? }] }
// Los eventos llegan EN ORDEN CORRECTO y se barajan al empezar. El niño los
// mueve libremente con flechas ▲▼ (táctil e inclusivo).
//
// A2 — actividad de ordenamiento evaluada AL ENVIAR: mientras organiza, nada
// se marca en verde, nada se bloquea y nada revela la solución; al pulsar
// "Comprobar orden" se evalúa la secuencia completa una sola vez.
// Puntaje: pares de eventos consecutivos correctos (ver ordenSecuencia.js).
import { useMemo, useState } from 'react';
import TouchAppRoundedIcon from '@mui/icons-material/TouchAppRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { mezclar, useRecompensa, useReporteIntento, PantallaFinal, LogroToast } from './juegosComunes';
import { evaluarOrden } from './ordenSecuencia';
import './juegos.css';

export function LineaTiempo({ reto, estudianteId, onSalir, onCompletado, soloPrueba, onEstadoIntento }) {
    const eventos = reto?.configuracion?.eventos || [];
    const instruccion = reto?.configuracion?.instruccion || 'Ordena los eventos: arriba el primero, abajo el último.';
    const tituloSecuencia = reto?.configuracion?.titulo_secuencia || null;

    const [semilla, setSemilla] = useState(0);
    // `ordenInicial` son los índices correctos (0..n-1) barajados; el estado
    // `orden` es cómo los tiene acomodados el niño ahora.
    const ordenInicial = useMemo(
        () => mezclar(eventos.map((_, i) => i)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [reto?.id, semilla]
    );
    const [orden, setOrden] = useState(ordenInicial);
    // Resultado del envío: null mientras organiza, { aciertos, total } al enviar.
    const [enviado, setEnviado] = useState(null);

    // Reset derivado al re-barajar (jugar otra vez u otro reto).
    const [claveOrden, setClaveOrden] = useState(ordenInicial);
    if (claveOrden !== ordenInicial) {
        setClaveOrden(ordenInicial);
        setOrden(ordenInicial);
        setEnviado(null);
    }

    // La nota se mide en PARES de eventos en orden relativo correcto, no en
    // posiciones absolutas: `total` es n(n-1)/2 (ver ordenSecuencia.js).
    const completado = enviado !== null;
    const aciertos = enviado?.aciertos ?? 0;
    const total = enviado?.total ?? Math.max(eventos.length - 1, 1);

    const { puntosGanados, toast, setToast, xpIntento } = useRecompensa({
        completado, estudianteId, reto, tipo: 'linea-tiempo', aciertos, total, semilla, onCompletado, soloPrueba
    });

    // Guardia de salida: hay progreso real en cuanto movió algún evento
    // respecto del orden barajado inicial (aún no ha enviado nada).
    const reordeno = orden !== ordenInicial && orden.some((v, i) => v !== ordenInicial[i]);
    useReporteIntento(onEstadoIntento, !soloPrueba && !completado && reordeno);

    // Movimiento SIEMPRE libre: nada se bloquea durante el intento.
    const mover = (posicion, delta) => {
        const destino = posicion + delta;
        if (completado || destino < 0 || destino >= orden.length) return;
        setOrden((prev) => {
            const copia = [...prev];
            [copia[posicion], copia[destino]] = [copia[destino], copia[posicion]];
            return copia;
        });
    };

    // Envío único: evalúa la secuencia completa y cierra el intento.
    const comprobar = () => {
        if (completado) return;
        setEnviado(evaluarOrden(orden));
    };

    const reiniciar = () => {
        setEnviado(null);
        setSemilla((s) => s + 1);
    };

    if (!eventos.length) {
        return <p className="vacio-msg">Este juego no tiene configuración válida.</p>;
    }

    return (
        <div className="juego-linea">
            {!completado && (
                <p className="juego-dnd-instruccion">
                    <TouchAppRoundedIcon sx={{ fontSize: '1.2rem' }} />
                    {instruccion}
                </p>
            )}
            {tituloSecuencia && !completado && (
                <h4 className="linea-titulo-secuencia">{tituloSecuencia}</h4>
            )}

            {!completado && (
                <>
                    <ol className="linea-lista">
                        {orden.map((eventoIdx, posicion) => {
                            const evento = eventos[eventoIdx];
                            return (
                                <li key={eventoIdx} className="linea-evento">
                                    <span className="linea-evento-num" aria-hidden="true">{posicion + 1}</span>
                                    <span className="linea-evento-texto">
                                        {evento.texto}
                                        {evento.etiqueta && <em className="linea-evento-etiqueta">{evento.etiqueta}</em>}
                                    </span>
                                    {/* Movimiento libre: las flechas solo se
                                        deshabilitan en los extremos de la lista. */}
                                    <span className="linea-evento-flechas">
                                        <button
                                            type="button"
                                            aria-label={`Subir: ${evento.texto}`}
                                            disabled={posicion === 0}
                                            onClick={() => mover(posicion, -1)}
                                        >
                                            <ArrowUpwardRoundedIcon sx={{ fontSize: '1.15rem' }} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Bajar: ${evento.texto}`}
                                            disabled={posicion === orden.length - 1}
                                            onClick={() => mover(posicion, 1)}
                                        >
                                            <ArrowDownwardRoundedIcon sx={{ fontSize: '1.15rem' }} />
                                        </button>
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                    <button type="button" className="linea-btn-comprobar" onClick={comprobar}>
                        <CheckCircleRoundedIcon sx={{ fontSize: '1.15rem' }} />
                        Comprobar orden
                    </button>
                    <p className="linea-pista" role="status">
                        Acomoda todos los eventos y pulsa «Comprobar orden» cuando estés listo.
                    </p>
                </>
            )}

            {completado && (
                <PantallaFinal
                    aciertos={aciertos}
                    total={total}
                    puntosGanados={puntosGanados}
                    xp={xpIntento}
                    detalle={`${aciertos} de ${total} parejas de eventos bien ordenadas`}
                    etiquetaRevisar="Ver mis estrellas"
                    onReiniciar={reiniciar}
                    onSalir={onSalir}
                />
            )}

            {toast && <LogroToast {...toast} onClose={() => setToast(null)} />}
        </div>
    );
}

export default LineaTiempo;
