// Reproductor de la LÍNEA DEL TIEMPO (SPEC-006, Fase 1) — ordenar secuencias.
// configuracion_json: { instruccion, titulo_secuencia?, eventos: [{ texto, etiqueta? }] }
// Los eventos llegan EN ORDEN CORRECTO y se barajan al empezar. El niño los
// mueve con flechas ▲▼ (táctil e inclusivo) y pulsa "Comprobar": las posiciones
// correctas se fijan en verde y puede seguir intentando hasta completar todo.
// Puntaje: acierto = evento en su lugar correcto en la PRIMERA comprobación.
import { useMemo, useState } from 'react';
import TouchAppRoundedIcon from '@mui/icons-material/TouchAppRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { mezclar, useRecompensa, useReporteIntento, PantallaFinal, LogroToast } from './juegosComunes';
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
    const [fijados, setFijados] = useState(() => new Set()); // posiciones correctas confirmadas
    const [comprobaciones, setComprobaciones] = useState(0);
    const [aciertos, setAciertos] = useState(0); // correctos en la 1.ª comprobación
    const [sacudir, setSacudir] = useState(false);

    // Reset derivado al re-barajar (jugar otra vez u otro reto).
    const [claveOrden, setClaveOrden] = useState(ordenInicial);
    if (claveOrden !== ordenInicial) {
        setClaveOrden(ordenInicial);
        setOrden(ordenInicial);
        setFijados(new Set());
        setComprobaciones(0);
        setAciertos(0);
    }

    const total = eventos.length;
    const completado = total > 0 && fijados.size === total;

    const { puntosGanados, toast, setToast, xpIntento } = useRecompensa({
        completado, estudianteId, reto, tipo: 'linea-tiempo', aciertos, total, semilla, onCompletado, soloPrueba
    });

    // Guardia de salida: hay progreso real si ya comprobó al menos una vez o
    // movió algún evento respecto del orden barajado inicial.
    const reordeno = orden !== ordenInicial && orden.some((v, i) => v !== ordenInicial[i]);
    useReporteIntento(
        onEstadoIntento,
        !soloPrueba && !completado && (comprobaciones > 0 || reordeno)
    );

    const mover = (posicion, delta) => {
        const destino = posicion + delta;
        if (destino < 0 || destino >= orden.length) return;
        if (fijados.has(posicion) || fijados.has(destino)) return;
        setOrden((prev) => {
            const copia = [...prev];
            [copia[posicion], copia[destino]] = [copia[destino], copia[posicion]];
            return copia;
        });
    };

    const comprobar = () => {
        const correctas = new Set(fijados);
        orden.forEach((eventoIdx, posicion) => {
            if (eventoIdx === posicion) correctas.add(posicion);
        });
        if (comprobaciones === 0) {
            setAciertos(orden.filter((eventoIdx, posicion) => eventoIdx === posicion).length);
        }
        setComprobaciones((n) => n + 1);
        setFijados(correctas);
        if (correctas.size < total) {
            setSacudir(true);
            setTimeout(() => setSacudir(false), 600);
        }
    };

    const reiniciar = () => setSemilla((s) => s + 1);

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
                    <ol className={`linea-lista ${sacudir ? 'is-sacudida' : ''}`}>
                        {orden.map((eventoIdx, posicion) => {
                            const evento = eventos[eventoIdx];
                            const fijado = fijados.has(posicion);
                            return (
                                <li
                                    key={eventoIdx}
                                    className={`linea-evento ${fijado ? 'is-correcto' : ''}`}
                                >
                                    <span className="linea-evento-num" aria-hidden="true">{posicion + 1}</span>
                                    <span className="linea-evento-texto">
                                        {evento.texto}
                                        {evento.etiqueta && <em className="linea-evento-etiqueta">{evento.etiqueta}</em>}
                                    </span>
                                    {fijado ? (
                                        <CheckCircleRoundedIcon className="linea-evento-check" />
                                    ) : (
                                        <span className="linea-evento-flechas">
                                            <button
                                                type="button"
                                                aria-label="Subir este evento"
                                                disabled={posicion === 0 || fijados.has(posicion - 1)}
                                                onClick={() => mover(posicion, -1)}
                                            >
                                                <ArrowUpwardRoundedIcon sx={{ fontSize: '1.15rem' }} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Bajar este evento"
                                                disabled={posicion === orden.length - 1 || fijados.has(posicion + 1)}
                                                onClick={() => mover(posicion, 1)}
                                            >
                                                <ArrowDownwardRoundedIcon sx={{ fontSize: '1.15rem' }} />
                                            </button>
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                    <button type="button" className="linea-btn-comprobar" onClick={comprobar}>
                        <CheckCircleRoundedIcon sx={{ fontSize: '1.15rem' }} />
                        {comprobaciones === 0 ? 'Comprobar mi orden' : 'Comprobar otra vez'}
                    </button>
                    {comprobaciones > 0 && fijados.size < total && (
                        <p className="linea-pista" role="status">
                            ¡Vas bien! Los verdes ya están en su lugar; acomoda los demás.
                        </p>
                    )}
                </>
            )}

            {completado && (
                <PantallaFinal
                    aciertos={aciertos}
                    total={total}
                    puntosGanados={puntosGanados}
                    xp={xpIntento}
                    detalle={`${aciertos} de ${total} en su lugar a la primera`}
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
