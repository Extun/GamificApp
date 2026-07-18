// SPEC-014 Fase 5 — "Nombre localiza, PIN decide".
//
// Piezas puras del soporte de estudiantes homónimos en el login, separadas
// de las rutas para poder probarlas sin BD (bcryptjs es la única
// dependencia). auth.js las usa; nada aquí toca MySQL ni Express.
import bcrypt from 'bcryptjs';

// Entre varias cuentas candidatas con el mismo nombre, la que coincide con
// el PIN es la buena. Devuelve la fila ganadora o null. Ignora candidatas
// sin pin_hash (cuentas a medio crear). La colisión de PINs entre homónimos
// es imposible por construcción (importación + cambiar-pin la impiden), así
// que a lo sumo una candidata puede coincidir.
export const elegirPorPin = async (candidatas, pin) => {
    for (const fila of candidatas) {
        if (fila?.pin_hash && await bcrypt.compare(String(pin), fila.pin_hash)) {
            return fila;
        }
    }
    return null;
};

// ¿El PIN nuevo chocaría con el de algún homónimo? (cambiar-pin lo rechaza
// para que el login nunca pueda autenticar ambiguamente a dos cuentas.)
export const pinColisionaConHomonimos = async (pinNuevo, homonimos) => {
    for (const fila of homonimos) {
        if (fila?.pin_hash && await bcrypt.compare(String(pinNuevo), fila.pin_hash)) {
            return true;
        }
    }
    return false;
};

// Limitador en memoria POR NOMBRE para el caso de varias candidatas: los
// fallos no tocan `intentos_fallidos` de ninguna cuenta (nadie hereda
// bloqueos persistentes de un homónimo), pero el nombre se enfría igual que
// una cuenta individual (5 fallos → 15 min). Mismo patrón que el limitador
// por IP de server.js: instancia única de Render, con poda periódica.
export const crearLimitadorNombres = ({ maxFallos = 5, minutosBloqueo = 15, msPoda = 10 * 60 * 1000 } = {}) => {
    const fallos = new Map();   // nombre → { cuenta, hasta }

    const bloqueado = (nombre) => {
        const reg = fallos.get(nombre);
        return Boolean(reg?.hasta && reg.hasta > Date.now());
    };

    // Registra un fallo; devuelve true si ese fallo activó el bloqueo.
    const fallo = (nombre) => {
        const reg = fallos.get(nombre) || { cuenta: 0, hasta: null };
        reg.cuenta += 1;
        if (reg.cuenta >= maxFallos) {
            reg.hasta = Date.now() + minutosBloqueo * 60 * 1000;
            reg.cuenta = 0;
        }
        fallos.set(nombre, reg);
        return Boolean(reg.hasta && reg.hasta > Date.now());
    };

    const exito = (nombre) => fallos.delete(nombre);

    // Poda para que el mapa no crezca sin límite. unref(): no mantiene vivo
    // el proceso (igual que el limitador de server.js).
    const timer = setInterval(() => {
        const ahora = Date.now();
        for (const [nombre, reg] of fallos) {
            if (!reg.hasta || reg.hasta < ahora) fallos.delete(nombre);
        }
    }, msPoda);
    timer.unref?.();

    return { bloqueado, fallo, exito };
};
