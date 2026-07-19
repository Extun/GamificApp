// Vista previa "como estudiante" (SPEC-012 Fase 2 → SPEC-017 Fase 2): monta el
// reproductor REAL del tipo dado dentro de un modal, alimentado con la
// configuración del borrador EN MEMORIA (no hace falta publicar). Corre en modo
// prueba (`soloPrueba`): se juega exactamente igual, pero no se otorga XP ni se
// escribe progreso (`estudianteId` va en null y los reproductores cortan la
// recompensa).
//
// SPEC-017: el reproductor y sus props salen del registro. Un juego nuevo se
// previsualiza solo, sin tocar este archivo.
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { ModalPanel } from '../dashboard/DashboardWidgets';
import { EmptyState } from '../dashboard/DashboardWidgets';
import { obtenerJuego, etiquetaTipo } from './registro';
import './selectorBanco.css';

export function PreviewJuegoModal({ tipo, titulo, configuracion, onCerrar }) {
    // Reto simulado con la MISMA forma que reciben los reproductores desde la
    // BD. Sin `id`: nada de lo que pase aquí puede asociarse a un reto real.
    const retoPrueba = { titulo: titulo || 'Vista previa', tipo, configuracion };
    const comunes = { reto: retoPrueba, estudianteId: null, soloPrueba: true, onSalir: onCerrar };

    const def = obtenerJuego(tipo);
    const Player = def?.Player;
    const props = def?.propsPlayer
        ? def.propsPlayer({ reto: retoPrueba, configuracion, comunes })
        : comunes;

    return (
        <ModalPanel
            className="preview-juego-modal"
            titulo={`Vista previa · ${etiquetaTipo(tipo)}`}
            subtitulo="Así lo vivirá el estudiante. Es solo una prueba: no suma XP ni guarda progreso."
            avatar={<VisibilityRoundedIcon />}
            onCerrar={onCerrar}
        >
            {Player
                ? <Player {...props} />
                : <EmptyState
                    titulo="Este tipo de actividad no se puede previsualizar"
                    descripcion="No hay un reproductor disponible para este tipo en esta versión de la aplicación."
                />}
        </ModalPanel>
    );
}

export default PreviewJuegoModal;
