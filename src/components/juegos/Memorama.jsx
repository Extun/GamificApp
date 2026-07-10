// Reproductor del MEMORAMA (SPEC-006, Fase 1) — juego de memoria por parejas.
// configuracion_json: { instruccion, parejas: [{ a, b }, ...] }
// Cada pareja produce dos cartas (cara A y cara B) que el niño debe emparejar.
// Puntaje: una pareja cuenta como acierto si se encuentra sin haber fallado
// antes con ninguna de sus dos cartas (mismo criterio "al primer intento"
// que el clasificador). El juego siempre se termina ganando.
import { useMemo, useState } from 'react';
import TouchAppRoundedIcon from '@mui/icons-material/TouchAppRounded';
import { mezclar, useRecompensa, PantallaFinal, LogroToast } from './juegosComunes';
import './juegos.css';

export function Memorama({ reto, estudianteId, onSalir }) {
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
    const [falladas, setFalladas] = useState(() => new Set());       // nº de pareja con algún fallo
    const [bloqueado, setBloqueado] = useState(false);

    const total = parejas.length;
    const encontradas = emparejadas.size / 2;
    const completado = total > 0 && encontradas === total;
    const aciertos = [...Array(total).keys()].filter(
        (i) => emparejadas.has(`${i}-a`) && !falladas.has(i)
    ).length;

    const { puntosGanados, toast, setToast } = useRecompensa({
        completado, estudianteId, reto, tipo: 'memorama', aciertos, total, semilla
    });

    const reiniciar = () => {
        setVolteadas([]);
        setEmparejadas(new Set());
        setFalladas(new Set());
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
            setFalladas((prev) => new Set([...prev, c1.pareja, c2.pareja]));
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
                        style={{ width: `${total ? (encontradas / total) * 100 : 0}%` }}
                    />
                </div>
                <span>{encontradas} / {total} parejas</span>
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
                    onReiniciar={reiniciar}
                    onSalir={onSalir}
                />
            )}

            {toast && <LogroToast {...toast} onClose={() => setToast(null)} />}
        </div>
    );
}

export default Memorama;
