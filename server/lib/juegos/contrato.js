// Contrato de un tipo de juego (SPEC-017, Fase 1).
//
// POR QUÉ EXISTE ESTA GUARDIA:
// `totalEsperado` no es un dato informativo, es un CONTROL DE SEGURIDAD.
// routes/progreso.js lo usa para rechazar intentos falsificados y, si devuelve
// null, bloquea el registro de progreso con HTTP 400. Un juego registrado sin
// esa función se creaba bien, se publicaba bien, se jugaba bien... y fallaba
// justo cuando un niño terminaba la actividad, perdiendo su XP y su nota.
//
// Por eso el servidor NO ARRANCA si un tipo está incompleto: es preferible un
// error ruidoso en el despliegue a un fallo silencioso sufrido por un
// estudiante (SPEC-017 §1.2 y §4.3).

// Campos sin los cuales un tipo puede comprometer validación, evaluación o
// progreso. Todos son funciones o texto obligatorio.
const OBLIGATORIOS = [
    ['tipo', 'string'],
    ['etiqueta', 'string'],
    ['validarConfig', 'function'],   // publicar/guardar: forma de configuracion_json
    ['totalEsperado', 'function'],   // 🔴 seguridad de POST /api/progreso
    ['verboAuditoria', 'string']     // descripción legible en la bitácora
];

// Bloques opcionales: si están, deben estar COMPLETOS. Un `ia` a medias es
// peor que no tenerlo (falla al generar, no al registrar).
const BLOQUES_OPCIONALES = {
    ia: ['schema', 'rango', 'construirPrompt', 'normalizar'],
    banco: ['validarItem', 'resumenItem', 'claveItems']
};

// Devuelve la lista de problemas de UN tipo (vacía si está bien).
export const verificarTipo = (def) => {
    const errores = [];
    const nombre = def?.tipo ?? '(sin tipo)';

    for (const [campo, esperado] of OBLIGATORIOS) {
        const valor = def?.[campo];
        if (valor === undefined || valor === null) {
            errores.push(`"${nombre}": falta el campo obligatorio "${campo}"`);
        } else if (typeof valor !== esperado) {
            errores.push(`"${nombre}": "${campo}" debe ser ${esperado}, es ${typeof valor}`);
        }
    }

    if (!def?.capacidades || typeof def.capacidades !== 'object') {
        errores.push(`"${nombre}": falta el objeto "capacidades"`);
    }

    for (const [bloque, claves] of Object.entries(BLOQUES_OPCIONALES)) {
        const valor = def?.[bloque];
        if (valor === undefined || valor === null) continue;   // opcional: no declararlo es válido
        for (const clave of claves) {
            if (valor[clave] === undefined || valor[clave] === null) {
                errores.push(`"${nombre}": el bloque "${bloque}" está incompleto (falta "${clave}")`);
            }
        }
    }

    // Coherencia entre capacidades declaradas y bloques implementados: evita
    // que el panel de administración prometa algo que el código no soporta.
    if (def?.capacidades?.ia && !def?.ia) {
        errores.push(`"${nombre}": declara capacidad "ia" pero no implementa el bloque "ia"`);
    }
    if (def?.capacidades?.banco && !def?.banco) {
        errores.push(`"${nombre}": declara capacidad "banco" pero no implementa el bloque "banco"`);
    }

    return errores;
};

// Verifica el registro completo. Lanza si algo está mal: se llama al arrancar.
export const verificarRegistro = (registro) => {
    const errores = [];
    for (const [clave, def] of Object.entries(registro)) {
        if (clave !== def?.tipo) {
            errores.push(`La clave "${clave}" no coincide con def.tipo "${def?.tipo}"`);
        }
        errores.push(...verificarTipo(def));
    }
    if (errores.length) {
        throw new Error(
            'Registro de juegos incompleto (SPEC-017). El servidor no arranca para evitar ' +
            'que un juego mal registrado falle cuando un estudiante termine su actividad:\n  - ' +
            errores.join('\n  - ')
        );
    }
    return true;
};

export default verificarRegistro;
