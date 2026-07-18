import { useRef, useState } from 'react';
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded';
import gamificationService, { PUNTOS_POR_ACIERTO } from '../../services/gamificationService';
import { LogroToast } from '../quiz/QuizInteractivo';
import { ResultadoActividad } from '../juegos/ResultadoActividad';
import './misionNarrativa.css';

// Reproductor de Misiones Narrativas (estilo aventura gráfica / RPG por
// capítulos). Consume la `configuracion` publicada en `retos` (tipo 'mision'):
// { titulo, introduccion, desafios: [...], final }.
//
// Filosofía de puntaje (igual que el Clasificador): equivocarse NO bloquea la
// aventura — aparece una pista y el niño reintenta hasta acertar, pero solo
// los aciertos AL PRIMER INTENTO suman XP. Siempre se termina ganando.
// Al superar el último desafío se ejecuta el flujo único completarReto():
// XP local + logros + persistencia en MySQL (ranking en tiempo real).

const LETRAS = ['A', 'B', 'C'];

// `soloPrueba` (SPEC-012): vista previa del docente — se juega igual pero no
// se otorga XP ni se guarda progreso.
export function MisionNarrativa({ reto, estudianteId, onSalir, onCompletado, soloPrueba = false }) {
    const mision = reto?.configuracion || {};
    const desafios = mision.desafios || [];
    const total = desafios.length;

    // fase: 'intro' | 'jugando' | 'final'
    const [fase, setFase] = useState('intro');
    const [capitulo, setCapitulo] = useState(0);     // índice del desafío activo
    const [elegida, setElegida] = useState(null);    // letra elegida en el intento actual
    const [fallidos, setFallidos] = useState(() => new Set()); // desafíos con algún error
    const [superado, setSuperado] = useState(false); // el desafío activo ya se resolvió
    const [puntosGanados, setPuntosGanados] = useState(0);
    const [toast, setToast] = useState(null);

    const desafio = desafios[capitulo];
    const correcta = String(desafio?.correcta || '').trim().toUpperCase();
    const aciertos = total - fallidos.size;

    // Evita otorgar XP/registrar progreso más de una vez por partida.
    const recompensado = useRef(false);

    const reiniciar = () => {
        recompensado.current = false;
        setFase('intro');
        setCapitulo(0);
        setElegida(null);
        setFallidos(new Set());
        setSuperado(false);
        setPuntosGanados(0);
    };

    const responder = (letra) => {
        if (superado) return;
        setElegida(letra);
        if (letra === correcta) {
            setSuperado(true);
        } else {
            // Marca el capítulo como fallado (ya no puntúa) pero deja reintentar.
            setFallidos((prev) => new Set(prev).add(capitulo));
        }
    };

    // Al superar el último capítulo: flujo único de gamificación
    // (XP local + logros + persistencia en MySQL vía completarReto).
    // Se dispara desde el handler del botón, así que corre una sola vez
    // por partida (recompensado la protege ante dobles clics).
    const terminarMision = () => {
        setFase('final');
        if (recompensado.current) return;
        recompensado.current = true;

        if (soloPrueba) {
            // Puntaje simulado: la pantalla final se ve igual, nada se guarda.
            setPuntosGanados(aciertos * PUNTOS_POR_ACIERTO);
            setToast({ titulo: 'Modo prueba', mensaje: 'Nada se guardó: así lo verá el estudiante.' });
            return;
        }

        const { puntos, servidor } = gamificationService.completarReto({
            estudianteId,
            reto,
            aciertos
        });
        setPuntosGanados(puntos);

        if (aciertos === total) {
            setToast({ mensaje: 'Maestro de la Materia' });
        }

        servidor.then((data) => {
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
    };

    const avanzar = () => {
        if (capitulo + 1 < total) {
            setCapitulo((c) => c + 1);
            setElegida(null);
            setSuperado(false);
        } else {
            terminarMision();
        }
    };

    if (!total) {
        return <p className="vacio-msg">Esta misión aún no tiene desafíos.</p>;
    }

    return (
        <div className="mision-rpg">
            {/* ---- Portada / introducción ---- */}
            {fase === 'intro' && (
                <div className="mision-escena mision-portada">
                    <AutoStoriesRoundedIcon className="mision-portada-icono" />
                    <h2>{mision.titulo || reto.titulo}</h2>
                    <p className="mision-texto">{mision.introduccion}</p>
                    <button className="mision-btn" onClick={() => setFase('jugando')}>
                        Comenzar la aventura <ArrowForwardRoundedIcon sx={{ fontSize: '1.1rem' }} />
                    </button>
                </div>
            )}

            {/* ---- Capítulos / desafíos ---- */}
            {fase === 'jugando' && desafio && (
                <div className="mision-escena">
                    <div className="mision-progreso">
                        {desafios.map((_, i) => (
                            <span
                                key={i}
                                className={`mision-paso ${i < capitulo ? 'is-hecho' : ''} ${i === capitulo ? 'is-activo' : ''}`}
                            />
                        ))}
                        <span className="mision-progreso-label">Capítulo {capitulo + 1} de {total}</span>
                    </div>

                    <p className="mision-texto mision-narrativa">{desafio.narrativa}</p>
                    <p className="mision-pregunta">{desafio.pregunta}</p>

                    <div className="mision-opciones">
                        {LETRAS.map((letra) => {
                            const texto = desafio.alternativas?.[letra];
                            if (!texto) return null;
                            let estado = '';
                            if (superado && letra === correcta) estado = 'opcion-correcta';
                            else if (!superado && elegida === letra) estado = 'opcion-incorrecta';
                            else if (superado) estado = 'opcion-atenuada';
                            return (
                                <button
                                    key={letra}
                                    type="button"
                                    className={`opcion-quiz ${estado}`}
                                    onClick={() => responder(letra)}
                                    disabled={superado}
                                >
                                    <span className="opcion-letra">{letra}</span>
                                    <span className="opcion-texto">{texto}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Error: pista amable y reintento (el capítulo ya no puntúa). */}
                    {!superado && elegida && elegida !== correcta && (
                        <div className="pregunta-justificacion mision-pista">
                            <LightbulbRoundedIcon className="justificacion-icono" />
                            <div>
                                <strong>¡Casi! Inténtalo otra vez.</strong>
                                <p>{desafio.pista}</p>
                            </div>
                        </div>
                    )}

                    {/* Acierto: celebración narrativa + avanzar la historia. */}
                    {superado && (
                        <div className="mision-exito">
                            <p className="mision-texto">{desafio.exito}</p>
                            <button className="mision-btn" onClick={avanzar}>
                                {capitulo + 1 < total ? 'Continuar la historia' : 'Ver el final'}
                                <ArrowForwardRoundedIcon sx={{ fontSize: '1.1rem' }} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ---- Final de la aventura ---- */}
            {fase === 'final' && (
                <div className="mision-escena mision-portada">
                    <EmojiEventsRoundedIcon className="mision-portada-icono mision-icono-oro" />
                    <h2>¡Misión cumplida!</h2>
                    <p className="mision-texto">{mision.final}</p>
                    {/* Calificación /100 (desafíos al primer intento) +
                        retroalimentación por rango + XP separado. */}
                    <ResultadoActividad
                        aciertos={aciertos}
                        total={total}
                        puntosGanados={puntosGanados}
                        detalle={`${aciertos} de ${total} desafíos al primer intento`}
                    />
                    <div className="mision-final-acciones">
                        <button className="mision-btn mision-btn-secundario" onClick={reiniciar}>
                            <ReplayRoundedIcon sx={{ fontSize: '1.1rem' }} /> Jugar de nuevo
                        </button>
                        {onSalir && (
                            <button className="mision-btn" onClick={onSalir}>
                                Otras misiones
                            </button>
                        )}
                    </div>
                </div>
            )}

            {toast && <LogroToast {...toast} onClose={() => setToast(null)} />}
        </div>
    );
}
