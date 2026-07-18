// SPEC-014 — Validador PURO de la carga masiva de estudiantes.
//
// Sin imports de BD ni de middleware a propósito: todo lo que necesita del
// mundo exterior llega en el `contexto`, así el validador se puede probar
// con node a secas (no hay MySQL local). Las rutas (estudiantesImport.js)
// arman el contexto con consultas reales y aplican aquí las mismas reglas
// tanto en /analizar como en /confirmar.

export const LIMITE_FILAS = 60;
export const EDAD_MINIMA = 4;
export const EDAD_MAXIMA = 15;

// Misma normalización que el login (routes/auth.js): minúsculas y espacios
// colapsados. Se duplica aquí (una línea) para no arrastrar los imports de
// auth.js, que exigen JWT_SECRET al cargar.
export const normalizar = (texto) =>
    String(texto || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Clave de comparación que imita a utf8mb4_spanish_ci: sin tildes ni
// mayúsculas ("José" == "Jose"), que es como la BD decide los duplicados.
export const claveComparable = (texto) =>
    normalizar(texto).normalize('NFD').replace(/\p{M}/gu, '');

// Clave de identidad de una fila dentro de su curso.
export const claveEstudiante = (nombres, apellidos) =>
    `${claveComparable(nombres)}|${claveComparable(apellidos)}`;

// Solo letras (con tildes/ñ/ü), espacios, guiones y apóstrofos.
const NOMBRE_VALIDO = /^[\p{L}][\p{L}\s'’-]*$/u;

// PIN inicial = fecha de nacimiento DDMMAA ("2017-03-15" → "150317").
export const pinDesdeFechaISO = (iso) => {
    const [anio, mes, dia] = String(iso).slice(0, 10).split('-');
    return `${dia}${mes}${anio.slice(2)}`;
};

// ¿La fecha ISO existe de verdad? (rechaza 2017-02-31 y similares)
const esFechaReal = (iso) => {
    const [a, m, d] = iso.split('-').map(Number);
    const fecha = new Date(Date.UTC(a, m - 1, d));
    return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
};

// Acepta lo que Excel puede producir: "AAAA-MM-DD", "DD/MM/AAAA" (también
// con guiones) y el número de serie de Excel (días desde 1899-12-30).
// Devuelve "AAAA-MM-DD" o null si no se entiende.
export const parsearFecha = (valor) => {
    if (valor === null || valor === undefined || valor === '') return null;
    const texto = String(valor).trim();

    let iso = null;
    let match;
    if ((match = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
        iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    } else if ((match = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) {
        iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    } else if (/^\d{4,5}$/.test(texto)) {
        // Serie de Excel: 1899-12-30 + n días. 4-5 dígitos cubre 1927-2173.
        const fecha = new Date(Date.UTC(1899, 11, 30) + Number(texto) * 86400000);
        iso = fecha.toISOString().slice(0, 10);
    }
    return iso && esFechaReal(iso) ? iso : null;
};

const edadEnAnios = (iso, hoy = new Date()) => {
    const nacimiento = new Date(`${iso}T00:00:00Z`);
    let edad = hoy.getUTCFullYear() - nacimiento.getUTCFullYear();
    const cumpleEsteAnio = new Date(Date.UTC(hoy.getUTCFullYear(), nacimiento.getUTCMonth(), nacimiento.getUTCDate()));
    if (hoy < cumpleEsteAnio) edad -= 1;
    return edad;
};

const validarNombrePropio = (valor, etiqueta) => {
    const texto = String(valor || '').trim().replace(/\s+/g, ' ');
    if (texto.length < 2) return { error: `${etiqueta} vacío o demasiado corto` };
    if (texto.length > 80) return { error: `${etiqueta} demasiado largo (máximo 80 caracteres)` };
    if (!NOMBRE_VALIDO.test(texto)) return { error: `${etiqueta} contiene caracteres no permitidos` };
    return { texto };
};

// ---- Validación completa de una importación ----
//
// filas: [{ fila, nombres, apellidos, fecha_nacimiento }] (fila = nº en Excel)
// contexto: {
//   existentesEnCurso:  Set(claveEstudiante)   → ya registrados en ESTE curso
//   fechasPorHomonimo:  Map(nombre_norm comparable → Set("AAAA-MM-DD"))
//                       → estudiantes de TODA la BD, para el choque
//                         nombre + fecha (PINs iniciales idénticos)
//   hoy?: Date          → inyectable en pruebas
// }
//
// Devuelve { resultados, validos, errores, omitidos }. Cada resultado:
// { fila, nombres, apellidos, fecha_nacimiento, estado, motivo }
// con estado ∈ 'valido' | 'error' | 'omitido'.
export const validarImportacion = (filas, contexto = {}) => {
    const {
        existentesEnCurso = new Set(),
        fechasPorHomonimo = new Map(),
        hoy = new Date()
    } = contexto;

    if (!Array.isArray(filas) || filas.length === 0) {
        return { resultados: [], validos: 0, errores: 0, omitidos: 0, errorGeneral: 'El archivo no tiene filas de estudiantes' };
    }
    if (filas.length > LIMITE_FILAS) {
        return { resultados: [], validos: 0, errores: 0, omitidos: 0, errorGeneral: `Máximo ${LIMITE_FILAS} estudiantes por importación (el archivo tiene ${filas.length})` };
    }

    // Estado acumulado del propio archivo (dedupe interno).
    const vistosEnArchivo = new Set();                    // claveEstudiante
    const fechasEnArchivo = new Map();                    // nombre comparable → Set(fechas)

    const resultados = filas.map((cruda, i) => {
        const fila = Number(cruda?.fila) || i + 2;        // +2: cabecera del Excel
        const base = { fila, nombres: String(cruda?.nombres || '').trim(), apellidos: String(cruda?.apellidos || '').trim(), fecha_nacimiento: null };

        const nom = validarNombrePropio(cruda?.nombres, 'Nombres');
        if (nom.error) return { ...base, estado: 'error', motivo: nom.error };
        const ape = validarNombrePropio(cruda?.apellidos, 'Apellidos');
        if (ape.error) return { ...base, estado: 'error', motivo: ape.error };

        const fechaISO = parsearFecha(cruda?.fecha_nacimiento);
        if (!fechaISO) {
            return { ...base, estado: 'error', motivo: 'Fecha de nacimiento vacía o inválida (usa AAAA-MM-DD o DD/MM/AAAA)' };
        }
        const edad = edadEnAnios(fechaISO, hoy);
        if (edad < EDAD_MINIMA || edad > EDAD_MAXIMA) {
            return { ...base, estado: 'error', motivo: `La fecha da una edad de ${edad} años (se esperan ${EDAD_MINIMA}–${EDAD_MAXIMA})` };
        }

        const listo = { ...base, nombres: nom.texto, apellidos: ape.texto, fecha_nacimiento: fechaISO };
        const clave = claveEstudiante(nom.texto, ape.texto);
        const nombreComparable = claveComparable(`${nom.texto} ${ape.texto}`);

        // Duplicado dentro del propio archivo (mismo curso siempre).
        if (vistosEnArchivo.has(clave)) {
            return { ...listo, estado: 'error', motivo: 'Estudiante repetido en el archivo' };
        }

        // Ya registrado en este curso → omitir sin drama.
        if (existentesEnCurso.has(clave)) {
            vistosEnArchivo.add(clave);
            return { ...listo, estado: 'omitido', motivo: 'Ya está registrado en este curso' };
        }

        // Homónimo (en BD o en el archivo) con la MISMA fecha de nacimiento:
        // tendrían PIN inicial idéntico y el login no podría distinguirlos.
        const fechasBD = fechasPorHomonimo.get(nombreComparable);
        const fechasArchivo = fechasEnArchivo.get(nombreComparable);
        if (fechasBD?.has(fechaISO) || fechasArchivo?.has(fechaISO)) {
            return {
                ...listo, estado: 'error',
                motivo: 'Hay otro estudiante con el mismo nombre y fecha de nacimiento. Agrega el segundo nombre o apellido para diferenciarlos.'
            };
        }

        vistosEnArchivo.add(clave);
        if (!fechasEnArchivo.has(nombreComparable)) fechasEnArchivo.set(nombreComparable, new Set());
        fechasEnArchivo.get(nombreComparable).add(fechaISO);
        return { ...listo, estado: 'valido', motivo: null };
    });

    return {
        resultados,
        validos: resultados.filter((r) => r.estado === 'valido').length,
        errores: resultados.filter((r) => r.estado === 'error').length,
        omitidos: resultados.filter((r) => r.estado === 'omitido').length
    };
};

// Username interno único: el nombre normalizado y, si está tomado, el sufijo
// invisible ~2, ~3… El estudiante NUNCA ve ni teclea este valor; el login
// localiza por nombre_norm. `ocupados` compara en forma comparable (como la
// BD, que es case/accent-insensitive en username).
export const usernameDisponible = (nombreNorm, ocupados) => {
    const libre = (candidato) => !ocupados.has(claveComparable(candidato));
    if (libre(nombreNorm)) return nombreNorm;
    for (let n = 2; n < 100; n++) {
        const candidato = `${nombreNorm}~${n}`;
        if (libre(candidato)) return candidato;
    }
    // 99 homónimos exactos: imposible en la práctica; que explote la unicidad de BD.
    return `${nombreNorm}~${Date.now()}`;
};
