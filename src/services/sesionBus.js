// Bus de la sesión (SPEC-024), separado de React por el mismo motivo que
// `toastBus.js`: quien detecta que la sesión murió es `authFetch`, un servicio
// sin acceso al router ni al árbol de componentes. Publica aquí; el
// <GuardiaDeSesion/> de App.jsx escucha, avisa y navega.
//
// Sin guardia montado, publicar no hace nada (ni falla).

let oyenteSesion = null;
let oyenteActividad = null;

// Actividad en curso: un intento de juego/quiz con progreso real sin terminar.
// Vive fuera de React porque lo publica un hook (useGuardiaActividad, dentro
// del panel del estudiante) y lo consume el guardia (fuera de los paneles).
let actividadEnCurso = false;

export function suscribirSesion(fn) {
    oyenteSesion = fn;
    return () => { if (oyenteSesion === fn) oyenteSesion = null; };
}

export function suscribirActividad(fn) {
    oyenteActividad = fn;
    return () => { if (oyenteActividad === fn) oyenteActividad = null; };
}

// La sesión dejó de valer (401 del servidor, token caducado o cierre en otra
// pestaña). `motivo` es informativo: hoy solo cambia el texto del aviso.
export function avisarSesionCaida(motivo = 'expirada') {
    oyenteSesion?.(motivo);
}

export function marcarActividadEnCurso(valor) {
    const nuevo = Boolean(valor);
    if (nuevo === actividadEnCurso) return;
    actividadEnCurso = nuevo;
    oyenteActividad?.(nuevo);
}

export const hayActividadEnCurso = () => actividadEnCurso;
