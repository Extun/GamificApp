import { useEffect, useMemo, useRef, useState } from 'react';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded';
import TouchAppRoundedIcon from '@mui/icons-material/TouchAppRounded';
import gamificationService from '../../services/gamificationService';
import { LogroToast } from '../quiz/QuizInteractivo';
import { COLORES_CATEGORIA } from './EditorClasificador';
import './juegoDragAndDrop.css';

// Reproductor del juego 'Clasificador de Objetos' (estudiantes de 6-9 años).
// Consume la `configuracion` que el docente publicó en `retos` y, al terminar,
// persiste los puntos con gamificationService.guardarProgreso().
//
// Interacción doble para inclusión total:
//  · Arrastrar y soltar (mouse / pantallas táctiles modernas vía HTML5 DnD).
//  · Tocar el elemento y luego tocar la canasta (más fácil para los pequeños).
//
// Puntaje: cada elemento clasificado bien AL PRIMER INTENTO vale
// PUNTOS_POR_ACIERTO XP; equivocarse hace "rebotar" el elemento y ya no puntúa,
// pero el juego continúa hasta clasificar todo (siempre se termina ganando).

// Mezcla no destructiva (Fisher–Yates) para que cada partida sea distinta.
const mezclar = (arr) => {
    const copia = [...arr];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
};

// Separa el emoji inicial (si lo hay) del texto, para pintarlo en grande.
const partirEmoji = (texto) => {
    const match = texto.match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u);
    return match ? { emoji: match[1], label: match[2] || '' } : { emoji: null, label: texto };
};

// `soloPrueba` (SPEC-012): vista previa del docente — se juega igual pero no
// se otorga XP ni se guarda progreso.
export function JuegoDragAndDrop({ reto, estudianteId, onSalir, onCompletado, soloPrueba = false }) {
    const categorias = reto?.configuracion?.categorias || [];

    // Aplana la configuración del docente en fichas jugables y las mezcla.
    // Se recalcula solo al cambiar de reto (o al reiniciar la partida).
    const [semilla, setSemilla] = useState(0);
    const fichas = useMemo(() => mezclar(
        categorias.flatMap((cat, catIdx) =>
            cat.elementos.map((texto, i) => ({
                id: `${catIdx}-${i}`,
                texto,
                categoria: cat.nombre
            }))
        )
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [reto?.id, semilla]);

    const [colocadas, setColocadas] = useState({});          // fichaId -> nombre de categoría
    const [conError, setConError] = useState(() => new Set()); // fichas que fallaron alguna vez
    const [seleccionada, setSeleccionada] = useState(null);  // fallback táctil
    const [rebotando, setRebotando] = useState(null);        // ficha en animación de error
    const [canastaFeliz, setCanastaFeliz] = useState(null);  // canasta en animación de acierto
    const [puntosGanados, setPuntosGanados] = useState(0);
    const [toast, setToast] = useState(null);

    const pendientes = fichas.filter((f) => !colocadas[f.id]);
    const total = fichas.length;
    const aciertos = fichas.filter((f) => colocadas[f.id] && !conError.has(f.id)).length;
    const completado = total > 0 && pendientes.length === 0;

    const reiniciar = () => {
        setColocadas({});
        setConError(new Set());
        setSeleccionada(null);
        setRebotando(null);
        setCanastaFeliz(null);
        setPuntosGanados(0);
        setSemilla((s) => s + 1);
    };

    // Intento de clasificación (vía drag & drop o vía toque). Feedback:
    // acierto → la ficha "aterriza" en la canasta y esta celebra;
    // error → la ficha rebota en su sitio y la canasta se sacude.
    const intentar = (fichaId, nombreCategoria) => {
        const ficha = fichas.find((f) => f.id === fichaId);
        if (!ficha || colocadas[ficha.id]) return;
        setSeleccionada(null);

        if (ficha.categoria === nombreCategoria) {
            setColocadas((prev) => ({ ...prev, [ficha.id]: nombreCategoria }));
            setCanastaFeliz(nombreCategoria);
            setTimeout(() => setCanastaFeliz(null), 600);
        } else {
            setConError((prev) => new Set(prev).add(ficha.id));
            setRebotando(ficha.id);
            setTimeout(() => setRebotando(null), 600);
        }
    };

    // Al completar: XP local + persistencia en la BD central (las misiones
    // desbloqueadas llegan en la respuesta del servidor).
    const recompensado = useRef(false);
    useEffect(() => {
        if (!completado || recompensado.current) return;
        recompensado.current = true;

        if (soloPrueba) {
            // Puntaje simulado: la pantalla final se ve igual, nada se guarda.
            setPuntosGanados(aciertos * 100);
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
            setToast({ mensaje: '¡Clasificación perfecta! 🌟' });
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
    }, [completado, aciertos, total, estudianteId, reto, onCompletado, soloPrueba]);

    // Permite reintentar tras reiniciar la partida.
    useEffect(() => {
        recompensado.current = false;
    }, [semilla, reto?.id]);

    if (!categorias.length) {
        return <p className="vacio-msg">Este juego no tiene configuración válida.</p>;
    }

    const estrellas = total ? Math.max(1, Math.round((aciertos / total) * 3)) : 0;

    return (
        <div className="juego-dnd">
            {!completado && (
                <p className="juego-dnd-instruccion">
                    <TouchAppRoundedIcon sx={{ fontSize: '1.2rem' }} />
                    Arrastra cada tarjeta a su canasta (o tócala y luego toca la canasta).
                </p>
            )}

            {/* Marcador de avance */}
            <div className="juego-dnd-avance">
                <div className="progress-track">
                    <div
                        className="progress-fill progress-fill-accent"
                        style={{ width: `${total ? ((total - pendientes.length) / total) * 100 : 0}%` }}
                    />
                </div>
                <span>{total - pendientes.length} / {total}</span>
            </div>

            {/* Canastas (zonas de drop) */}
            <div className="juego-dnd-canastas">
                {categorias.map((cat, i) => {
                    const color = COLORES_CATEGORIA[i % COLORES_CATEGORIA.length];
                    const dentro = fichas.filter((f) => colocadas[f.id] === cat.nombre);
                    return (
                        <div
                            key={cat.nombre}
                            className={`juego-canasta juego-canasta-${color} ${canastaFeliz === cat.nombre ? 'is-feliz' : ''} ${seleccionada ? 'is-esperando' : ''}`}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                intentar(e.dataTransfer.getData('text/plain'), cat.nombre);
                            }}
                            onClick={() => seleccionada && intentar(seleccionada, cat.nombre)}
                        >
                            <h4 className="juego-canasta-titulo">{cat.nombre}</h4>
                            <div className="juego-canasta-contenido">
                                {dentro.map((f) => {
                                    const { emoji, label } = partirEmoji(f.texto);
                                    return (
                                        <span key={f.id} className="juego-ficha is-colocada">
                                            {emoji && <span className="juego-ficha-emoji">{emoji}</span>}
                                            {label}
                                        </span>
                                    );
                                })}
                                {dentro.length === 0 && <span className="juego-canasta-vacia">Suelta aquí</span>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Bandeja de fichas pendientes */}
            {!completado && (
                <div className="juego-dnd-bandeja">
                    {pendientes.map((f) => {
                        const { emoji, label } = partirEmoji(f.texto);
                        return (
                            <button
                                key={f.id}
                                type="button"
                                draggable
                                className={`juego-ficha ${seleccionada === f.id ? 'is-seleccionada' : ''} ${rebotando === f.id ? 'is-rebote' : ''}`}
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('text/plain', f.id);
                                    setSeleccionada(null);
                                }}
                                onClick={() => setSeleccionada((prev) => (prev === f.id ? null : f.id))}
                            >
                                {emoji && <span className="juego-ficha-emoji">{emoji}</span>}
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Pantalla de celebración final */}
            {completado && (
                <div className="juego-dnd-final">
                    <EmojiEventsRoundedIcon className="juego-dnd-final-trofeo" />
                    <div className="juego-dnd-estrellas" aria-label={`${estrellas} de 3 estrellas`}>
                        {[1, 2, 3].map((n) => (
                            <StarRoundedIcon key={n} className={n <= estrellas ? 'is-ganada' : ''} />
                        ))}
                    </div>
                    <strong>¡Lo lograste!</strong>
                    <p>
                        {aciertos} de {total} al primer intento · +{puntosGanados} XP
                    </p>
                    <div className="juego-dnd-final-acciones">
                        <button type="button" className="juego-dnd-btn" onClick={reiniciar}>
                            <ReplayRoundedIcon sx={{ fontSize: '1.1rem' }} /> Jugar otra vez
                        </button>
                        {onSalir && (
                            <button type="button" className="juego-dnd-btn juego-dnd-btn-ghost" onClick={onSalir}>
                                Volver a los juegos
                            </button>
                        )}
                    </div>
                </div>
            )}

            {toast && <LogroToast {...toast} onClose={() => setToast(null)} />}
        </div>
    );
}
