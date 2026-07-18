// Piezas compartidas de los reproductores de juegos (SPEC-006, Fase 1).
// Mismo contrato que Quiz/Clasificador/Misión: reciben { reto, estudianteId },
// cuentan aciertos "al primer intento" y al completar otorgan XP con
// gamificationService.completarReto (transaccional e idempotente en servidor).
import { useEffect, useRef, useState } from 'react';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded';
import gamificationService, { PUNTOS_POR_ACIERTO } from '../../services/gamificationService';
import { LogroToast } from '../quiz/QuizInteractivo';
import { ResultadoActividad } from './ResultadoActividad';

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
// `onCompletado` avisa al contenedor (el Home) cuando el servidor confirma el
// progreso, para que refresque el XP/nivel/premios con la verdad de la BD.
// `soloPrueba` (SPEC-012): modo vista previa del docente — el juego se
// comporta igual pero NO otorga nada (ni XP local ni POST /api/progreso).
export const useRecompensa = ({ completado, estudianteId, reto, tipo, aciertos, total, semilla, onCompletado, soloPrueba = false }) => {
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

        if (soloPrueba) {
            // Puntaje simulado para que la pantalla final sea realista.
            setPuntosGanados(aciertos * PUNTOS_POR_ACIERTO);
            setToast({ titulo: 'Modo prueba', mensaje: 'Nada se guardó: así lo verá el estudiante.' });
            return;
        }

        const { puntos, servidor } = gamificationService.completarReto({
            estudianteId, reto, aciertos
        });
        setPuntosGanados(puntos);

        if (aciertos === total) {
            setToast({ mensaje: '¡Resultado perfecto! 🌟' });
        }
        servidor.then((data) => {
            // Avisa siempre (aunque la red fallara): el Home vuelve a leer la
            // verdad de la BD y así la barra de XP refleja el cambio al instante.
            onCompletado?.();
            if (!data) return;
            const mision = data.nuevas_misiones?.[0];
            if (mision) {
                setToast({ titulo: '¡Misión completada!', mensaje: mision.titulo });
            } else {
                setToast({
                    titulo: 'Progreso guardado',
                    mensaje: `+${data.xp_abonado} XP registrados en tu cuenta`,
                    icono: <CloudDoneRoundedIcon />
                });
            }
        });
    }, [completado, aciertos, total, estudianteId, reto, tipo, onCompletado, soloPrueba]);

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
            {/* Calificación /100 + retroalimentación por rango + XP separado.
                La nota sale de aciertos/total del intento, nunca del XP. */}
            <ResultadoActividad aciertos={aciertos} total={total} puntosGanados={puntosGanados} />
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
