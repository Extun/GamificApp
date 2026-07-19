// Resultado final de una actividad: calificación académica sobre 100
// (jerarquía principal) + retroalimentación por rango + XP como recompensa
// gamificada, claramente separados. NO calcula ni entrega XP: solo presenta.
//
// Dos presentaciones:
//  · <ResultadoActividad>  — tarjeta incrustada (la usan las pantallas
//    finales de los juegos desde la primera fase).
//  · <ResultadoOverlay>    — momento de cierre gamificado (piloto: Quiz):
//    capa sobre la actividad con animación de entrada, contador de nota,
//    celebración según desempeño y acciones configurables por callbacks.
import { useEffect, useRef, useState } from 'react';
import { calificacionDe, retroalimentacionDe } from './calificacion';
import './resultadoActividad.css';

const prefiereMenosMovimiento = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Contador 0→nota con requestAnimationFrame (sin librerías). Con
// prefers-reduced-motion la nota aparece directa, sin contar.
function useContador(objetivo, activo) {
    const [valor, setValor] = useState(activo && !prefiereMenosMovimiento() ? 0 : objetivo);
    useEffect(() => {
        // Todas las actualizaciones ocurren dentro de requestAnimationFrame
        // (nunca síncronas en el efecto). Sin animación, un solo frame fija
        // la nota final directamente.
        const duracion = (!activo || prefiereMenosMovimiento()) ? 0 : 900;
        let raf;
        const inicio = performance.now();
        const tick = (ahora) => {
            const p = duracion === 0 ? 1 : Math.min(1, (ahora - inicio) / duracion);
            // Easing suave (cúbico de salida): rápido al inicio, se asienta al final.
            setValor(Math.round(objetivo * (1 - Math.pow(1 - p, 3))));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [objetivo, activo]);
    return valor;
}

// Cuerpo compartido por la tarjeta y el overlay. `animado` activa el contador
// y la aparición escalonada (solo en el overlay).
//
// `xp` (SPEC-015, opcional) describe lo que el backend REALMENTE acreditó:
//   { estado: 'cargando' | 'ganado' | 'sinCambio' | 'completo', ganado }
// Sin `xp`, se muestra `puntosGanados` como chip normal (compatibilidad con
// la tarjeta incrustada de los juegos aún no migrados).
function ChipXP({ xp }) {
    if (xp.estado === 'cargando') {
        return (
            <div className="resultado-xp resultado-xp-secundario" role="status">
                <span className="resultado-xp-label">Guardando tu XP…</span>
            </div>
        );
    }
    if (xp.estado === 'sinConfirmar') {
        // Falla de red/servidor: la calificación (local) sí es real, pero el
        // XP no se confirmó — nunca se muestra una estimación como acreditada.
        return (
            <p className="resultado-xp-mensaje" role="status">
                No pudimos confirmar tu XP en este momento. Inténtalo de nuevo cuando tengas conexión.
            </p>
        );
    }
    if (xp.estado === 'sinCambio') {
        return (
            <p className="resultado-xp-mensaje" role="status">
                Esta vez no sumaste XP adicional. ¡Supera tu mejor resultado para conseguir más!
            </p>
        );
    }
    if (xp.estado === 'completo') {
        return (
            <p className="resultado-xp-mensaje resultado-xp-completo" role="status">
                🌟 ¡Ya conseguiste todo el XP disponible en esta actividad!
            </p>
        );
    }
    return (
        <div className="resultado-xp">
            <span className="resultado-xp-label">XP obtenido</span>
            <span className="resultado-xp-valor">+{xp.ganado} XP</span>
        </div>
    );
}

function CuerpoResultado({ aciertos, total, puntosGanados, detalle, animado = false, xp }) {
    const nota = calificacionDe(aciertos, total);
    const retro = retroalimentacionDe(nota, { aciertos, total });
    const notaMostrada = useContador(nota, animado);
    const infoXP = xp || { estado: 'ganado', ganado: puntosGanados };

    return (
        <div className={`resultado-cuerpo resultado-${retro.rango} ${animado ? 'resultado-animado' : ''}`}>
            <div className="resultado-nota">
                <span className="resultado-nota-label">Tu calificación</span>
                <span className="resultado-nota-valor">
                    {notaMostrada} <small>/ 100</small>
                </span>
                <span className="resultado-nota-detalle">
                    {detalle || `${aciertos} de ${total} al primer intento`}
                </span>
            </div>

            <p className="resultado-retro" role="status">
                <span className="resultado-retro-emoji" aria-hidden="true">{retro.emoji}</span>
                <span>
                    <strong>{retro.titulo}</strong> {retro.mensaje}
                </span>
            </p>

            <ChipXP xp={infoXP} />
        </div>
    );
}

// Tarjeta incrustada (compatibilidad con las pantallas finales de los juegos).
export function ResultadoActividad({ aciertos, total, puntosGanados, detalle }) {
    return (
        <div className="resultado-actividad">
            <CuerpoResultado
                aciertos={aciertos}
                total={total}
                puntosGanados={puntosGanados}
                detalle={detalle}
            />
        </div>
    );
}

// Confeti ligero en CSS puro (solo nota 100 y sin reduced-motion): 12
// partículas con los colores/emoji del tema, sin canvas ni dependencias.
function ConfetiLigero() {
    if (prefiereMenosMovimiento()) return null;
    return (
        <div className="resultado-confeti" aria-hidden="true">
            {['🎉', '⭐', '🎊', '✨', '⭐', '🎉', '✨', '🎊', '⭐', '✨', '🎉', '⭐'].map((e, i) => (
                <span key={i} style={{ '--i': i }}>{e}</span>
            ))}
        </div>
    );
}

// Overlay de cierre. Acciones por callbacks: las que no llegan no se muestran
// (p. ej. vista previa del docente sin navegación). Escape = onRevisar
// (cerrar para revisar es una acción válida en el Quiz).
export function ResultadoOverlay({
    aciertos,
    total,
    puntosGanados,
    detalle,
    xp,
    onRevisar,
    etiquetaRevisar = 'Revisar respuestas',
    onContinuar,
    etiquetaContinuar = 'Continuar'
}) {
    const nota = calificacionDe(aciertos, total);
    const dialogoRef = useRef(null);

    // Bloquea el scroll del fondo mientras el overlay está abierto y lo
    // restaura exactamente como estaba al cerrar o desmontar.
    useEffect(() => {
        const previo = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previo; };
    }, []);

    // Foco inicial en el diálogo; al cerrar, vuelve al elemento que lo tenía
    // (si sigue en pantalla y es enfocable — p. ej. no un botón deshabilitado).
    useEffect(() => {
        const previo = document.activeElement;
        dialogoRef.current?.focus();
        return () => {
            if (previo instanceof HTMLElement && previo.isConnected && !previo.disabled) {
                previo.focus();
            }
        };
    }, []);
    useEffect(() => {
        if (!onRevisar) return;
        const onTecla = (e) => {
            if (e.key === 'Escape') onRevisar();
        };
        window.addEventListener('keydown', onTecla);
        return () => window.removeEventListener('keydown', onTecla);
    }, [onRevisar]);

    return (
        <div className="resultado-overlay">
            <div
                ref={dialogoRef}
                className={`resultado-dialogo ${nota === 100 ? 'es-perfecto' : nota >= 71 ? 'es-alto' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label="Resultado de la actividad"
                tabIndex={-1}
            >
                {nota === 100 && <ConfetiLigero />}
                <p className="resultado-titulo">¡Actividad completada!</p>

                <CuerpoResultado
                    aciertos={aciertos}
                    total={total}
                    puntosGanados={puntosGanados}
                    detalle={detalle}
                    xp={xp}
                    animado
                />

                <div className="resultado-acciones">
                    {onRevisar && (
                        <button type="button" className="resultado-btn resultado-btn-ghost" onClick={onRevisar}>
                            {etiquetaRevisar}
                        </button>
                    )}
                    {onContinuar && (
                        <button type="button" className="resultado-btn" onClick={onContinuar}>
                            {etiquetaContinuar}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
