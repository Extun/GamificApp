// Vista previa "como estudiante" (SPEC-012, Fase 2): monta el reproductor
// REAL del tipo dado dentro de un modal, alimentado con la configuración del
// borrador EN MEMORIA (no hace falta publicar). Corre en modo prueba
// (`soloPrueba`): se juega exactamente igual, pero no se otorga XP ni se
// escribe progreso (`estudianteId` va en null y los reproductores cortan la
// recompensa).
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { ModalPanel } from '../dashboard/DashboardWidgets';
import { QuizInteractivo } from '../quiz/QuizInteractivo';
import { MisionNarrativa } from '../mision/MisionNarrativa';
import { JuegoDragAndDrop } from '../clasificador/JuegoDragAndDrop';
import { Memorama } from './Memorama';
import { LineaTiempo } from './LineaTiempo';
import { CompletarEspacios } from './CompletarEspacios';
import { etiquetaTipo } from './registroJuegos';
import './selectorBanco.css';

export function PreviewJuegoModal({ tipo, titulo, configuracion, onCerrar }) {
    // Reto simulado con la MISMA forma que reciben los reproductores desde la
    // BD. Sin `id`: nada de lo que pase aquí puede asociarse a un reto real.
    const retoPrueba = { titulo: titulo || 'Vista previa', tipo, configuracion };

    const comunes = { reto: retoPrueba, estudianteId: null, soloPrueba: true, onSalir: onCerrar };

    return (
        <ModalPanel
            className="preview-juego-modal"
            titulo={`Vista previa · ${etiquetaTipo(tipo)}`}
            subtitulo="Así lo vivirá el estudiante. Es solo una prueba: no suma XP ni guarda progreso."
            avatar={<VisibilityRoundedIcon />}
            onCerrar={onCerrar}
        >
            {tipo === 'quiz' && (
                <QuizInteractivo
                    preguntas={configuracion?.preguntas || []}
                    mostrarPuntaje
                    reto={retoPrueba}
                    estudianteId={null}
                    soloPrueba
                />
            )}
            {tipo === 'mision' && <MisionNarrativa {...comunes} />}
            {tipo === 'clasificador' && <JuegoDragAndDrop {...comunes} />}
            {tipo === 'memorama' && <Memorama {...comunes} />}
            {tipo === 'linea-tiempo' && <LineaTiempo {...comunes} />}
            {tipo === 'completar' && <CompletarEspacios {...comunes} />}
        </ModalPanel>
    );
}

export default PreviewJuegoModal;
