// Bloque compartido de resultado final de una actividad (los 6 juegos):
// calificación académica sobre 100 (jerarquía principal) + retroalimentación
// por rango + XP como recompensa gamificada, claramente separados.
// NO calcula ni entrega XP: solo presenta lo que el reproductor ya obtuvo.
import { calificacionDe, retroalimentacionDe } from './calificacion';
import './resultadoActividad.css';

export function ResultadoActividad({ aciertos, total, puntosGanados, detalle }) {
    const nota = calificacionDe(aciertos, total);
    const retro = retroalimentacionDe(nota);

    return (
        <div className={`resultado-actividad resultado-${retro.rango}`}>
            <div className="resultado-nota">
                <span className="resultado-nota-label">Tu calificación</span>
                <span className="resultado-nota-valor">
                    {nota} <small>/ 100</small>
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

            <div className="resultado-xp">
                <span className="resultado-xp-label">XP obtenido</span>
                <span className="resultado-xp-valor">+{puntosGanados} XP</span>
            </div>
        </div>
    );
}
