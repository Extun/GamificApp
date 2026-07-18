// Modal "⚙ Configuración" de una actividad (SPEC-013): las opciones que no son
// contenido (mezclas, preguntas por intento, dificultad, curso) viven en un
// popup disparado desde la barra de acciones, junto a "Vista previa", en vez
// de ocupar espacio dentro del editor. Cada editor decide qué campos mostrar
// (children); este componente solo da el marco visual consistente.
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import { ModalPanel } from '../dashboard/DashboardWidgets';

export function ModalConfigActividad({ onCerrar, children, subtitulo }) {
    return (
        <ModalPanel
            className="config-actividad-modal"
            titulo="Configuración"
            subtitulo={subtitulo || 'Los cambios se guardan automáticamente.'}
            avatar={<SettingsRoundedIcon />}
            onCerrar={onCerrar}
        >
            <div className="config-actividad-body">{children}</div>
        </ModalPanel>
    );
}

export default ModalConfigActividad;
