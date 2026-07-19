// Reproductor del MEMORAMA (SPEC-006, Fase 1) — juego de memoria por parejas.
// configuracion_json: { instruccion, parejas: [{ a, b }, ...] }
// Cada pareja produce dos cartas (cara A y cara B) que el niño debe emparejar.
// Puntaje (A3, opcion C): una vuelta completa de exploracion es gratis y a
// partir de ahi la nota mide la eficiencia — ver calificacionMemorama.js. El
// juego siempre se termina ganando.
import { useMemo, useState } from 'react';
import TouchAppRoundedIcon from '@mui/icons-material/TouchAppRounded';
import { mezclar, useRecompensa, useReporteIntento, PantallaFinal, LogroToast } from './juegosComunes';
import { evaluarMemorama } from './calificacionMemorama';
import { PUNTOS_POR_ACIERTO } from '../../services/gamificationService';
import './juegos.css';

export function Memorama({ reto, estudianteId, onSalir, onCompletado, soloPrueba, onEstadoIntento }) {
    const parejas = reto?.configuracion?.parejas || [];
    const instruccion = reto?.configuracion?.instruccion || 'Encuentra las parejas que se corresponden.';

    const [semilla, setSemilla] = useState(0);
    const cartas = useMemo(() => mezclar(
        parejas.flatMap((p, i) => [
            { id: `${i}-a`, pareja: i, texto: p.a },
            { id: `${i}-b`, pareja: i, texto: p.b }
        ])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [reto?.id, semilla]);

    const [volteadas, setVolteadas] = useState([]);          // ids boca arriba (máx. 2)
    const [emparejadas, setEmparejadas] = useState(() => new Set()); // ids resueltas
    // Intentos fallidos de formar pareja (dos cartas reveladas que no casan).
    // Es un CONTADOR, no un Set: el mismo par puede fallarse varias veces y
    // cada intento cuenta, que es lo que mide la formula.
    const [fallos, setFallos] = useState(0);
    const [bloqueado, setBloqueado] = useState(false);

    const totalParejas = parejas.length;
    const encontradas = emparejadas.size / 2;
    const completado = totalParejas > 0 && encontradas === totalParejas;

    // La nota viaja sobre base 100 (aciertos = nota, total = 100) para no
    // perder la curva al cuantizarla en tan pocas parejas.
    const { nota, aciertos, total } = evaluarMemorama({ parejas: totalParejas, fallos });
    // XP optimista coherente con la nota (el servidor manda igualmente). Si el
    // reto no trae recompensa (borrador en vista previa del docente) se usa la
    // regla estándar del editor, para no mostrar "+0 XP" en la prueba.
    const xpPosible = Number(reto?.xp_recompensa ?? reto?.xpRecompensa)
        || totalParejas * PUNTOS_POR_ACIERTO;

    const { puntosGanados, toast, setToast, xpIntento } = useRecompensa({
        completado, estudianteId, reto, tipo: 'memorama', aciertos, total,
        puntosObtenidos: Math.round((nota / 100) * xpPosible),
        semilla, onCompletado, soloPrueba
    });

    // Guardia de salida: hay progreso real cuando ya se resolvió o falló
    // alguna pareja (voltear una sola carta aún no pierde nada).
    useReporteIntento(
        onEstadoIntento,
        !soloPrueba && !completado && (emparejadas.size > 0 || fallos > 0)
    );

    const reiniciar = () => {
        setVolteadas([]);
        setEmparejadas(new Set());
        setFallos(0);
        setBloqueado(false);
        setSemilla((s) => s + 1);
    };

    const voltear = (carta) => {
        if (bloqueado || emparejadas.has(carta.id) || volteadas.includes(carta.id)) return;
        const abiertas = [...volteadas, carta.id];
        setVolteadas(abiertas);
        if (abiertas.length < 2) return;

        const [id1, id2] = abiertas;
        const c1 = cartas.find((c) => c.id === id1);
        const c2 = cartas.find((c) => c.id === id2);
        if (c1.pareja === c2.pareja) {
            setEmparejadas((prev) => new Set([...prev, id1, id2]));
            setVolteadas([]);
        } else {
            setFallos((n) => n + 1);
            setBloqueado(true);
            setTimeout(() => {
                setVolteadas([]);
                setBloqueado(false);
            }, 900);
        }
    };

    if (!parejas.length) {
        return <p className="vacio-msg">Este juego no tiene configuración válida.</p>;
    }

    return (
        <div className="juego-memorama">
            {!completado && (
                <p className="juego-dnd-instruccion">
                    <TouchAppRoundedIcon sx={{ fontSize: '1.2rem' }} />
                    {instruccion}
                </p>
            )}

            <div className="juego-dnd-avance">
                <div className="progress-track">
                    <div
                        className="progress-fill progress-fill-accent"
                        style={{ width: `${totalParejas ? (encontradas / totalParejas) * 100 : 0}%` }}
                    />
                </div>
                <span>{encontradas} / {totalParejas} parejas</span>
            </div>

            {!completado && (
                <div className="memorama-tablero" data-cartas={cartas.length}>
                    {cartas.map((carta) => {
                        const arriba = volteadas.includes(carta.id) || emparejadas.has(carta.id);
                        return (
                            <button
                                key={carta.id}
                                type="button"
                                className={`memorama-carta ${arriba ? 'is-arriba' : ''} ${emparejadas.has(carta.id) ? 'is-resuelta' : ''}`}
                                onClick={() => voltear(carta)}
                                aria-label={arriba ? carta.texto : 'Carta boca abajo'}
                                disabled={emparejadas.has(carta.id)}
                            >
                                <span className="memorama-carta-interior">
                                    <span className="memorama-carta-dorso" aria-hidden="true">❓</span>
                                    <span className="memorama-carta-frente">{carta.texto}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {completado && (
                <PantallaFinal
                    aciertos={aciertos}
                    total={total}
                    puntosGanados={puntosGanados}
                    xp={xpIntento}
                    detalle={`${totalParejas} parejas encontradas · ${fallos} ${fallos === 1 ? 'intento fallido' : 'intentos fallidos'}`}
                    etiquetaRevisar="Ver mis estrellas"
                    onReiniciar={reiniciar}
                    onSalir={onSalir}
                />
            )}

            {toast && <LogroToast {...toast} onClose={() => setToast(null)} />}
        </div>
    );
}

export default Memorama;
