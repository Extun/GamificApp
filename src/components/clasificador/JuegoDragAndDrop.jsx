import { useMemo, useState } from 'react';
import TouchAppRoundedIcon from '@mui/icons-material/TouchAppRounded';
import { useRecompensa, useReporteIntento, PantallaFinal, LogroToast } from '../juegos/juegosComunes';
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
export function JuegoDragAndDrop({ reto, estudianteId, onSalir, onCompletado, soloPrueba = false, onEstadoIntento }) {
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

    const pendientes = fichas.filter((f) => !colocadas[f.id]);
    const total = fichas.length;
    const aciertos = fichas.filter((f) => colocadas[f.id] && !conError.has(f.id)).length;
    const completado = total > 0 && pendientes.length === 0;

    // Recompensa unificada (mismo flujo que memorama/línea/completar): XP
    // confirmado por el backend + toasts, idempotente por partida.
    const { puntosGanados, toast, setToast, xpIntento } = useRecompensa({
        completado, estudianteId, reto, tipo: 'clasificador', aciertos, total, semilla, onCompletado, soloPrueba
    });

    // Guardia de salida: hay progreso real desde la primera ficha colocada o
    // el primer error (ambos afectan el puntaje del intento).
    useReporteIntento(
        onEstadoIntento,
        !soloPrueba && !completado && (Object.keys(colocadas).length > 0 || conError.size > 0)
    );

    const reiniciar = () => {
        setColocadas({});
        setConError(new Set());
        setSeleccionada(null);
        setRebotando(null);
        setCanastaFeliz(null);
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

    if (!categorias.length) {
        return <p className="vacio-msg">Este juego no tiene configuración válida.</p>;
    }

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
                            // Accesible por teclado: la zona de drop es un <div>, así
                            // que se expone como botón (role + tabIndex) y Enter/Espacio
                            // replican EXACTAMENTE el onClick (soltar la ficha elegida en
                            // esta canasta). Completa el flujo inclusivo "tocar y soltar"
                            // para quien navega con teclado. No cambia la mecánica.
                            role="button"
                            tabIndex={0}
                            aria-label={`Canasta ${cat.nombre}`}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                intentar(e.dataTransfer.getData('text/plain'), cat.nombre);
                            }}
                            onClick={() => seleccionada && intentar(seleccionada, cat.nombre)}
                            onKeyDown={(e) => {
                                if ((e.key === 'Enter' || e.key === ' ') && seleccionada) {
                                    e.preventDefault();
                                    intentar(seleccionada, cat.nombre);
                                }
                            }}
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

            {/* Pantalla de celebración final compartida (overlay + trofeo). */}
            {completado && (
                <PantallaFinal
                    aciertos={aciertos}
                    total={total}
                    puntosGanados={puntosGanados}
                    xp={xpIntento}
                    detalle={`${aciertos} de ${total} al primer intento`}
                    etiquetaRevisar="Ver mis estrellas"
                    onReiniciar={reiniciar}
                    onSalir={onSalir}
                />
            )}

            {toast && <LogroToast {...toast} onClose={() => setToast(null)} />}
        </div>
    );
}
