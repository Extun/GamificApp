// Registro frontend de tipos de actividad (SPEC-006) — espejo del registro de
// IA del servidor. Una sola fuente para: etiquetas/emoji en las UI del docente
// y del estudiante, y el reproductor que corresponde a cada slug de `tipo`.
// Agregar un juego = una entrada aquí + su reproductor.
import { JuegoDragAndDrop } from '../clasificador/JuegoDragAndDrop';
import { Memorama } from './Memorama';
import { LineaTiempo } from './LineaTiempo';
import { CompletarEspacios } from './CompletarEspacios';

// Todos los tipos de actividad conocidos (para etiquetas en el panel docente).
export const TIPOS_ACTIVIDAD = {
    quiz: { etiqueta: 'Quiz', emoji: '✨' },
    mision: { etiqueta: 'Misión', emoji: '🗺️' },
    clasificador: { etiqueta: 'Clasificador', emoji: '🧩' },
    memorama: { etiqueta: 'Memorama', emoji: '🃏' },
    'linea-tiempo': { etiqueta: 'Línea del tiempo', emoji: '⏳' },
    completar: { etiqueta: 'Completar espacios', emoji: '✏️' }
};

export const etiquetaTipo = (tipo) => TIPOS_ACTIVIDAD[tipo]?.etiqueta || tipo;

// Juegos que se listan y despachan en la pestaña "Juegos" del estudiante
// (quiz y misión tienen sus propias pestañas/reproductores).
// `resumen(config)` describe el contenido con datos reales de la configuración.
export const JUEGOS_UI = {
    clasificador: {
        ...TIPOS_ACTIVIDAD.clasificador,
        Player: JuegoDragAndDrop,
        resumen: (config) => `${config?.categorias?.length || 0} categorías`
    },
    memorama: {
        ...TIPOS_ACTIVIDAD.memorama,
        Player: Memorama,
        resumen: (config) => `${config?.parejas?.length || 0} parejas`
    },
    'linea-tiempo': {
        ...TIPOS_ACTIVIDAD['linea-tiempo'],
        Player: LineaTiempo,
        resumen: (config) => `${config?.eventos?.length || 0} eventos para ordenar`
    },
    completar: {
        ...TIPOS_ACTIVIDAD.completar,
        Player: CompletarEspacios,
        resumen: (config) => `${config?.frases?.length || 0} frases`
    }
};

// ¿La configuración trae contenido jugable? (evita listar retos corruptos)
export const juegoJugable = (reto) => {
    const c = reto?.configuracion;
    switch (reto?.tipo) {
        case 'clasificador': return Boolean(c?.categorias?.length);
        case 'memorama': return Boolean(c?.parejas?.length);
        case 'linea-tiempo': return Boolean(c?.eventos?.length);
        case 'completar': return Boolean(c?.frases?.length);
        default: return false;
    }
};

export default JUEGOS_UI;
