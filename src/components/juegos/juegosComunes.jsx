// Piezas compartidas de los reproductores de juegos (SPEC-006, Fase 1).
// Mismo contrato que Quiz/Clasificador/Misión: reciben { reto, estudianteId },
// cuentan aciertos "al primer intento" y al completar otorgan XP con
// gamificationService.completarReto (transaccional e idempotente en servidor).
import { useEffect, useRef, useState } from 'react';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded';
import gamificationService from '../../services/gamificationService';
import { LogroToast } from '../quiz/QuizInteractivo';

// Mezcla no destructiva (Fisher–Yates) para que cada partida sea distinta.
export const mezclar = (arr) => {
    const copia = [...arr];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
};

// Hook de recompensa: al completarse el juego suma XP/logros una sola vez y
// persiste en la BD central. `semilla` reinicia el candado al volver a jugar.
export const useRecompensa = ({ completado, estudianteId, reto, tipo, aciertos, total, semilla }) => {
    const [puntosGanados, setPuntosGanados] = useState(0);
    const [toast, setToast] = useState(null);
    const recompensado = useRef(false);

    useEffect(() => {
        recompensado.current = false;
        setPuntosGanados(0);
    }, [semilla, reto?.id]);

    useEffect(() => {
        if (!completado || recompensado.current) return;
        recompensado.current = true;

        const { puntos, nuevosLogros, servidor } = gamificationService.completarReto({
            estudianteId, reto, tipo, aciertos, total
        });
        setPuntosGanados(puntos);

        if (aciertos === total) {
            setToast({ mensaje: '¡Resultado perfecto! 🌟' });
        } else if (nuevosLogros.length) {
            setToast({ mensaje: nuevosLogros[0].titulo });
        }
        servidor.then((data) => {
            if (data) {
                setToast({
                    titulo: 'Progreso guardado',
                    mensaje: `+${data.xp_abonado} XP registrados en tu cuenta`,
                    icono: <CloudDoneRoundedIcon />
                });
            }
        });
    }, [completado, aciertos, total, estudianteId, reto, tipo]);

    return { puntosGanados, toast, setToast };
};

// Pantalla de celebración final compartida (mismo lenguaje visual que el
// clasificador: trofeo + estrellas + jugar otra vez / volver).
export function PantallaFinal({ aciertos, total, puntosGanados, onReiniciar, onSalir }) {
    const estrellas = total ? Math.max(1, Math.round((aciertos / total) * 3)) : 0;
    return (
        <div className="juego-dnd-final">
            <EmojiEventsRoundedIcon className="juego-dnd-final-trofeo" />
            <div className="juego-dnd-estrellas" aria-label={`${estrellas} de 3 estrellas`}>
                {[1, 2, 3].map((n) => (
                    <StarRoundedIcon key={n} className={n <= estrellas ? 'is-ganada' : ''} />
                ))}
            </div>
            <strong>¡Lo lograste!</strong>
            <p>{aciertos} de {total} al primer intento · +{puntosGanados} XP</p>
            <div className="juego-dnd-final-acciones">
                <button type="button" className="juego-dnd-btn" onClick={onReiniciar}>
                    <ReplayRoundedIcon sx={{ fontSize: '1.1rem' }} /> Jugar otra vez
                </button>
                {onSalir && (
                    <button type="button" className="juego-dnd-btn juego-dnd-btn-ghost" onClick={onSalir}>
                        Volver a los juegos
                    </button>
                )}
            </div>
        </div>
    );
}

export { LogroToast };
