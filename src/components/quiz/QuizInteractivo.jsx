import { useEffect, useMemo, useRef, useState } from 'react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded';
import gamificationService from '../../services/gamificationService';
import './quizInteractivo.css';

const LETRAS = ['A', 'B', 'C', 'D'];

// Tarjeta interactiva de una pregunta: alternativas como botones clicables que
// marcan acierto/error y revelan la justificación.
// `onResponder(esCorrecta)` es opcional y permite a un contenedor superior (p. ej.
// el modo estudiante) llevar la cuenta del puntaje.
export function PreguntaCard({ pregunta, indice, onResponder }) {
    const [elegida, setElegida] = useState(null);
    const correcta = (pregunta.correcta || '').trim().toUpperCase().charAt(0);
    const respondida = elegida !== null;

    const responder = (letra) => {
        if (respondida) return;
        setElegida(letra);
        onResponder?.(letra === correcta);
    };

    return (
        <div className="pregunta-card">
            <p className="pregunta-enunciado">
                <span className="pregunta-num">{indice + 1}</span>
                {pregunta.pregunta}
            </p>

            <div className="pregunta-opciones">
                {LETRAS.map((letra) => {
                    const texto = pregunta.alternativas?.[letra];
                    if (!texto) return null;

                    let estado = '';
                    if (respondida) {
                        if (letra === correcta) estado = 'opcion-correcta';
                        else if (letra === elegida) estado = 'opcion-incorrecta';
                        else estado = 'opcion-atenuada';
                    }

                    return (
                        <button
                            key={letra}
                            type="button"
                            className={`opcion-quiz ${estado}`}
                            onClick={() => responder(letra)}
                            disabled={respondida}
                        >
                            <span className="opcion-letra">{letra}</span>
                            <span className="opcion-texto">{texto}</span>
                            {respondida && letra === correcta && <CheckCircleRoundedIcon className="opcion-icono" />}
                            {respondida && letra === elegida && letra !== correcta && (
                                <CancelRoundedIcon className="opcion-icono" />
                            )}
                        </button>
                    );
                })}
            </div>

            {respondida && (
                <div className="pregunta-justificacion">
                    <LightbulbRoundedIcon className="justificacion-icono" />
                    <div>
                        <strong>
                            {elegida === correcta ? '¡Correcto!' : `Respuesta correcta: ${correcta}`}
                        </strong>
                        <p>{pregunta.justificacion}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

// Toast minimalista para anunciar logros o confirmaciones. Se auto-cierra y
// respeta la paleta (acento dorado de logros + superficie de la marca).
// Exportado: también lo usan los juegos (p. ej. JuegoDragAndDrop).
export function LogroToast({ titulo = '¡Logro desbloqueado!', mensaje, icono, onClose }) {
    useEffect(() => {
        const t = setTimeout(onClose, 5000);
        return () => clearTimeout(t);
    }, [onClose]);

    return (
        <div className="logro-toast" role="status">
            <span className="logro-toast-icon">{icono ?? <AutoAwesomeRoundedIcon />}</span>
            <div className="logro-toast-text">
                <strong>{titulo}</strong>
                <p>{mensaje}</p>
            </div>
            <button className="logro-toast-close" aria-label="Cerrar" onClick={onClose}>
                <CloseRoundedIcon />
            </button>
        </div>
    );
}

// Reproductor de un quiz completo. Con `mostrarPuntaje` (modo estudiante) lleva la
// cuenta de aciertos, muestra un marcador final y otorga XP/logros al terminar.
// Si recibe `estudianteId` y `reto` ({ id } o { materiaId, titulo }), además
// persiste el resultado en la BD central vía la API y confirma el guardado
// con un toast.
export function QuizInteractivo({ preguntas, mostrarPuntaje = false, estudianteId, reto }) {
    const [aciertos, setAciertos] = useState(0);
    const [respondidas, setRespondidas] = useState(0);
    const [puntosGanados, setPuntosGanados] = useState(0);
    const [toast, setToast] = useState(null);
    const total = preguntas.length;

    // Reinicia el marcador si cambia el set de preguntas (otro quiz seleccionado).
    const claveQuiz = useMemo(() => preguntas.map((p) => p.pregunta).join('|'), [preguntas]);

    // Evita otorgar XP/logros más de una vez por quiz completado.
    const recompensado = useRef(false);
    useEffect(() => {
        recompensado.current = false;
        setAciertos(0);
        setRespondidas(0);
        setPuntosGanados(0);
    }, [claveQuiz]);

    const registrar = (esCorrecta) => {
        setRespondidas((n) => n + 1);
        if (esCorrecta) setAciertos((n) => n + 1);
    };

    const completado = mostrarPuntaje && respondidas === total && total > 0;

    // Al completar el quiz: suma XP automáticamente y verifica logros.
    useEffect(() => {
        if (!completado || recompensado.current) return;
        recompensado.current = true;

        const { puntos, nuevosLogros, servidor } = gamificationService.completarReto({
            estudianteId,
            reto,
            tipo: 'quiz',
            aciertos,
            total
        });
        setPuntosGanados(puntos);

        if (aciertos === total) {
            setToast({ mensaje: 'Maestro de la Materia' });
        } else if (nuevosLogros.length) {
            setToast({ mensaje: nuevosLogros[0].titulo });
        }

        servidor.then((data) => {
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
    }, [completado, aciertos, total, estudianteId, reto]);

    return (
        <div className="quiz-interactivo" key={claveQuiz}>
            {completado && (
                <div className="quiz-puntaje">
                    <EmojiEventsRoundedIcon className="quiz-puntaje-icono" />
                    <div>
                        <strong>{aciertos} de {total} correctas</strong>
                        <p>{Math.round((aciertos / total) * 100)}% de aciertos · +{puntosGanados} XP</p>
                    </div>
                </div>
            )}

            {preguntas.map((p, i) => (
                <PreguntaCard
                    key={i}
                    pregunta={p}
                    indice={i}
                    onResponder={mostrarPuntaje ? registrar : undefined}
                />
            ))}

            {toast && <LogroToast {...toast} onClose={() => setToast(null)} />}
        </div>
    );
}
