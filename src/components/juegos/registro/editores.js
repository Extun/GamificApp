// Editor del docente por tipo de juego (SPEC-017, Fase 3).
//
// Vive SEPARADO de los archivos de tipo a propósito: `GeneradorActividadIA`
// importa el registro, así que si los tipos importaran editores tendríamos un
// ciclo (registro → tipo → editor → registro). Aquí el sentido es único:
// editores.jsx → editores → registro.
//
// IMPORTANTE: `GeneradorActividadIA` es el editor POR DEFECTO. Un juego nuevo
// cuyo contenido sea una lista de ítems (lo habitual) NO necesita tocar este
// archivo: basta con que declare su bloque `edicion` en su tipo del registro.
// Solo se añade una entrada aquí si el juego necesita un editor a medida.
import { GeneradorQuiz } from '../../../pages/admin/GeneradorQuiz';
import { GeneradorMision } from '../../../pages/admin/GeneradorMision';
import { EditorClasificador } from '../../clasificador/EditorClasificador';
import { GeneradorActividadIA } from '../GeneradorActividadIA';

// Editores a medida (contenido que no es una lista simple de ítems).
const EDITORES_PROPIOS = {
    quiz: GeneradorQuiz,
    mision: GeneradorMision,
    clasificador: EditorClasificador
};

export const EDITOR_GENERICO = GeneradorActividadIA;

export const obtenerEditor = (tipo) => EDITORES_PROPIOS[tipo] || EDITOR_GENERICO;

// ¿Este tipo usa un editor a medida? (para diagnóstico del panel de admin)
export const tieneEditorPropio = (tipo) => Boolean(EDITORES_PROPIOS[tipo]);

export default obtenerEditor;
