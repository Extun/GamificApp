// Sanitización y registro de errores de IA (SPEC-016).
//
// PROBLEMA QUE RESUELVE: los SDK de los proveedores incluyen fragmentos de la
// API key en sus mensajes de error. OpenAI, por ejemplo, responde
// "Incorrect API key provided: sk-abcd1234****WXYZ". Volcar `err.message` en
// consola dejaba ese fragmento en los logs de Render.
//
// REGLA: nunca se registra el objeto de error crudo ni su mensaje sin filtrar.
// Se registra una línea construida con campos controlados (proveedor,
// operación, categoría, código HTTP, modelo) más el mensaje YA depurado.
//
// Centralizado aquí a propósito: aplica a Gemini, a OpenAI y a cualquier
// proveedor futuro sin que su adaptador tenga que acordarse de nada.

const REDACTADO = '[credencial-redactada]';

// Patrones de credencial conocidos y genéricos. Incluyen las formas
// PARCIALMENTE enmascaradas (con asteriscos) que usan los propios SDK.
const PATRONES = [
    /sk-[A-Za-z0-9_\-*]{4,}/g,                       // OpenAI (incl. enmascaradas)
    /AIza[A-Za-z0-9_\-*]{4,}/g,                      // Google API keys
    /\b(?:Bearer|Basic)\s+[A-Za-z0-9._\-*]+/gi,      // cabeceras de autorización
    /\b(?:api[-_]?key|authorization|x-goog-api-key|token|secret|password)\b\s*[:=]\s*["']?[^\s"',}]+/gi,
    /[?&](?:key|api_?key|access_token)=[^&\s]+/gi,   // credencial en query string
    /\b[A-Za-z0-9_-]{6,}\*{3,}[A-Za-z0-9_-]{2,}\b/g  // cualquier forma enmascarada
];

// Valores REALES de las variables de entorno: la garantía más fuerte. Si el
// secreto (o un prefijo suyo de 6+ caracteres, que es lo que dejan ver los
// mensajes enmascarados) aparece en el texto, se elimina.
const VARIABLES_SECRETAS = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'JWT_SECRET', 'DB_PASSWORD'];

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const redactarValoresReales = (texto) => {
    let salida = texto;
    for (const nombre of VARIABLES_SECRETAS) {
        const valor = process.env[nombre];
        if (!valor || valor.length < 6) continue;
        salida = salida.split(valor).join(REDACTADO);
        // Prefijo: los SDK suelen mostrar los primeros caracteres en claro.
        const prefijo = valor.slice(0, 6);
        if (prefijo.length >= 6) {
            salida = salida.replace(new RegExp(escapar(prefijo) + '[A-Za-z0-9_\\-*]*', 'g'), REDACTADO);
        }
    }
    return salida;
};

const LARGO_MAXIMO = 300;

// Deja un mensaje apto para logs: sin credenciales y acotado en longitud.
export const sanitizarMensaje = (mensaje) => {
    let texto = String(mensaje ?? '').replace(/\s+/g, ' ').trim();
    if (!texto) return 'sin mensaje';
    texto = redactarValoresReales(texto);
    for (const patron of PATRONES) texto = texto.replace(patron, REDACTADO);
    return texto.length > LARGO_MAXIMO ? `${texto.slice(0, LARGO_MAXIMO)}…` : texto;
};

// Datos técnicos NO sensibles que sí conviene conservar para diagnosticar.
export const detalleError = (err) => ({
    status: err?.status ?? err?.code ?? null,
    tipo: err?.name ?? null
});

// Registra una línea de log segura. Nunca recibe ni imprime el objeto crudo.
export const registrarErrorIA = ({ operacion, proveedor = null, modelo = null, categoria = null, error }) => {
    const { status, tipo } = detalleError(error);
    const campos = [
        `op=${operacion}`,
        proveedor && `proveedor=${proveedor}`,
        modelo && `modelo=${modelo}`,
        categoria && `categoria=${categoria}`,
        status && `status=${status}`,
        tipo && `tipo=${tipo}`
    ].filter(Boolean).join(' ');
    console.error(`IA[${campos}]: ${sanitizarMensaje(error?.message)}`);
};

export default registrarErrorIA;
