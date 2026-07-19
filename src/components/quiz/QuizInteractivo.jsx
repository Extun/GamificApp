import { useEffect, useMemo, useRef, useState } from 'react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded';
import gamificationService from '../../services/gamificationService';
import { ResultadoOverlay } from '../juegos/ResultadoActividad';
import './quizInteractivo.css';

const LETRAS = ['A', 'B', 'C', 'D'];

// Mezcla no destructiva (Fisher–Yates). Local para evitar un import circular
// con juegosComunes.jsx, que a su vez importa LogroToast desde este archivo.
const mezclar = (arr) => {
    const copia = [...arr];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
};

// Baraja el orden de las preguntas y, dentro de cada una, el orden de las
// alternativas reasignando las letras (la correcta se remapea a su nueva letra).
// SPEC-013 Fase 1: cada mezcla es configurable por quiz vía `configuracion_json`
// (`mezclar_preguntas` / `mezclar_respuestas`); ausentes = true (compatibilidad
// con quizzes publicados antes de existir los flags).
// Nunca muta la configuración original del reto: devuelve copias nuevas.
// Muestra aleatoria de `n` preguntas del pool, conservando el orden relativo
// original (por si el docente desactivó "mezclar preguntas"). SPEC-013: un quiz
// puede guardar más preguntas de las que muestra por intento (mini banco).
const muestrear = (pool, n) => {
    if (!(n > 0) || n >= pool.length) return pool;
    const indices = mezclar(pool.map((_, i) => i)).slice(0, n).sort((a, b) => a - b);
    return indices.map((i) => pool[i]);
};

const barajarQuiz = (preguntas, { mezclarPreguntas = true, mezclarRespuestas = true } = {}) => {
    if (!Array.isArray(preguntas)) return [];
    const base = mezclarPreguntas ? mezclar(preguntas) : preguntas;
    if (!mezclarRespuestas) return base;
    return base.map((p) => {
        const entradas = LETRAS
            .map((letra) => [letra, p.alternativas?.[letra]])
            .filter(([, texto]) => typeof texto === 'string' && texto.trim() !== '');
        // Con menos de 2 alternativas reales no hay nada que barajar.
        if (entradas.length < 2) return p;

        const correctaOriginal = (p.correcta || '').trim().toUpperCase().charAt(0);
        const barajadas = mezclar(entradas);
        const alternativas = {};
        let correcta = correctaOriginal;
        barajadas.forEach(([letraOriginal, texto], i) => {
            const nuevaLetra = LETRAS[i];
            alternativas[nuevaLetra] = texto;
            if (letraOriginal === correctaOriginal) correcta = nuevaLetra;
        });
        return { ...p, alternativas, correcta };
    });
};

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
// `soloPrueba` (SPEC-012): vista previa del docente — se juega igual pero no
// se otorga XP ni se guarda progreso.
// `onSalir` (opcional): navegación de "Otros quizzes" en el overlay de
// resultado; sin él (vista previa, quiz embebido) la acción no se muestra.
export function QuizInteractivo({ preguntas, mostrarPuntaje = false, estudianteId, reto, onCompletado, soloPrueba = false, onSalir }) {
    const [aciertos, setAciertos] = useState(0);
    const [respondidas, setRespondidas] = useState(0);
    const [puntosGanados, setPuntosGanados] = useState(0);
    const [toast, setToast] = useState(null);
    // Overlay de resultado: visible al completar salvo que el estudiante lo
    // haya cerrado para revisar ESTE quiz (se guarda la clave del quiz cerrado,
    // así el estado se deriva sin setState en efectos y otro quiz lo reabre).
    const [resultadoCerradoDe, setResultadoCerradoDe] = useState(null);
    // XP realmente acreditado por el backend en ESTE intento (SPEC-015):
    // null = respuesta pendiente. El overlay nunca muestra "+0 XP": según el
    // estado enseña la ganancia, "sin mejora" o "recompensa completa".
    const [xpIntento, setXpIntento] = useState(null);
    const reabrirRef = useRef(null);

    // Reinicia el marcador si cambia el set de preguntas (otro quiz
    // seleccionado). Incluye el id del reto: dos quizzes con preguntas
    // idénticas nunca comparten el estado del resultado (C3).
    const claveQuiz = useMemo(
        () => `${reto?.id ?? 'sin-id'}::${preguntas.map((p) => p.pregunta).join('|')}`,
        [preguntas, reto?.id]
    );

    // Cada partida toma su muestra del pool (si el quiz guarda más preguntas de
    // las que muestra por intento) y baraja según la configuración del reto.
    // Estable mientras se juega: solo se re-sortea al cambiar de quiz o volver
    // a montar el componente. Flags ausentes = mezclar / mostrar todas.
    const mezclarPreguntas = reto?.configuracion?.mezclar_preguntas !== false;
    const mezclarRespuestas = reto?.configuracion?.mezclar_respuestas !== false;
    const porIntento = Number(reto?.configuracion?.preguntas_por_intento) || 0;
    const preguntasJugables = useMemo(
        () => barajarQuiz(muestrear(preguntas, porIntento), { mezclarPreguntas, mezclarRespuestas }),
        // `claveQuiz` representa a `preguntas` (así un array nuevo con el mismo
        // contenido no re-sortea la muestra a mitad de partida).
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [claveQuiz, mezclarPreguntas, mezclarRespuestas, porIntento]
    );
    // El marcador y el XP se calculan sobre lo que el estudiante realmente
    // juega en este intento, no sobre todo el pool guardado.
    const total = preguntasJugables.length;

    // Evita otorgar XP/logros más de una vez por quiz completado.
    const recompensado = useRef(false);
    useEffect(() => {
        recompensado.current = false;
        setAciertos(0);
        setRespondidas(0);
        setPuntosGanados(0);
        setXpIntento(null);
        setResultadoCerradoDe(null);
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

        if (soloPrueba) {
            // Puntaje simulado: la pantalla final se ve igual, nada se guarda.
            setPuntosGanados(aciertos * 100);
            setXpIntento({ estado: 'ganado', ganado: aciertos * 100 });
            setToast({ titulo: 'Modo prueba', mensaje: 'Nada se guardó: así lo verá el estudiante.' });
            return;
        }

        // SPEC-015: `total` viaja al servidor, que calcula la calificación
        // /100 y el XP proporcional con datos objetivos del intento.
        const { puntos, servidor } = gamificationService.completarReto({
            estudianteId,
            reto,
            aciertos,
            total
        });
        setPuntosGanados(puntos);

        if (aciertos === total) {
            setToast({ mensaje: 'Maestro de la Materia' });
        }

        servidor.then((data) => {
            onCompletado?.();
            if (!data) {
                // Sin respuesta del servidor (red caída o sin sesión): el XP
                // NO se confirmó — estado neutral, nunca un "+N XP" estimado.
                setXpIntento({ estado: 'sinConfirmar' });
                return;
            }
            // El overlay refleja lo que el backend REALMENTE acreditó.
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
            // Defensa: cualquier fallo inesperado del post-procesado deja el
            // chip en estado neutral en lugar de "Guardando…" indefinido.
            setXpIntento({ estado: 'sinConfirmar' });
        });
    }, [completado, aciertos, total, estudianteId, reto, onCompletado, soloPrueba]);

    return (
        <div className="quiz-interactivo" key={claveQuiz}>
            {/* Calificación /100 sobre las preguntas realmente presentadas en
                este intento (con banco aleatorio, la muestra — nunca el pool),
                retroalimentación por rango y XP como recompensa separada.
                Overlay de cierre: "Revisar respuestas" lo cierra dejando el
                detalle actual de aciertos/errores/justificaciones intacto. */}
            {completado && resultadoCerradoDe !== claveQuiz && (
                <ResultadoOverlay
                    aciertos={aciertos}
                    total={total}
                    puntosGanados={puntosGanados}
                    xp={xpIntento ?? { estado: 'cargando' }}
                    detalle={`${aciertos} de ${total} correctas`}
                    onRevisar={() => {
                        setResultadoCerradoDe(claveQuiz);
                        // Al cerrar, el foco pasa al botón de reabrir (C2):
                        // tras el commit en que el overlay ya se desmontó.
                        requestAnimationFrame(() => reabrirRef.current?.focus());
                    }}
                    onContinuar={onSalir}
                    etiquetaContinuar="Otros quizzes"
                />
            )}
            {completado && resultadoCerradoDe === claveQuiz && (
                <button
                    type="button"
                    ref={reabrirRef}
                    className="resultado-reabrir"
                    onClick={() => setResultadoCerradoDe(null)}
                >
                    🏅 Ver mi resultado
                </button>
            )}

            {preguntasJugables.map((p, i) => (
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
