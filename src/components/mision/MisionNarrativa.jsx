import { useState } from 'react';
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import { useRecompensa, useReporteIntento, LogroToast } from '../juegos/juegosComunes';
import { ResultadoCierre } from '../juegos/ResultadoActividad';
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
export function MisionNarrativa({ reto, estudianteId, onSalir, onCompletado, soloPrueba = false, onEstadoIntento }) {
    const mision = reto?.configuracion || {};
    const desafios = mision.desafios || [];
    const total = desafios.length;

    // fase: 'intro' | 'jugando' | 'final'
    const [fase, setFase] = useState('intro');
    const [capitulo, setCapitulo] = useState(0);     // índice del desafío activo
    const [elegida, setElegida] = useState(null);    // letra elegida en el intento actual
    const [fallidos, setFallidos] = useState(() => new Set()); // desafíos con algún error
    const [superado, setSuperado] = useState(false); // el desafío activo ya se resolvió
    const [semilla, setSemilla] = useState(0);       // nº de partida (reinicia la recompensa)

    const desafio = desafios[capitulo];
    const correcta = String(desafio?.correcta || '').trim().toUpperCase();
    const aciertos = total - fallidos.size;

    // Recompensa unificada (mismo flujo que los demás juegos): al llegar a la
    // fase final otorga una sola vez, con XP confirmado por el backend.
    const { puntosGanados, toast, setToast, xpIntento } = useRecompensa({
        completado: fase === 'final',
        estudianteId, reto, tipo: 'mision', aciertos, total, semilla, onCompletado, soloPrueba
    });

    // Guardia de salida: hay progreso real desde la primera respuesta (la
    // portada/introducción todavía no compromete nada).
    useReporteIntento(
        onEstadoIntento,
        !soloPrueba && fase === 'jugando' && (capitulo > 0 || elegida !== null || superado || fallidos.size > 0)
    );

    const reiniciar = () => {
        setFase('intro');
        setCapitulo(0);
        setElegida(null);
        setFallidos(new Set());
        setSuperado(false);
        setSemilla((s) => s + 1);
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

    const avanzar = () => {
        if (capitulo + 1 < total) {
            setCapitulo((c) => c + 1);
            setElegida(null);
            setSuperado(false);
        } else {
            // La recompensa la dispara useRecompensa al entrar a la fase final.
            setFase('final');
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
                    <div className="mision-capitulos">
                        {desafios.map((_, i) => (
                            <span
                                key={i}
                                className={`mision-paso ${i < capitulo ? 'is-hecho' : ''} ${i === capitulo ? 'is-activo' : ''}`}
                            />
                        ))}
                        <span className="mision-capitulos-label">Capítulo {capitulo + 1} de {total}</span>
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
                    {/* Overlay gamificado sobre el final narrativo; cerrarlo
                        deja la escena final a la vista (con reabrir). */}
                    <ResultadoCierre
                        aciertos={aciertos}
                        total={total}
                        puntosGanados={puntosGanados}
                        xp={xpIntento ?? { estado: 'cargando' }}
                        detalle={`${aciertos} de ${total} desafíos al primer intento`}
                        etiquetaRevisar="Ver el final de la historia"
                        onReintentar={reiniciar}
                        etiquetaReintentar="Jugar de nuevo"
                        onContinuar={onSalir}
                        etiquetaContinuar="Otras misiones"
                    />
                    <EmojiEventsRoundedIcon className="mision-portada-icono mision-icono-oro" />
                    <h2>¡Misión cumplida!</h2>
                    {/* La escena final (narrativa propia de la misión) queda a
                        la vista al cerrar el overlay; la calificación, la
                        retroalimentación y el XP viven SOLO en el overlay,
                        reabrible con "Ver mi resultado". */}
                    <p className="mision-texto">{mision.final}</p>
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
