// Bus del sistema de toasts (SPEC-018 Fase 4), separado del componente para
// que cualquier código (páginas, servicios, handlers) pueda avisar sin
// importar React: `toast.exito('…')`. El <ToastHost/> de Toast.jsx se
// suscribe aquí y pinta. Sin host montado, publicar no hace nada (ni falla).
let siguienteId = 1;
let oyente = null;

export function suscribir(fn) {
    oyente = fn;
    return () => { if (oyente === fn) oyente = null; };
}

function publicar(tipo, mensaje, opciones = {}) {
    oyente?.({ id: siguienteId++, tipo, mensaje, duracion: opciones.duracion });
}

export const toast = {
    exito: (mensaje, opciones) => publicar('exito', mensaje, opciones),
    error: (mensaje, opciones) => publicar('error', mensaje, opciones),
    aviso: (mensaje, opciones) => publicar('aviso', mensaje, opciones),
    info: (mensaje, opciones) => publicar('info', mensaje, opciones)
};
