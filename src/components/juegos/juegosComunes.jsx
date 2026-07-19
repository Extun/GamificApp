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
import { ResultadoActividad, ResultadoCierre } from './ResultadoActividad';
export { useReporteIntento } from '../../hooks/useGuardiaActividad';

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
    // XP realmente acreditado por el backend en ESTE intento (SPEC-015):
    // null = respuesta pendiente. El overlay nunca muestra "+0 XP".
    const [xpIntento, setXpIntento] = useState(null);
    const recompensado = useRef(false);

    useEffect(() => {
        recompensado.current = false;
        setPuntosGanados(0);
        setXpIntento(null);
    }, [semilla, reto?.id]);

    useEffect(() => {
        if (!completado || recompensado.current) return;
        recompensado.current = true;

        if (soloPrueba) {
            // Puntaje simulado para que la pantalla final sea realista.
            setPuntosGanados(aciertos * PUNTOS_POR_ACIERTO);
            setXpIntento({ estado: 'ganado', ganado: aciertos * PUNTOS_POR_ACIERTO });
            setToast({ titulo: 'Modo prueba', mensaje: 'Nada se guardó: así lo verá el estudiante.' });
            return;
        }

        // `total` viaja al servidor (SPEC-015): calificación /100 y XP
        // proporcional se calculan allá con los datos objetivos del intento.
        const { puntos, servidor } = gamificationService.completarReto({
            estudianteId, reto, aciertos, total
        });
        setPuntosGanados(puntos);

        if (aciertos === total) {
            setToast({ mensaje: '¡Resultado perfecto! 🌟' });
        }
        servidor.then((data) => {
            // Avisa siempre (aunque la red fallara): el Home vuelve a leer la
            // verdad de la BD y así la barra de XP refleja el cambio al instante.
            onCompletado?.();
            if (!data) {
                // Sin confirmación del servidor: estado neutral, nunca un
                // "+N XP" estimado como si estuviera acreditado.
                setXpIntento({ estado: 'sinConfirmar' });
                return;
            }
            setXpIntento(
                data.xp_abonado > 0
                    ? { estado: 'ganado', ganado: data.xp_abonado }
                    : {
                        estado: data.xp_obtenido_total >= data.xp_recompensa ? 'completo' : 'sinCambio',
                        ganado: 0
                    }
            );
            const mision = data.nuevas_misiones?.[0];
            if (mision) {
                setToast({ titulo: '¡Misión completada!', mensaje: mision.titulo });
            } else {
                setToast({
                    titulo: 'Progreso guardado',
                    mensaje: data.xp_abonado > 0
                        ? `+${data.xp_abonado} XP registrados en tu cuenta`
                        : 'Tu intento quedó registrado',
                    icono: <CloudDoneRoundedIcon />
                });
            }
        }).catch(() => {
            setXpIntento({ estado: 'sinConfirmar' });
        });
    }, [completado, aciertos, total, estudianteId, reto, tipo, onCompletado, soloPrueba]);

    return { puntosGanados, toast, setToast, xpIntento };
};

// Pantalla de celebración final compartida (trofeo + estrellas + acciones).
// Al montarse aparece encima el overlay gamificado (ResultadoCierre) con la
// calificación, la retroalimentación y el XP confirmado por el backend (`xp`);
// cerrarlo deja esta pantalla a la vista con el botón para reabrirlo.
// `detalle` y `etiquetaRevisar` permiten adaptar el texto a cada juego.
export function PantallaFinal({
    aciertos,
    total,
    puntosGanados,
    xp,
    detalle,
    etiquetaRevisar,
    etiquetaSalir = 'Otros juegos',
    onReiniciar,
    onSalir
}) {
    const estrellas = total ? Math.max(1, Math.round((aciertos / total) * 3)) : 0;
    return (
        <div className="juego-dnd-final">
            <ResultadoCierre
                aciertos={aciertos}
                total={total}
                puntosGanados={puntosGanados}
                xp={xp ?? { estado: 'cargando' }}
                detalle={detalle}
                etiquetaRevisar={etiquetaRevisar}
                onReintentar={onReiniciar}
                etiquetaReintentar="Jugar otra vez"
                onContinuar={onSalir}
                etiquetaContinuar={etiquetaSalir}
            />
            <EmojiEventsRoundedIcon className="juego-dnd-final-trofeo" />
            <div className="juego-dnd-estrellas" aria-label={`${estrellas} de 3 estrellas`}>
                {[1, 2, 3].map((n) => (
                    <StarRoundedIcon key={n} className={n <= estrellas ? 'is-ganada' : ''} />
                ))}
            </div>
            <strong>¡Lo lograste!</strong>
            {/* Calificación /100 + retroalimentación por rango + XP separado.
                La nota sale de aciertos/total del intento, nunca del XP. */}
            <ResultadoActividad
                aciertos={aciertos}
                total={total}
                puntosGanados={puntosGanados}
                detalle={detalle}
                xp={xp ?? { estado: 'cargando' }}
            />
            <div className="juego-dnd-final-acciones">
                <button type="button" className="juego-dnd-btn" onClick={onReiniciar}>
                    <ReplayRoundedIcon sx={{ fontSize: '1.1rem' }} /> Jugar otra vez
                </button>
                {onSalir && (
                    <button type="button" className="juego-dnd-btn juego-dnd-btn-ghost" onClick={onSalir}>
                        {etiquetaSalir}
                    </button>
                )}
            </div>
        </div>
    );
}

export { LogroToast };
